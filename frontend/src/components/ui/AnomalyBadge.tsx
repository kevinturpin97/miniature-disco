/**
 * AnomalyBadge — displays an anomaly indicator badge next to sensor readings.
 * Shows a tooltip with anomaly details when hovered.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { AnomalyRecordData } from "@/types";

interface AnomalyBadgeProps {
  anomalies: AnomalyRecordData[];
  sensorId: number;
}

export function AnomalyBadge({ anomalies, sensorId }: AnomalyBadgeProps) {
  const { t: tp } = useTranslation("pages");
  const [showTooltip, setShowTooltip] = useState(false);

  const sensorAnomalies = anomalies.filter((a) => a.sensor === sensorId);

  if (sensorAnomalies.length === 0) return null;

  return (
    <div className="relative inline-flex">
      <button
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        onClick={() => setShowTooltip(!showTooltip)}
        className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20"
      >
        <svg
          className="h-3 w-3"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z"
          />
        </svg>
        {tp("predictions.anomalyDetected")}
        {sensorAnomalies.length > 1 && (
          <span className="ml-0.5 text-[10px]">({sensorAnomalies.length})</span>
        )}
      </button>

      {showTooltip && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-lg border border-border bg-card p-3 shadow-lg">
          <p className="mb-1.5 text-xs font-semibold text-destructive">
            {tp("predictions.anomalyDetails")}
          </p>
          <div className="space-y-2">
            {sensorAnomalies.slice(0, 3).map((a) => (
              <div key={a.id} className="border-l-2 border-destructive/40 pl-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground/80">
                    {a.detection_method === "IF" ? "Isolation Forest" : "Z-Score"}
                  </span>
                  <span className="text-muted-foreground/70">
                    {format(new Date(a.detected_at), "MM/dd HH:mm")}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  {tp("predictions.value")}: {a.value.toFixed(2)} |{" "}
                  {tp("predictions.score")}: {a.anomaly_score.toFixed(3)}
                </p>
                {a.explanation && (
                  <p className="mt-0.5 text-[10px] text-muted-foreground/60 line-clamp-2">
                    {a.explanation}
                  </p>
                )}
              </div>
            ))}
            {sensorAnomalies.length > 3 && (
              <p className="text-[10px] text-muted-foreground/60">
                +{sensorAnomalies.length - 3} {tp("predictions.more")}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
