"use client";
/**
 * Meridian charts — dependency-free SVG chart kit tuned to the design tokens.
 * Responsive via ResizeObserver, hover tooltips, legends, and empty states.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/ui";

function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const el = ref.current;
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight });
    });
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);
  return [ref, size] as const;
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const rawStep = max / count;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) ?? mag * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.001; v += step) ticks.push(Math.round(v * 100) / 100);
  return ticks;
}

export interface SeriesPoint {
  x: string;
  y: number;
}
export interface ChartSeries {
  name: string;
  color: string;
  points: SeriesPoint[];
  area?: boolean;
  dashed?: boolean;
}

const PAD = { top: 14, right: 14, bottom: 26, left: 46 };

/** Multi-series line/area chart with crosshair tooltip. */
export function LineAreaChart({
  series,
  height = 230,
  format = (v: number) => String(v),
  className,
}: {
  series: ChartSeries[];
  height?: number;
  format?: (v: number) => string;
  className?: string;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<{ i: number; x: number } | null>(null);

  const all = series.flatMap((s) => s.points);
  if (all.length === 0 || w === 0) return <div ref={ref} style={{ height }} className={className} />;

  const labels = series[0]?.points.map((p) => p.x) ?? [];
  const maxV = Math.max(1, ...all.map((p) => p.y));
  const ticks = niceTicks(maxV);
  const yMax = ticks[ticks.length - 1];
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const n = labels.length;
  const xAt = (i: number) => PAD.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW);
  const yAt = (v: number) => PAD.top + innerH - (v / yMax) * innerH;

  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(w / 68)));
  const hoverIdx = hover?.i ?? null;

  return (
    <div ref={ref} className={cn("relative", className)} style={{ height }}>
      <svg width={w} height={height} role="img" aria-label="Line chart"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - rect.left;
          const i = Math.max(0, Math.min(n - 1, Math.round(((px - PAD.left) / innerW) * (n - 1))));
          setHover({ i, x: xAt(i) });
        }}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={w - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--card-border)" strokeWidth={1} strokeDasharray={t === 0 ? "0" : "3 4"} />
            <text x={PAD.left - 8} y={yAt(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-tertiary)" className="pk-num">
              {format(t)}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          i % labelEvery === 0 ? (
            <text key={`${l}-${i}`} x={xAt(i)} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">
              {l}
            </text>
          ) : null
        )}
        {series.map((s) => {
          const d = s.points.map((p, i) => `${i === 0 ? "M" : "L"}${xAt(i)},${yAt(p.y)}`).join(" ");
          const areaD = `${d} L${xAt(n - 1)},${PAD.top + innerH} L${xAt(0)},${PAD.top + innerH} Z`;
          return (
            <g key={s.name}>
              {s.area && <path d={areaD} fill={s.color} opacity={0.09} />}
              <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={s.dashed ? "5 5" : undefined} />
            </g>
          );
        })}
        {hoverIdx != null && (
          <g>
            <line x1={xAt(hoverIdx)} x2={xAt(hoverIdx)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--border-strong)" strokeWidth={1} />
            {series.map((s) =>
              s.points[hoverIdx] ? (
                <circle key={s.name} cx={xAt(hoverIdx)} cy={yAt(s.points[hoverIdx].y)} r={3.5} fill="var(--card-bg)" stroke={s.color} strokeWidth={2} />
              ) : null
            )}
          </g>
        )}
      </svg>
      {hoverIdx != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs shadow-[var(--shadow-md)]"
          style={{ left: Math.min(Math.max(hover!.x + 10, 8), w - 150), top: 6, minWidth: 110 }}
        >
          <div className="mb-1 font-semibold text-[var(--text-primary)]">{labels[hoverIdx]}</div>
          {series.map((s) => (
            <div key={s.name} className="flex items-center justify-between gap-3 text-[var(--text-secondary)] pk-num">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: s.color }} />
                {s.name}
              </span>
              <span className="font-semibold text-[var(--text-primary)]">{format(s.points[hoverIdx]?.y ?? 0)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Vertical bar chart with hover tooltip. */
export function BarsChart({
  data, height = 220, color = "var(--primary)", format = (v: number) => String(v), className,
}: {
  data: Array<{ label: string; value: number }>;
  height?: number;
  color?: string;
  format?: (v: number) => string;
  className?: string;
}) {
  const [ref, { w }] = useSize<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  if (data.length === 0 || w === 0) return <div ref={ref} style={{ height }} className={className} />;

  const maxV = Math.max(1, ...data.map((d) => d.value));
  const ticks = niceTicks(maxV);
  const yMax = ticks[ticks.length - 1];
  const innerW = w - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const slot = innerW / data.length;
  const barW = Math.min(38, slot * 0.62);
  const yAt = (v: number) => PAD.top + innerH - (v / yMax) * innerH;
  const labelEvery = Math.ceil(data.length / Math.max(2, Math.floor(w / 60)));

  return (
    <div ref={ref} className={cn("relative", className)} style={{ height }}>
      <svg width={w} height={height} role="img" aria-label="Bar chart" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={w - PAD.right} y1={yAt(t)} y2={yAt(t)} stroke="var(--card-border)" strokeDasharray={t === 0 ? "0" : "3 4"} />
            <text x={PAD.left - 8} y={yAt(t) + 3.5} textAnchor="end" fontSize={10} fill="var(--text-tertiary)" className="pk-num">
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const x = PAD.left + slot * i + (slot - barW) / 2;
          const y = yAt(d.value);
          const h = PAD.top + innerH - y;
          return (
            <g key={`${d.label}-${i}`} onMouseEnter={() => setHover(i)}>
              <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={innerH} fill="transparent" />
              <rect
                x={x}
                y={y}
                width={barW}
                height={Math.max(1, h)}
                rx={4}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                style={{ transition: "opacity .15s" }}
              />
              {i % labelEvery === 0 && (
                <text x={x + barW / 2} y={height - 8} textAnchor="middle" fontSize={10} fill="var(--text-tertiary)">
                  {d.label}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hover != null && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2 text-xs shadow-[var(--shadow-md)]"
          style={{
            left: Math.min(Math.max(PAD.left + slot * hover + slot / 2 + 8, 8), w - 150),
            top: 6,
            minWidth: 100,
          }}
        >
          <div className="font-semibold text-[var(--text-primary)]">{data[hover].label}</div>
          <div className="pk-num font-semibold text-[var(--primary)]">{format(data[hover].value)}</div>
        </div>
      )}
    </div>
  );
}

/** Horizontal bars with inline labels — zone utilization etc. */
export function HBarChart({
  data, format = (v: number) => String(v), className,
}: {
  data: Array<{ label: string; value: number; hint?: string; color?: string; sub?: string }>;
  format?: (v: number) => string;
  className?: string;
}) {
  if (data.length === 0) return <div className={cn("py-8 text-center text-sm text-[var(--text-tertiary)]", className)}>No data</div>;
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className={cn("space-y-3.5", className)}>
      {data.map((d, i) => (
        <div key={`${d.label}-${i}`}>
          <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="min-w-0 truncate font-medium text-[var(--text-primary)]">
              {d.label}
              {d.sub && <span className="ml-2 text-[11px] font-normal text-[var(--text-tertiary)]">{d.sub}</span>}
            </span>
            <span className="pk-num shrink-0 font-semibold text-[var(--text-secondary)]">{format(d.value)}{d.hint && <span className="ml-1.5 font-normal text-[var(--text-tertiary)]">{d.hint}</span>}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color || "var(--primary)" }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Donut with center total and legend. */
export function DonutChart({
  data, size = 190, thickness = 26, format = (v: number) => String(v), centerLabel, className,
}: {
  data: Array<{ label: string; value: number; color: string }>;
  size?: number;
  thickness?: number;
  format?: (v: number) => string;
  centerLabel?: string;
  className?: string;
}) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  if (total === 0) return <div className={cn("py-8 text-center text-sm text-[var(--text-tertiary)]", className)}>No data yet</div>;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const arcs = data.reduce<Array<{ frac: number; offset: number }>>((acc, d) => {
    const prev = acc[acc.length - 1];
    const prevEnd = prev ? prev.offset + prev.frac : 0;
    acc.push({ frac: d.value / total, offset: prevEnd });
    return acc;
  }, []);
  const active = hover != null ? data[hover] : null;
  return (
    <div className={cn("flex flex-wrap items-center justify-center gap-6", className)}>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }} role="img" aria-label="Donut chart">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
          {data.map((d, i) => {
            const dash = arcs[i].frac * c;
            return (
              <circle
                key={d.label}
                cx={size / 2}
                cy={size / 2}
                r={r}
                fill="none"
                stroke={d.color}
                strokeWidth={hover === i ? thickness + 4 : thickness}
                strokeDasharray={`${dash} ${c - dash}`}
                strokeDashoffset={-arcs[i].offset * c}
                strokeLinecap="butt"
                style={{ transition: "stroke-width .15s" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="pk-num text-lg font-bold text-[var(--text-primary)]">{format(active ? active.value : total)}</span>
          <span className="mt-0.5 max-w-[110px] truncate px-2 text-[10.5px] font-medium text-[var(--text-tertiary)]">
            {active ? active.label : centerLabel ?? "Total"}
          </span>
        </div>
      </div>
      <ul className="space-y-2">
        {data.map((d, i) => (
          <li
            key={d.label}
            className={cn("flex cursor-default items-center gap-2 text-[13px] transition-opacity", hover !== null && hover !== i && "opacity-55")}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.color }} />
            <span className="text-[var(--text-secondary)]">{d.label}</span>
            <span className="pk-num ml-auto pl-4 font-semibold text-[var(--text-primary)]">{format(d.value)}</span>
            <span className="pk-num w-10 text-right text-[11px] text-[var(--text-tertiary)]">{Math.round((d.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Compact sparkline for KPI cards. */
export function Sparkline({ points, color = "var(--primary)", width = 88, height = 30 }: { points: number[]; color?: string; width?: number; height?: number }) {
  if (points.length < 2) return null;
  const max = Math.max(...points, 1);
  const min = Math.min(...points, 0);
  const span = max - min || 1;
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${(i / (points.length - 1)) * width},${height - 3 - ((p - min) / span) * (height - 6)}`)
    .join(" ");
  return (
    <svg width={width} height={height} aria-hidden className="overflow-visible">
      <path d={`${d} L${width},${height} L0,${height} Z`} fill={color} opacity={0.08} />
      <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
