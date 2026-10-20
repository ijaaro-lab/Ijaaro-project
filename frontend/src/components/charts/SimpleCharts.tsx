import { useId, useState } from "react";
import { cn } from "@/lib/utils";

export type ChartSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

function pctOf(value: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((value / total) * 1000) / 10;
}

function formatCount(n: number): string {
  return new Intl.NumberFormat(undefined).format(n);
}

type DonutProps = {
  slices: ChartSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  /** Full ring or semicircle (gauge-style). */
  variant?: "full" | "semi";
  /** Show absolute counts next to each legend label. */
  showCounts?: boolean;
  className?: string;
};

export function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
  variant = "full",
  showCounts = false,
  className,
}: DonutProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const isSemi = variant === "semi";
  const svgH = isSemi ? size / 2 + thickness / 2 + 8 : size;
  const r = (size - thickness) / 2;
  const fullC = 2 * Math.PI * r;
  const trackLen = isSemi ? fullC / 2 : fullC;
  const hovered = hoverKey ? slices.find((s) => s.key === hoverKey) : null;
  const hoverPct = hovered ? pctOf(hovered.value, total) : 0;

  let offset = 0;
  const arcs = slices.map((slice) => {
    const len = total > 0 ? (Math.max(0, slice.value) / total) * trackLen : 0;
    const start = offset;
    offset += len;
    return { slice, len, start };
  });

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: size, height: svgH }}>
        <svg
          width={size}
          height={svgH}
          viewBox={`0 0 ${size} ${svgH}`}
          className="overflow-visible"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke="currentColor"
            strokeWidth={thickness}
            strokeDasharray={isSemi ? `${trackLen} ${fullC}` : undefined}
            strokeDashoffset={0}
            strokeLinecap="round"
            className="pointer-events-none text-muted"
            transform={isSemi ? `rotate(180 ${size / 2} ${size / 2})` : undefined}
          />
          {total > 0 &&
            arcs.map(({ slice, len, start }) => {
              const active = hoverKey === null || hoverKey === slice.key;
              return (
                <circle
                  key={slice.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={hoverKey === slice.key ? thickness + 4 : thickness}
                  strokeDasharray={`${len} ${fullC - len}`}
                  strokeDashoffset={-start}
                  strokeLinecap="butt"
                  opacity={active ? 1 : 0.28}
                  className="cursor-pointer transition-[stroke-width,opacity] duration-150"
                  style={{ transition: "stroke-width 150ms, opacity 150ms" }}
                  transform={
                    isSemi
                      ? `rotate(180 ${size / 2} ${size / 2})`
                      : `rotate(-90 ${size / 2} ${size / 2})`
                  }
                  onMouseEnter={() => setHoverKey(slice.key)}
                  onMouseLeave={() => setHoverKey(null)}
                  onFocus={() => setHoverKey(slice.key)}
                  onBlur={() => setHoverKey(null)}
                  tabIndex={0}
                  role="img"
                  aria-label={`${slice.label}: ${formatCount(slice.value)} (${pctOf(slice.value, total)}%)`}
                />
              );
            })}
        </svg>

        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex flex-col items-center text-center",
            isSemi ? "bottom-1" : "inset-0 justify-center",
          )}
        >
          {hovered ? (
            <>
              <span className="font-display text-2xl font-bold tabular-nums leading-none text-foreground sm:text-3xl">
                {hoverPct}%
              </span>
              <span className="mt-1.5 max-w-[8.5rem] truncate text-xs font-medium text-foreground">
                {hovered.label}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {formatCount(hovered.value)}
                {centerLabel ? ` ${centerLabel}` : ""}
              </span>
            </>
          ) : (
            <>
              {centerValue != null && (
                <span className="font-display text-3xl font-bold tabular-nums leading-none text-foreground">
                  {centerValue}
                </span>
              )}
              {centerLabel && (
                <span className="mt-1 max-w-[7rem] text-xs text-muted-foreground">
                  {centerLabel}
                </span>
              )}
            </>
          )}
        </div>

        {hovered && (
          <div
            className="pointer-events-none absolute left-1/2 top-2 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-1.5 text-center shadow-md dark:bg-zinc-900"
            role="tooltip"
          >
            <p className="text-xs font-semibold text-foreground">
              {hovered.label}
            </p>
            <p className="text-[11px] tabular-nums text-muted-foreground">
              {formatCount(hovered.value)} · {hoverPct}%
            </p>
          </div>
        )}
      </div>

      <ul className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {slices.map((slice) => {
          const pct = pctOf(slice.value, total);
          const active = hoverKey === null || hoverKey === slice.key;
          return (
            <li key={slice.key}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-1 py-0.5 text-left text-sm transition-opacity",
                  active ? "opacity-100" : "opacity-35",
                )}
                onMouseEnter={() => setHoverKey(slice.key)}
                onMouseLeave={() => setHoverKey(null)}
                onFocus={() => setHoverKey(slice.key)}
                onBlur={() => setHoverKey(null)}
              >
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {slice.label}
                  {showCounts ? (
                    <span className="ml-1 tabular-nums text-foreground/80">
                      {formatCount(slice.value)}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 tabular-nums font-semibold text-foreground">
                  {pct}%
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

type BarPoint = { key: string; label: string; value: number };

type BarChartProps = {
  points: BarPoint[];
  color?: string;
  /** Highlight the max bar with this color (e.g. brand power / amber). */
  highlightColor?: string;
  height?: number;
  className?: string;
  emptyLabel?: string;
  showValues?: boolean;
  formatValue?: (value: number) => string;
};

export function BarChart({
  points,
  color = "var(--color-brand-water)",
  highlightColor = "var(--color-brand-power)",
  height = 160,
  className,
  emptyLabel = "No data yet",
  showValues = true,
  formatValue,
}: BarChartProps) {
  const tipId = useId();
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const max = Math.max(...points.map((p) => p.value), 1);
  const sum = points.reduce((s, p) => s + Math.max(0, p.value), 0);
  const display = (n: number) => (formatValue ? formatValue(n) : String(n));
  const hovered = hoverKey ? points.find((p) => p.key === hoverKey) : null;

  if (points.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-lg bg-muted/40 text-sm text-muted-foreground",
          className,
        )}
        style={{ height }}
      >
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col", className)} style={{ height }}>
      {hovered && (
        <div
          id={tipId}
          className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 rounded-lg border border-border bg-card px-3 py-1.5 text-center shadow-md dark:bg-zinc-900"
          role="tooltip"
        >
          <p className="text-xs font-semibold text-foreground">{hovered.label}</p>
          <p className="text-[11px] tabular-nums text-muted-foreground">
            {display(hovered.value)} · {pctOf(hovered.value, sum)}%
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-end gap-2 sm:gap-3">
        {points.map((p) => {
          const h = p.value <= 0 ? 0 : Math.max(8, Math.round((p.value / max) * 100));
          const isPeak = p.value === max && max > 0;
          const active = hoverKey === null || hoverKey === p.key;
          const pct = pctOf(p.value, sum);
          return (
            <div
              key={p.key}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              onMouseEnter={() => setHoverKey(p.key)}
              onMouseLeave={() => setHoverKey(null)}
            >
              {showValues && p.value > 0 && (
                <span
                  className={cn(
                    "max-w-full truncate text-[10px] font-semibold tabular-nums text-foreground sm:text-xs",
                    hoverKey === p.key && "text-brand-green",
                  )}
                >
                  {hoverKey === p.key ? `${pct}%` : display(p.value)}
                </span>
              )}
              <button
                type="button"
                className="w-full max-w-[52px] rounded-t-xl transition-[height,opacity,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                style={{
                  height: `${h}%`,
                  background: isPeak || hoverKey === p.key ? highlightColor : color,
                  minHeight: p.value > 0 ? 8 : 2,
                  opacity: active ? 1 : 0.3,
                  transform: hoverKey === p.key ? "scaleX(1.08)" : undefined,
                }}
                aria-describedby={hoverKey === p.key ? tipId : undefined}
                aria-label={`${p.label}: ${display(p.value)} (${pct}%)`}
                onFocus={() => setHoverKey(p.key)}
                onBlur={() => setHoverKey(null)}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 border-t border-border pt-2 sm:gap-3">
        {points.map((p) => (
          <div
            key={p.key}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-xs text-muted-foreground transition-colors",
              hoverKey === p.key && "font-semibold text-foreground",
            )}
            title={p.label}
          >
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
}

type HorzBarProps = {
  items: ChartSlice[];
  className?: string;
};

export function HorizontalBars({ items, className }: HorzBarProps) {
  const [hoverKey, setHoverKey] = useState<string | null>(null);
  const max = Math.max(...items.map((i) => i.value), 1);
  const sum = items.reduce((s, i) => s + Math.max(0, i.value), 0);

  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => {
        const pct = pctOf(item.value, sum);
        const active = hoverKey === null || hoverKey === item.key;
        return (
          <li
            key={item.key}
            onMouseEnter={() => setHoverKey(item.key)}
            onMouseLeave={() => setHoverKey(null)}
            className={cn("transition-opacity", active ? "opacity-100" : "opacity-40")}
          >
            <div className="mb-1 flex items-center justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{item.label}</span>
              <span className="tabular-nums font-semibold text-foreground">
                {hoverKey === item.key
                  ? `${pct}%`
                  : formatCount(item.value)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-[width] duration-500"
                style={{
                  width: `${Math.max(4, (item.value / max) * 100)}%`,
                  background: item.color,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
