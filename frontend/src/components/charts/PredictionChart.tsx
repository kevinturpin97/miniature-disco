/**
 * Prediction chart showing historical data + predicted values with confidence interval.
 * Displays dashed forecast lines and shaded confidence bands using Recharts.
 */

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Area,
  ComposedChart,
} from "recharts";
import { format } from "date-fns";
import type { SensorPredictionData, DriftInfo, SensorReading } from "@/types";

interface PredictionChartProps {
  sensorPrediction: SensorPredictionData;
  drift?: DriftInfo;
  recentReadings?: SensorReading[];
  color?: string;
}

interface ChartPoint {
  time: string;
  timestamp: number;
  value?: number;
  predicted?: number;
  confidence_lower?: number;
  confidence_upper?: number;
}

export function PredictionChart({
  sensorPrediction,
  drift,
  recentReadings = [],
  color = "#16a34a",
}: PredictionChartProps) {
  const { t: tp } = useTranslation("pages");

  const chartData = useMemo(() => {
    const points: ChartPoint[] = [];

    // Add recent historical readings (handle both raw and aggregated formats)
    recentReadings.forEach((r) => {
      const raw = r as unknown as Record<string, unknown>;
      const timeStr = (raw.period as string) ?? r.received_at;
      const val = (raw.avg_value as number) ?? r.value;
      if (!timeStr) return;
      points.push({
        time: format(new Date(timeStr), "HH:mm"),
        timestamp: new Date(timeStr).getTime(),
        value: val,
      });
    });

    // Add predictions
    sensorPrediction.predictions.forEach((p) => {
      points.push({
        time: format(new Date(p.predicted_at), "HH:mm"),
        timestamp: new Date(p.predicted_at).getTime(),
        predicted: p.predicted_value,
        confidence_lower: p.confidence_lower,
        confidence_upper: p.confidence_upper,
      });
    });

    // Sort by time
    points.sort((a, b) => a.timestamp - b.timestamp);

    // Bridge: add the last real point as also a predicted point for continuity
    if (recentReadings.length > 0 && sensorPrediction.predictions.length > 0) {
      const last = recentReadings[recentReadings.length - 1];
      const lastRaw = last as unknown as Record<string, unknown>;
      const lastTimeStr = (lastRaw.period as string) ?? last.received_at;
      const lastVal = (lastRaw.avg_value as number) ?? last.value;
      if (lastTimeStr) {
        const bridgeIndex = points.findIndex(
          (p) => p.timestamp === new Date(lastTimeStr).getTime(),
        );
        if (bridgeIndex >= 0) {
          points[bridgeIndex].predicted = lastVal;
          points[bridgeIndex].confidence_lower = lastVal;
          points[bridgeIndex].confidence_upper = lastVal;
        }
      }
    }

    return points;
  }, [recentReadings, sensorPrediction]);

  const hasPredictions = sensorPrediction.predictions.length > 0;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-foreground">
            {sensorPrediction.label} — {tp("predictions.forecast")}
          </h3>
          <p className="text-xs text-muted-foreground">
            {tp("predictions.next6h")} ({sensorPrediction.unit})
          </p>
        </div>
        {drift && (
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                drift.trend === "rising"
                  ? "bg-warning/10 text-warning"
                  : drift.trend === "falling"
                    ? "bg-info/10 text-info"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {drift.trend === "rising" && "↑"}
              {drift.trend === "falling" && "↓"}
              {drift.trend === "stable" && "→"}
              {drift.slope_per_hour > 0 ? "+" : ""}
              {drift.slope_per_hour.toFixed(2)}/h
            </span>
            {drift.drift_alert && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                {tp("predictions.driftAlert")}
              </span>
            )}
          </div>
        )}
      </div>

      {hasPredictions || recentReadings.length > 0 ? (
        <ResponsiveContainer width="100%" height={250}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "hsl(var(--card))",
                border: "1px solid hsl(var(--border))",
                borderRadius: "8px",
              }}
            />
            <Legend />
            {/* Confidence band */}
            <Area
              type="monotone"
              dataKey="confidence_upper"
              stroke="none"
              fill={color}
              fillOpacity={0.1}
              name={tp("predictions.confidenceUpper")}
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="confidence_lower"
              stroke="none"
              fill="#ffffff"
              fillOpacity={1}
              name={tp("predictions.confidenceLower")}
              legendType="none"
            />
            {/* Historical data */}
            <Line
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              dot={false}
              connectNulls
              name={tp("predictions.actual")}
            />
            {/* Predicted data */}
            <Line
              type="monotone"
              dataKey="predicted"
              stroke={color}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={{ r: 3 }}
              connectNulls
              name={tp("predictions.predicted")}
            />
          </ComposedChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground/60">
          {tp("predictions.noData")}
        </div>
      )}
    </div>
  );
}
