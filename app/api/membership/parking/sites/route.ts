import { createCrudHandlers } from "@/lib/crud";

/** Parking sites / facilities CRUD. */
export const { GET, POST } = createCrudHandlers({
  table: "parking_sites",
  resource: "parking_sites",
  columns: ["name", "code", "address", "city", "latitude", "longitude", "total_capacity", "contact_name", "contact_phone", "is_active", "notes"],
  searchable: ["name", "code", "city", "address"],
  filters: ["is_active"],
  orderBy: "id DESC",
  auditEntity: "parking_site",
});
