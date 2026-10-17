import { ReactNode } from "react";

export function GemCard({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl p-5 ${className}`}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--shadow-sm)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </div>
  );
}

export function GemCardBare({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl overflow-hidden ${className}`}
      style={{
        background: "var(--card-bg)",
        border: "1px solid var(--card-border)",
        boxShadow: "var(--shadow-sm)",
        color: "var(--text-primary)",
      }}
    >
      {children}
    </div>
  );
}

export function GemHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap justify-between items-center gap-4 mb-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>{title}</h1>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3">{actions}</div>}
    </div>
  );
}

export function GemKpi({ title, value, icon, color = "bg-gray-900" }: { title: string; value: string | number; icon: ReactNode; color?: string }) {
  return (
    <GemCard>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--text-secondary)" }}>{title}</p>
          <h2 className="text-2xl font-bold mt-1" style={{ color: "var(--text-primary)" }}>{value}</h2>
        </div>
        <div className={`${color} text-white p-3.5 rounded-2xl`}>{icon}</div>
      </div>
    </GemCard>
  );
}

export function GemBtn({ children, onClick, className = "", ...props }: { children: ReactNode; onClick?: () => void; className?: string; [key: string]: any }) {
  return (
    <button
      className={`px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all active:scale-[0.97] inline-flex items-center gap-2 shadow-sm ${className}`}
      style={{ background: "var(--accent-gradient)" }}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
}

export function GemBtnOutline({ children, onClick, className = "" }: { children: ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      className={`border px-4 py-2.5 rounded-xl font-semibold text-sm transition-all inline-flex items-center gap-2 ${className}`}
      style={{ borderColor: "var(--border-color)", color: "var(--text-secondary)" }}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function GemTable({ headers, rows }: { headers: string[]; rows?: ReactNode[][] }) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return (
    <table className="w-full" style={{ color: "var(--text-primary)" }}>
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              className={`text-left text-xs font-semibold uppercase tracking-wider pb-3 ${i === 0 ? "" : "text-center"}`}
              style={{ color: "var(--muted)", borderBottom: "2px solid var(--card-border)" }}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {safeRows.map((row, ri) => (
          <tr key={ri}>
            {(Array.isArray(row) ? row : []).map((cell, ci) => (
              <td
                key={ci}
                className={`py-4 text-sm ${ci === 0 ? "" : "text-center"}`}
                style={{ borderTop: "1px solid var(--card-border)", color: "var(--text-primary)" }}
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function GemBadge({ children, variant = "default", className = "" }: { children: ReactNode; variant?: "default" | "success" | "warning" | "danger" | "info"; className?: string }) {
  const colorMap: Record<string, { bg: string; text: string }> = {
    default: { bg: "var(--sidebar-hover)", text: "var(--text-secondary)" },
    success: { bg: "rgba(34, 197, 94, 0.12)", text: "#22c55e" },
    warning: { bg: "rgba(245, 158, 11, 0.12)", text: "#f59e0b" },
    danger: { bg: "rgba(239, 68, 68, 0.12)", text: "#ef4444" },
    info: { bg: "rgba(59, 130, 246, 0.12)", text: "#3b82f6" },
  };
  const c = colorMap[variant] || colorMap.default;
  return (
    <span
      className={`px-3 py-1 rounded-full text-xs font-semibold inline-block ${className}`}
      style={{ background: c.bg, color: c.text }}
    >
      {children}
    </span>
  );
}

export function GemInput({ className = "", ...props }: React.ComponentProps<"input"> & { className?: string }) {
  return (
    <input
      className={`w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 ${className}`}
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--input-border)",
        color: "var(--text-primary)",
        // @ts-expect-error custom CSS property is not part of CSSProperties
        "--tw-ring-color": "rgba(59, 130, 246, 0.15)",
      }}
      {...props}
    />
  );
}

export function GemSelect({ children, className = "", ...props }: React.ComponentProps<"select"> & { className?: string }) {
  return (
    <select
      className={`w-full rounded-xl px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-2 ${className}`}
      style={{
        background: "var(--input-bg)",
        border: "1px solid var(--input-border)",
        color: "var(--text-primary)",
      }}
      {...props}
    >
      {children}
    </select>
  );
}

export function GemPage({ children }: { children: ReactNode }) {
  return (
    <div style={{ background: "var(--body-bg)", minHeight: "100vh" }} className="p-6">
      {children}
    </div>
  );
}

export function GemAlert({ children, type = "success", onClose, className = "" }: { children: ReactNode; type?: "success" | "danger" | "warning" | "info"; onClose?: () => void; className?: string }) {
  const colorMap: Record<string, { bg: string; text: string; border: string }> = {
    success: { bg: "rgba(34, 197, 94, 0.08)", text: "#22c55e", border: "rgba(34, 197, 94, 0.2)" },
    danger: { bg: "rgba(239, 68, 68, 0.08)", text: "#ef4444", border: "rgba(239, 68, 68, 0.2)" },
    warning: { bg: "rgba(245, 158, 11, 0.08)", text: "#f59e0b", border: "rgba(245, 158, 11, 0.2)" },
    info: { bg: "rgba(59, 130, 246, 0.08)", text: "#3b82f6", border: "rgba(59, 130, 246, 0.2)" },
  };
  const c = colorMap[type] || colorMap.success;
  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 rounded-xl border mb-6 text-sm font-medium ${className}`}
      style={{ background: c.bg, color: c.text, borderColor: c.border }}
    >
      <div className="flex-1">{children}</div>
      {onClose && <button onClick={onClose} className="opacity-60 hover:opacity-100 transition-opacity">&times;</button>}
    </div>
  );
}

export function GemStatBar({ name, value, color = "var(--accent-sky)" }: { name: string; value: string; color?: string }) {
  return (
    <div>
      <div className="flex justify-between text-sm mb-2">
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>{name}</span>
        <span style={{ color: "var(--text-secondary)" }}>{value}</span>
      </div>
      <div className="h-2.5 rounded-full overflow-hidden" style={{ background: "var(--sidebar-hover)" }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: value, background: color }}
        ></div>
      </div>
    </div>
  );
}
