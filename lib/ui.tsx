"use client";
/**
 * Meridian UI kit — the shared design system for the parking app.
 * Built directly on Tailwind + the CSS variable tokens in globals.css.
 * Every interactive component is keyboard accessible and themable.
 */
import {
  createContext, useCallback, useContext, useEffect, useId, useMemo,
  useRef, useState, type ReactNode, type ButtonHTMLAttributes,
  type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle } from "lucide-react";

export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- formatting ------------------------------ */

export function fmtMoney(n: number | string | null | undefined, currency = "ETB"): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  const safe = isFinite(v as number) ? (v as number) : 0;
  return `${currency} ${safe.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtInt(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? parseFloat(n) : n ?? 0;
  return (isFinite(v as number) ? (v as number) : 0).toLocaleString("en-US");
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

export function fmtDuration(minutes: number | null | undefined): string {
  if (minutes == null || !isFinite(minutes)) return "—";
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  if (h < 24) return rm ? `${h}h ${rm}m` : `${h}h`;
  const d = Math.floor(h / 24);
  const rh = h % 24;
  return rh ? `${d}d ${rh}h` : `${d}d`;
}

export function relativeTime(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const suffix = diff >= 0 ? "ago" : "from now";
  if (abs < 60_000) return "just now";
  if (abs < 3_600_000) return `${Math.round(abs / 60_000)}m ${suffix}`;
  if (abs < 86_400_000) return `${Math.round(abs / 3_600_000)}h ${suffix}`;
  return `${Math.round(abs / 86_400_000)}d ${suffix}`;
}

/* --------------------------------- buttons ------------------------------- */

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "danger" | "success";
type ButtonSize = "xs" | "sm" | "md" | "lg";

const BTN_VARIANTS: Record<ButtonVariant, string> = {
  primary: "text-white shadow-sm hover:brightness-110 active:brightness-95",
  secondary: "text-[var(--text-primary)] bg-[var(--surface-sunken)] hover:bg-[var(--surface-hover)] border border-[var(--border-color)]",
  outline: "border border-[var(--border-strong)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  ghost: "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
  danger: "text-white shadow-sm hover:brightness-110",
  success: "text-white shadow-sm hover:brightness-110",
};

const BTN_SIZES: Record<ButtonSize, string> = {
  xs: "h-7 px-2 text-xs gap-1 rounded-lg",
  sm: "h-8.5 px-3 text-[13px] gap-1.5 rounded-lg",
  md: "h-10 px-4 text-sm gap-2 rounded-[10px]",
  lg: "h-12 px-6 text-[15px] gap-2 rounded-xl",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export function Button({ variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest }: ButtonProps) {
  const bgStyle =
    variant === "primary"
      ? { background: "var(--primary)" }
      : variant === "danger"
        ? { background: "var(--accent-red)" }
        : variant === "success"
          ? { background: "var(--accent-green)" }
          : undefined;
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center font-semibold transition-all select-none",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--bg)]",
        "disabled:opacity-50 disabled:pointer-events-none active:scale-[0.98]",
        BTN_VARIANTS[variant],
        BTN_SIZES[size],
        className
      )}
      style={{ ...bgStyle, ...(rest.style as any) }}
      disabled={disabled || loading}
      {...rest}
    >
      {loading ? <Loader2 size={size === "xs" ? 12 : 15} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function IconButton({ label, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-[10px] border border-[var(--border-color)] text-[var(--text-secondary)]",
        "transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ---------------------------------- cards -------------------------------- */

export function Card({ children, className, hover, onClick }: { children: ReactNode; className?: string; hover?: boolean; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "rounded-[14px] border border-[var(--card-border)] bg-[var(--card-bg)]",
        "shadow-[var(--shadow-sm)]",
        hover && "transition-shadow hover:shadow-[var(--shadow-md)] cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, actions, icon }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] px-5 py-4">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="text-[var(--text-tertiary)] shrink-0">{icon}</span>}
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[var(--text-primary)]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

/* --------------------------------- badges -------------------------------- */

type BadgeTone = "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "purple";

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: "bg-[var(--surface-sunken)] text-[var(--text-secondary)] border-[var(--border-color)]",
  primary: "bg-[var(--primary-soft)] text-[var(--primary)] border color-mix(in srgb, var(--primary) 25%, transparent)",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20",
  purple: "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20",
};

export function Badge({ children, tone = "neutral", className, dot }: { children: ReactNode; tone?: BadgeTone; className?: string; dot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        BADGE_TONES[tone],
        className
      )}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      {children}
    </span>
  );
}

/* --------------------------------- inputs -------------------------------- */

export function Field({ label, hint, error, required, children, className }: { label?: ReactNode; hint?: ReactNode; error?: ReactNode; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      {label && (
        <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-secondary)]">
          {label}
          {required && <span className="ml-0.5 text-[var(--accent-red)]">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1 text-xs font-medium text-[var(--accent-red)]">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-xs text-[var(--text-tertiary)]">{hint}</p>
      ) : null}
    </div>
  );
}

const INPUT_CLS =
  "w-full rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] px-3 text-sm text-[var(--text-primary)] " +
  "placeholder:text-[var(--text-tertiary)] transition-shadow " +
  "focus:outline-none focus:ring-2 focus:ring-[var(--ring)] focus:border-[var(--primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-60";

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return (
    <input
      className={cn(INPUT_CLS, "h-10", invalid && "border-[var(--accent-red)] focus:ring-red-500/25", className)}
      aria-invalid={invalid || undefined}
      {...rest}
    />
  );
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      className={cn(INPUT_CLS, "h-10 appearance-none bg-[length:16px] pr-8", invalid && "border-[var(--accent-red)]", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2398a2b3' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 10px center",
      }}
      aria-invalid={invalid || undefined}
      {...rest}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(INPUT_CLS, "min-h-[76px] py-2.5", className)} {...rest} />;
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5.5 w-10 shrink-0 items-center rounded-full border transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] disabled:opacity-50"
      )}
      style={{
        background: checked ? "var(--primary)" : "var(--border-strong)",
        borderColor: checked ? "var(--primary)" : "var(--border-strong)",
      }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
        style={{ transform: checked ? "translateX(22px)" : "translateX(2px)" }}
      />
    </button>
  );
}

/* ------------------------------- skeletons ------------------------------- */

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("pk-skeleton", className)} aria-hidden />;
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-5" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-4 flex-1", c === 0 && "max-w-[140px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------- empty state ----------------------------- */

export function EmptyState({ icon, title, body, action, className }: { icon?: ReactNode; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl border border-[var(--card-border)] bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          {icon}
        </div>
      )}
      <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-[13px] text-[var(--text-tertiary)]">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* --------------------------------- tables -------------------------------- */

export interface Column<T> {
  key: string;
  label: ReactNode;
  render?: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  hideBelow?: "sm" | "md" | "lg";
}

export function DataTable<T extends Record<string, any>>({
  columns, rows, rowKey, sort, onSortChange, onRowClick, loading, empty, className,
}: {
  columns: Column<T>[];
  rows: T[] | undefined | null;
  rowKey: (row: T, i: number) => string | number;
  sort?: { key: string; dir: "asc" | "desc" };
  onSortChange?: (key: string) => void;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
  className?: string;
}) {
  const hideCls: Record<string, string> = { sm: "hidden sm:table-cell", md: "hidden md:table-cell", lg: "hidden lg:table-cell" };
  if (loading) return <TableSkeleton cols={Math.min(columns.length, 6)} />;
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--card-border)]">
            {columns.map((c) => (
              <th
                key={c.key}
                className={cn(
                  "px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]",
                  c.align === "right" && "text-right",
                  c.align === "center" && "text-center",
                  c.hideBelow && hideCls[c.hideBelow],
                  c.className
                )}
              >
                {c.sortable && onSortChange ? (
                  <button
                    type="button"
                    onClick={() => onSortChange(c.key)}
                    className={cn(
                      "inline-flex items-center gap-1 uppercase tracking-wider hover:text-[var(--text-primary)]",
                      sort?.key === c.key && "text-[var(--primary)]"
                    )}
                  >
                    {c.label}
                    <span className={cn("text-[9px] transition-transform", sort?.key === c.key && sort.dir === "desc" && "rotate-180")}>▲</span>
                  </button>
                ) : (
                  c.label
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(rows ?? []).map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "border-b border-[var(--card-border)] last:border-0 transition-colors",
                onRowClick && "cursor-pointer hover:bg-[var(--surface-sunken)]"
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-4 py-3 align-middle text-[var(--text-primary)]",
                    c.align === "right" && "text-right pk-num",
                    c.align === "center" && "text-center",
                    c.hideBelow && hideCls[c.hideBelow],
                    c.className
                  )}
                >
                  {c.render ? c.render(row) : String(row[c.key] ?? "—")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows && rows.length === 0 && (empty ?? <EmptyState title="No records found" body="Try adjusting the filters or search term." />)}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--card-border)] px-5 py-3 text-[13px] text-[var(--text-secondary)]">
      <span className="pk-num">
        {from}–{to} of {fmtInt(total)}
      </span>
      <div className="flex items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <span className="px-2 text-[var(--text-tertiary)]">
          Page {page} / {pages}
        </span>
        <Button size="sm" variant="outline" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------- dialog -------------------------------- */

export function Dialog({
  open, onClose, title, subtitle, children, footer, size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && ref.current) {
        const focusables = ref.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    const t = setTimeout(() => {
      ref.current?.querySelector<HTMLElement>("input,select,textarea,button")?.focus();
    }, 50);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      clearTimeout(t);
    };
  }, [open, onClose]);

  if (!open) return null;
  const widths = { sm: "max-w-sm", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="pk-overlay fixed inset-0 z-[70] flex items-end justify-center p-0 sm:items-center sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        className={cn(
          "pk-dialog flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--card-border)] bg-[var(--card-bg)] shadow-[var(--shadow-lg)] sm:rounded-2xl",
          widths[size]
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-[var(--card-border)] px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">{title}</h2>
            {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-tertiary)]">{subtitle}</p>}
          </div>
          <IconButton label="Close dialog" onClick={onClose} className="h-8 w-8 border-0">
            <X size={16} />
          </IconButton>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--card-border)] px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/* ------------------------------ confirm dialog --------------------------- */

export function ConfirmDialog({
  open, onClose, onConfirm, title, body, confirmLabel = "Confirm", danger, loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={danger ? "danger" : "primary"} size="sm" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        {danger && (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-[var(--accent-red)]">
            <AlertTriangle size={17} />
          </div>
        )}
        <div className="text-[13.5px] leading-relaxed text-[var(--text-secondary)]">{body}</div>
      </div>
    </Dialog>
  );
}

/* -------------------------------- dropdown ------------------------------- */

export function Dropdown({ trigger, children, align = "right", width = 220 }: { trigger: ReactNode; children: ReactNode | ((close: () => void) => ReactNode); align?: "left" | "right"; width?: number }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div className="relative" ref={ref}>
      <div onClick={() => setOpen((v) => !v)}>{trigger}</div>
      {open && (
        <div
          role="menu"
          tabIndex={-1}
          className={cn(
            "pk-dialog absolute top-full z-50 mt-2 overflow-hidden rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] py-1 shadow-[var(--shadow-lg)]",
            align === "right" ? "right-0" : "left-0"
          )}
          style={{ minWidth: width }}
        >
          {typeof children === "function" ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({ children, onClick, icon, danger, active }: { children: ReactNode; onClick?: () => void; icon?: ReactNode; danger?: boolean; active?: boolean }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] font-medium transition-colors",
        danger ? "text-[var(--accent-red)] hover:bg-red-500/10" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]",
        active && "text-[var(--primary)]"
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/* --------------------------------- toasts -------------------------------- */

interface Toast {
  id: number;
  title: string;
  body?: string;
  tone: "success" | "error" | "info" | "warning";
}
const ToastContext = createContext<{ push: (t: Omit<Toast, "id">) => void }>({ push: () => {} });

export function useToast() {
  const { push } = useContext(ToastContext);
  return useMemo(
    () => ({
      success: (title: string, body?: string) => push({ title, body, tone: "success" }),
      error: (title: string, body?: string) => push({ title, body, tone: "error" }),
      info: (title: string, body?: string) => push({ title, body, tone: "info" }),
      warning: (title: string, body?: string) => push({ title, body, tone: "warning" }),
    }),
    [push]
  );
}

let toastSeq = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = toastSeq++;
    setToasts((prev) => [...prev.slice(-4), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 4800);
  }, []);
  const value = useMemo(() => ({ push }), [push]);
  const icons = {
    success: <CheckCircle2 size={17} className="text-emerald-500" />,
    error: <XCircle size={17} className="text-[var(--accent-red)]" />,
    info: <Info size={17} className="text-sky-500" />,
    warning: <AlertTriangle size={17} className="text-amber-500" />,
  };
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pk-toast pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3 shadow-[var(--shadow-lg)]"
          >
            <span className="mt-0.5 shrink-0">{icons[t.tone]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold text-[var(--text-primary)]">{t.title}</p>
              {t.body && <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-tertiary)]">{t.body}</p>}
            </div>
            <button
              aria-label="Dismiss"
              className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/* --------------------------- segmented control --------------------------- */

export function Segmented<T extends string>({ options, value, onChange, size = "md" }: { options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; size?: "sm" | "md" }) {
  return (
    <div className={cn("inline-flex items-center gap-0.5 rounded-[10px] border border-[var(--border-color)] bg-[var(--surface-sunken)] p-0.5", size === "sm" ? "h-8" : "h-9.5")} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex h-full items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-[13px] font-medium transition-all",
            value === o.value
              ? "bg-[var(--card-bg)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]"
              : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------ date range ------------------------------- */

export function DateRangeInput({ from, to, onFrom, onTo, className }: { from: string; to: string; onFrom: (v: string) => void; onTo: (v: string) => void; className?: string }) {
  const id = useId();
  return (
    <div className={cn("inline-flex h-10 items-center rounded-[10px] border border-[var(--input-border)] bg-[var(--input-bg)] pl-3 pr-1", className)}>
      <label htmlFor={`${id}-from`} className="sr-only">
        From date
      </label>
      <input
        id={`${id}-from`}
        type="date"
        value={from}
        max={to}
        onChange={(e) => onFrom(e.target.value)}
        className="w-[122px] bg-transparent text-[13px] text-[var(--text-primary)] focus:outline-none"
      />
      <span className="px-1 text-[var(--text-tertiary)]">→</span>
      <label htmlFor={`${id}-to`} className="sr-only">
        To date
      </label>
      <input
        id={`${id}-to`}
        type="date"
        value={to}
        min={from}
        onChange={(e) => onTo(e.target.value)}
        className="w-[122px] bg-transparent text-[13px] text-[var(--text-primary)] focus:outline-none"
      />
    </div>
  );
}

/* -------------------------------- progress ------------------------------- */

export function Progress({ value, tone = "primary", className }: { value: number; tone?: "primary" | "success" | "warning" | "danger"; className?: string }) {
  const colors = { primary: "var(--primary)", success: "var(--accent-green)", warning: "var(--accent-amber)", danger: "var(--accent-red)" };
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]", className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: colors[tone] }} />
    </div>
  );
}

/* --------------------------------- KPI ----------------------------------- */

export function TrendPill({ current, previous }: { current: number; previous: number }) {
  if (!isFinite(current) || !isFinite(previous) || (previous === 0 && current === 0)) return null;
  let pct: number | null = null;
  if (previous === 0) pct = current > 0 ? 100 : null;
  else pct = Math.round(((current - previous) / previous) * 100);
  if (pct === null) return <span className="text-[11px] text-[var(--text-tertiary)]">vs previous day</span>;
  const up = pct >= 0;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[11px] font-semibold pk-num", up ? "text-emerald-600 dark:text-emerald-400" : "text-[var(--accent-red)]")}>
      {up ? "▲" : "▼"} {Math.abs(pct)}% <span className="font-normal text-[var(--text-tertiary)]">vs prev</span>
    </span>
  );
}
