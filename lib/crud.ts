import pool from "@/lib/db";
import {
  conflict,
  withAuth,
  ok,
  created,
  err,
  badRequest,
  notFound,
  forbidden,
  companyScope,
  isSuperAdmin,
  type AuthUser,
} from "@/lib/api-utils";
import { requirePermission } from "@/lib/permissions";
import { logParkingAudit, type ParkingAuditAction } from "@/lib/audit";

export interface CrudConfig {
  /** Table name (trusted constant, never user input). */
  table: string;
  /** Permission resource, e.g. "parking_sites". */
  resource: string;
  /** Whitelisted writable columns. */
  columns: string[];
  /** Columns searched with ILIKE on ?q= */
  searchable?: string[];
  /** Columns filterable with exact match on ?<col>= */
  filters?: string[];
  /** ORDER BY expression (trusted constant). */
  orderBy?: string;
  /** SELECT column list; defaults to alias.* */
  selectColumns?: string;
  /** Extra JOIN / FROM clause appended after the table. */
  joins?: string;
  /** Preferred conflicting column for duplicate detection (?q uniqueness not used). */
  uniqueColumn?: string;
  /** Audit entity label; defaults to table. */
  auditEntity?: string;
  /** Column used for company scoping; defaults to company_id. */
  companyColumn?: string;
  /** Whether the item lookup should expose a numeric id. */
  idColumn?: string;
  /**
   * Optional delete guard: return an error message string to block deletion
   * (e.g. a parking space with an active session), or null to proceed.
   */
  deleteGuard?: (existing: Record<string, any>) => Promise<string | null>;
}

function pickWritable(body: any, columns: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const c of columns) {
    if (body[c] !== undefined) out[c] = body[c];
  }
  return out;
}

export function createCrudHandlers(cfg: CrudConfig) {
  const {
    table,
    resource,
    columns,
    searchable = [],
    filters = [],
    orderBy = "id DESC",
    selectColumns,
    joins = "",
    auditEntity = table,
    companyColumn = "company_id",
    idColumn = "id",
  } = cfg;

  const alias = table;

  async function GET(req: Request) {
    return withAuth(req, async (user) => {
      const perm = await requirePermission(user, "view", resource);
      if (!perm.allowed) return forbidden();

      const { searchParams } = new URL(req.url);
      const params: unknown[] = [];
      const where: string[] = ["1=1"];
      const scope = companyScope(user, params, `${alias}.${companyColumn}`);
      where.push(`1=1${scope}`);

      const q = searchParams.get("q");
      if (q && searchable.length) {
        params.push(`%${q}%`);
        const idx = params.length;
        where.push(`(${searchable.map((c) => `${alias}.${c} ILIKE $${idx}`).join(" OR ")})`);
      }

      for (const f of filters) {
        const val = searchParams.get(f);
        if (val !== null && val !== "") {
          params.push(val);
          where.push(`${alias}.${f} = $${params.length}`);
        }
      }

      const limit = Math.min(parseInt(searchParams.get("limit") || "500", 10) || 500, 2000);

      try {
        const select = selectColumns || `${alias}.*`;
        const sql = `SELECT ${select} FROM ${table} ${alias} ${joins}
                     WHERE ${where.join(" AND ")}
                     ORDER BY ${alias}.${orderBy} LIMIT ${limit}`;
        const res = await pool.query(sql, params);
        return ok(res.rows);
      } catch (e: any) {
        return err(e.message);
      }
    });
  }

  async function POST(req: Request) {
    return withAuth(req, async (user) => {
      const perm = await requirePermission(user, "create", resource);
      if (!perm.allowed) return forbidden();

      try {
        const body = await req.json();
        const data = pickWritable(body, columns);

        const effectiveCompany = isSuperAdmin(user)
          ? body.company_id ?? user.company_id
          : user.company_id;
        if (companyColumn) {
          if (!effectiveCompany) return badRequest("company_id is required");
          data[companyColumn] = effectiveCompany;
        }

        const keys = Object.keys(data);
        if (keys.length === 0) return badRequest("No valid fields provided");

        const placeholders = keys.map((_, i) => `$${i + 1}`);
        const sql = `INSERT INTO ${table} (${keys.join(", ")})
                     VALUES (${placeholders.join(", ")}) RETURNING *`;
        const res = await pool.query(sql, keys.map((k) => data[k]));

        await logParkingAudit({
          user,
          company_id: effectiveCompany,
          action: "CREATE" as ParkingAuditAction,
          entity: auditEntity,
          entity_id: res.rows[0][idColumn],
          new_values: res.rows[0],
          req,
        });

        return created(res.rows[0]);
      } catch (e: any) {
        if (String(e.message).includes("duplicate key")) {
          return err("A record with these unique values already exists", 409);
        }
        return err(e.message);
      }
    });
  }

  return { GET, POST };
}

export function createItemHandlers(cfg: CrudConfig) {
  const {
    table,
    resource,
    columns,
    auditEntity = table,
    companyColumn = "company_id",
    idColumn = "id",
    selectColumns,
    joins = "",
    deleteGuard,
  } = cfg;

  const alias = table;

  async function loadScoped(user: AuthUser, id: string) {
    const params: unknown[] = [id];
    const scope = companyScope(user, params, `${alias}.${companyColumn}`);
    const select = selectColumns || `${alias}.*`;
    const res = await pool.query(
      `SELECT ${select} FROM ${table} ${alias} ${joins}
       WHERE ${alias}.${idColumn} = $1${scope} LIMIT 1`,
      params
    );
    return res.rows[0] || null;
  }

  async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
    return withAuth(req, async (user) => {
      const perm = await requirePermission(user, "view", resource);
      if (!perm.allowed) return forbidden();
      const { id } = await ctx.params;
      const row = await loadScoped(user, id);
      if (!row) return notFound();
      return ok(row);
    });
  }

  async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
    return withAuth(req, async (user) => {
      const perm = await requirePermission(user, "edit", resource);
      if (!perm.allowed) return forbidden();
      const { id } = await ctx.params;
      try {
        const existing = await loadScoped(user, id);
        if (!existing) return notFound();
        const body = await req.json();
        const data = pickWritable(body, columns);
        delete data[companyColumn];
        const keys = Object.keys(data);
        if (keys.length === 0) return badRequest("No valid fields provided");

        const sets = keys.map((k, i) => `${k} = $${i + 1}`);
        const values = keys.map((k) => data[k]);
        values.push(id);
        const res = await pool.query(
          `UPDATE ${table} SET ${sets.join(", ")} WHERE ${idColumn} = $${values.length} RETURNING *`,
          values
        );

        await logParkingAudit({
          user,
          company_id: existing[companyColumn],
          action: "UPDATE",
          entity: auditEntity,
          entity_id: id,
          old_values: existing,
          new_values: res.rows[0],
          req,
        });
        return ok(res.rows[0]);
      } catch (e: any) {
        return err(e.message);
      }
    });
  }

  async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
    return withAuth(req, async (user) => {
      const perm = await requirePermission(user, "delete", resource);
      if (!perm.allowed) return forbidden();
      const { id } = await ctx.params;
      try {
        const existing = await loadScoped(user, id);
        if (!existing) return notFound();
        if (deleteGuard) {
          const violation = await deleteGuard(existing);
          if (violation) return conflict(violation);
        }
        await pool.query(`DELETE FROM ${table} WHERE ${idColumn} = $1`, [id]);
        await logParkingAudit({
          user,
          company_id: existing[companyColumn],
          action: "DELETE",
          entity: auditEntity,
          entity_id: id,
          old_values: existing,
          req,
        });
        return ok({ message: "Deleted" });
      } catch (e: any) {
        return err(e.message);
      }
    });
  }

  return { GET, PUT, DELETE };
}
