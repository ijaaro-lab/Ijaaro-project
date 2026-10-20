import { cn } from "@/lib/utils";

export type ChartSlice = {
  key: string;
  label: string;
  value: number;
  color: string;
};

type DonutProps = {
  slices: ChartSlice[];
  size?: number;
  thickness?: number;
  centerLabel?: string;
  centerValue?: string | number;
  /** Full ring or semicircle (gauge-style). */
  variant?: "full" | "semi";
  className?: string;
};

export function DonutChart({
  slices,
  size = 160,
  thickness = 22,
  centerLabel,
  centerValue,
  variant = "full",
  className,
}: DonutProps) {
  const total = slices.reduce((s, x) => s + Math.max(0, x.value), 0);
  const isSemi = variant === "semi";
  const svgH = isSemi ? size / 2 + thickness / 2 + 8 : size;
  const r = (size - thickness) / 2;
  const fullC = 2 * Math.PI * r;
  const trackLen = isSemi ? fullC / 2 : fullC;
  let offset = 0;

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-4 sm:flex-row sm:items-center sm:gap-6",
        className,
      )}
    >
      <div className="relative shrink-0" style={{ width: size, height: svgH }}>
        <svg width={size} height={svgH} viewBox={`0 0 ${size} ${svgH}`} aria-hidden>
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
            className="text-muted"
            transform={isSemi ? `rotate(180 ${size / 2} ${size / 2})` : undefined}
          />
          {total > 0 &&
            slices.map((slice) => {
              const len = (Math.max(0, slice.value) / total) * trackLen;
              const el = (
                <circle
                  key={slice.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={r}
                  fill="none"
                  stroke={slice.color}
                  strokeWidth={thickness}
                  strokeDasharray={`${len} ${fullC - len}`}
                  strokeDashoffset={-offset}
                  strokeLinecap="butt"
                  transform={
                    isSemi
                      ? `rotate(180 ${size / 2} ${size / 2})`
                      : `rotate(-90 ${size / 2} ${size / 2})`
                  }
                />
              );
              offset += len;
              return el;
            })}
        </svg>
        <div
          className={cn(
            "pointer-events-none absolute inset-x-0 flex flex-col items-center text-center",
            isSemi ? "bottom-1" : "inset-0 justify-center",
          )}
        >
          {centerValue != null && (
            <span className="font-display text-3xl font-bold tabular-nums leading-none text-foreground">
              {centerValue}
            </span>
          )}
          {centerLabel && (
            <span className="mt-1 max-w-[7rem] text-xs text-muted-foreground">{centerLabel}</span>
          )}
        </div>
      </div>
      <ul className="grid w-full min-w-0 grid-cols-1 gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {slices.map((slice) => {
          const pct = total > 0 ? Math.round((slice.value / total) * 1000) / 10 : 0;
          return (
            <li key={slice.key} className="flex items-center gap-2 text-sm">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: slice.color }}
              />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">{slice.label}</span>
              <span className="shrink-0 tabular-nums font-semibold text-foreground">{pct}%</span>
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
  const max = Math.max(...points.map((p) => p.value), 1);
  const display = (n: number) => (formatValue ? formatValue(n) : String(n));

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
    <div className={cn("flex flex-col", className)} style={{ height }}>
      <div className="flex min-h-0 flex-1 items-end gap-2 sm:gap-3">
        {points.map((p) => {
          const h = p.value <= 0 ? 0 : Math.max(8, Math.round((p.value / max) * 100));
          const isPeak = p.value === max && max > 0;
          return (
            <div
              key={p.key}
              className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            >
              {showValues && p.value > 0 && (
                <span className="max-w-full truncate text-[10px] font-semibold tabular-nums text-foreground sm:text-xs">
                  {display(p.value)}
                </span>
              )}
              <div
                className="w-full max-w-[52px] rounded-t-xl transition-[height] duration-500"
                style={{
                  height: `${h}%`,
                  background: isPeak ? highlightColor : color,
                  minHeight: p.value > 0 ? 8 : 2,
                  opacity: p.value > 0 ? 1 : 0.35,
                }}
                title={`${p.label}: ${display(p.value)}`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex gap-2 border-t border-border pt-2 sm:gap-3">
        {points.map((p) => (
          <div
            key={p.key}
            className="min-w-0 flex-1 truncate text-center text-xs text-muted-foreground"
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
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <ul className={cn("space-y-3", className)}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-center justify-between gap-2 text-sm">
            <span className="text-muted-foreground">{item.label}</span>
            <span className="tabular-nums font-semibold text-foreground">{item.value}</span>
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
      ))}
    </ul>
  );
}
