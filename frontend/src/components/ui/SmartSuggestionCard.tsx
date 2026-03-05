/**
 * SmartSuggestionCard — shows AI-generated threshold adjustment suggestions
 * with accept/dismiss actions.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { applySuggestion } from "@/api/analytics";
import type { SmartSuggestionData } from "@/types";
import { SENSOR_TYPE_LABELS } from "@/utils/constants";

interface SmartSuggestionCardProps {
  suggestions: SmartSuggestionData[];
  zoneId: number;
  onApplied?: () => void;
}

export function SmartSuggestionCard({
  suggestions,
  zoneId,
  onApplied,
}: SmartSuggestionCardProps) {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");
  const [applying, setApplying] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  if (suggestions.length === 0) return null;

  const visible = suggestions.filter((s) => !dismissed.has(s.id));
  if (visible.length === 0) return null;

  const handleApply = async (suggestion: SmartSuggestionData) => {
    setApplying(suggestion.id);
    try {
      await applySuggestion(zoneId, suggestion.id);
      toast.success(t("success.saved"));
      setDismissed((prev) => new Set(prev).add(suggestion.id));
      onApplied?.();
    } catch {
      // Error toast from interceptor
    } finally {
      setApplying(null);
    }
  };

  const handleDismiss = (id: number) => {
    setDismissed((prev) => new Set(prev).add(id));
  };

  return (
    <div className="rounded-xl border border-info/30 bg-info/5 p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <svg
          className="h-5 w-5 text-info"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
        <h3 className="font-semibold text-base-content">
          {tp("predictions.smartSuggestions")}
        </h3>
        <span className="rounded-full bg-info/20 px-1.5 py-0.5 text-[10px] font-medium text-info">
          AI
        </span>
      </div>

      <div className="space-y-2">
        {visible.map((s) => {
          const sensorLabel =
            SENSOR_TYPE_LABELS[s.sensor_type] ?? s.sensor_type;
          const isThreshold = s.suggestion_type === "THRESH";

          return (
            <div
              key={s.id}
              className="rounded-lg border border-base-300 bg-base-100 p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-base-content">
                      {sensorLabel}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        isThreshold
                          ? "bg-primary/10 text-primary"
                          : "bg-warning/10 text-warning"
                      }`}
                    >
                      {isThreshold
                        ? tp("predictions.thresholdAdj")
                        : tp("predictions.trendWarning")}
                    </span>
                    <span className="text-[10px] text-base-content/40">
                      {Math.round(s.confidence * 100)}%{" "}
                      {tp("predictions.confidence")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-base-content/60">
                    {s.message}
                  </p>
                  {isThreshold &&
                    s.suggested_min != null &&
                    s.suggested_max != null && (
                      <p className="mt-1 text-xs font-medium text-primary">
                        {tp("predictions.suggested")}: {s.suggested_min} —{" "}
                        {s.suggested_max}
                      </p>
                    )}
                </div>
                <div className="flex gap-1">
                  {isThreshold && (
                    <button
                      onClick={() => handleApply(s)}
                      disabled={applying === s.id}
                      className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-white hover:bg-primary-focus disabled:opacity-50"
                    >
                      {applying === s.id ? "..." : t("actions.apply")}
                    </button>
                  )}
                  <button
                    onClick={() => handleDismiss(s.id)}
                    className="rounded-md border border-base-300 px-2 py-1 text-xs text-base-content/60 hover:bg-base-200"
                  >
                    {t("actions.dismiss")}
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
