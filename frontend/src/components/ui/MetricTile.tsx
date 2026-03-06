/**
 * MetricTile — compact metric display with value, unit, trend indicator and optional sparkline.
 *
 * Used in the Dashboard Global Overview panel and zone cards.
 */
import { memo } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { cn } from "@/utils/cn";

export type TrendDirection = "up" | "down" | "flat";

interface SparkPoint {
  value: number;
}

interface MetricTileProps {
  /** Display label (e.g. "Température Moy.") */
  label: string;
  /** Current metric value */
  value: number | string;
  /** Unit suffix (e.g. "°C", "%", "ppm") */
  unit?: string;
  /** Trend direction for the past period */
  trend?: TrendDirection;
  /** Percentage change to display alongside the trend */
  trendPercent?: number;
  /** Optional sparkline data (last N readings) */
  sparkline?: SparkPoint[];
  /** Color scheme for the metric */
  color?: "green" | "cyan" | "warning" | "danger" | "neutral";
  className?: string;
}

const COLOR_MAP = {
  green: {
    value: "text-[#00ff9c] dark:text-[#00ff9c] text-[#1e7f5c]",
    icon: "text-[#00ff9c] dark:text-[#00ff9c] text-[#1e7f5c]",
    line: "#00ff9c",
  },
  cyan: {
    value: "text-[#00d9ff]",
    icon: "text-[#00d9ff]",
    line: "#00d9ff",
  },
  warning: {
    value: "text-[#ffb300]",
    icon: "text-[#ffb300]",
    line: "#ffb300",
  },
  danger: {
    value: "text-[#ff4d4f]",
    icon: "text-[#ff4d4f]",
    line: "#ff4d4f",
  },
  neutral: {
    value: "text-foreground",
    icon: "text-muted-foreground",
    line: "#6b7280",
  },
};

const TREND_ICONS = {
  up: TrendingUp,
  down: TrendingDown,
  flat: Minus,
};

/** Minimal inline SVG sparkline — zero JS runtime, pure CSS GPU transform. */
function Sparkline({ data, color }: { data: SparkPoint[]; color: string }) {
  if (data.length < 2) return null;

  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const w = 80;
  const h = 28;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / range) * h;
    return `${x},${y}`;
  });
  const d = `M ${pts.join(" L ")}`;

  return (
    <svg
      width={w}
      height={h}
      aria-hidden="true"
      className="shrink-0 opacity-70"
    >
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export const MetricTile = memo(function MetricTile({
  label,
  value,
  unit,
  trend = "flat",
  trendPercent,
  sparkline,
  color = "green",
  className,
}: MetricTileProps) {
  const colors = COLOR_MAP[color];
  const TrendIcon = TREND_ICONS[trend];
  const trendColor =
    trend === "up" ? "text-[#00ff9c]" : trend === "down" ? "text-[#ff4d4f]" : "text-muted-foreground";

  return (
    <div className={cn("flex flex-col gap-1 min-w-0", className)}>
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <div className="flex items-end gap-2">
        <span className={cn("text-2xl font-bold tabular-nums leading-none", colors.value)}>
          {value}
        </span>
        {unit && <span className="text-sm text-muted-foreground mb-0.5">{unit}</span>}
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className={cn("flex items-center gap-0.5 text-xs", trendColor)}>
          <TrendIcon className="size-3" aria-hidden="true" />
          {trendPercent !== undefined && (
            <span>{Math.abs(trendPercent).toFixed(1)}%</span>
          )}
        </div>
        {sparkline && sparkline.length >= 2 && (
          <Sparkline data={sparkline} color={colors.line} />
        )}
      </div>
    </div>
  );
});
