/**
 * SensorChart — standardized Recharts line chart with integrated dark/light theming.
 *
 * Features:
 *  - Automatic color based on sensor type
 *  - Synchronized dark/light color tokens from CSS variables
 *  - Responsive container
 *  - ARIA label for accessibility
 *  - Lazy rendering: returns null until IntersectionObserver confirms it's in viewport
 */
import { memo, useRef, useState, useEffect } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  type TooltipProps,
} from "recharts";
import { format } from "date-fns";
import { cn } from "@/utils/cn";

export type SensorType = "TEMP" | "HUM_AIR" | "HUM_SOIL" | "PH" | "LIGHT" | "CO2";

interface ReadingPoint {
  received_at: string;
  value: number;
}

interface SensorChartProps {
  data: ReadingPoint[];
  sensorType?: SensorType;
  /** Override the line color */
  color?: string;
  unit?: string;
  minThreshold?: number;
  maxThreshold?: number;
  /** ARIA label for accessibility */
  "aria-label"?: string;
  className?: string;
  height?: number;
}

const TYPE_COLORS: Record<SensorType, string> = {
  TEMP: "#ff7c52",
  HUM_AIR: "#00d9ff",
  HUM_SOIL: "#2dbf7f",
  PH: "#a78bfa",
  LIGHT: "#ffb300",
  CO2: "#6b7280",
};

const DEFAULT_COLOR = "#00ff9c";

interface CustomTooltipPayload {
  value: number;
  payload: ReadingPoint;
}

function CustomTooltip({
  active,
  payload,
  unit,
  color,
}: TooltipProps<number, string> & { unit?: string; color: string }) {
  if (!active || !payload?.length) return null;
  const entry = payload[0] as unknown as CustomTooltipPayload;
  const ts = entry.payload?.received_at;
  return (
    <div className="rounded-lg border border-white/10 bg-card px-3 py-2 text-xs shadow-lg">
      {ts && <p className="text-muted-foreground mb-1">{format(new Date(ts), "HH:mm:ss")}</p>}
      <p className="font-semibold" style={{ color }}>
        {entry.value?.toFixed(2)} {unit}
      </p>
    </div>
  );
}

export const SensorChart = memo(function SensorChart({
  data,
  sensorType,
  color,
  unit,
  minThreshold,
  maxThreshold,
  "aria-label": ariaLabel,
  className,
  height = 160,
}: SensorChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  // Lazy render: only mount the chart once it's in the viewport
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const lineColor = color ?? (sensorType ? TYPE_COLORS[sensorType] : DEFAULT_COLOR);
  const label = ariaLabel ?? `${sensorType ?? "Sensor"} chart`;

  return (
    <div
      ref={containerRef}
      className={cn("w-full", className)}
      style={{ height }}
      role="img"
      aria-label={label}
    >
      {visible && data.length > 1 ? (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.05)"
              vertical={false}
            />
            <XAxis
              dataKey="received_at"
              tickFormatter={(v: string) => {
                try { return format(new Date(v), "HH:mm"); } catch { return ""; }
              }}
              tick={{ fill: "var(--color-muted-foreground, #6b7280)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tick={{ fill: "var(--color-muted-foreground, #6b7280)", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={32}
              tickFormatter={(v: number) => v.toFixed(1)}
            />
            <Tooltip
              content={<CustomTooltip unit={unit} color={lineColor} />}
              cursor={{ stroke: lineColor, strokeWidth: 1, strokeDasharray: "4 4" }}
            />
            {minThreshold !== undefined && (
              <ReferenceLine
                y={minThreshold}
                stroke="#ffb300"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{ value: `min ${minThreshold}`, fill: "#ffb300", fontSize: 9 }}
              />
            )}
            {maxThreshold !== undefined && (
              <ReferenceLine
                y={maxThreshold}
                stroke="#ff4d4f"
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{ value: `max ${maxThreshold}`, fill: "#ff4d4f", fontSize: 9 }}
              />
            )}
            <Line
              type="monotone"
              dataKey="value"
              stroke={lineColor}
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: lineColor, stroke: "var(--color-card, #111720)" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : visible && data.length <= 1 ? (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Not enough data
        </div>
      ) : (
        /* Placeholder skeleton while off-screen */
        <div className="h-full w-full rounded bg-muted/30 animate-pulse" />
      )}
    </div>
  );
});
