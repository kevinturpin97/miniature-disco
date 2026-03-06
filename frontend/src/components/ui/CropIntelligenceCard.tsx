/**
 * CropIntelligenceCard — displays computed plant health indicators for a zone.
 *
 * Each indicator (growth, hydration, heat stress, etc.) is rendered as a
 * compact tile with an emoji, label, value and a colour reflecting severity.
 * The card border glows green when all indicators are OK, orange on warnings
 * and red on critical conditions.
 *
 * Only indicators the user has enabled (CropIndicatorPreference) are shown.
 * The component fetches its own data and handles loading / error states.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { GlowCard, type GlowVariant } from "./GlowCard";
import { cn } from "@/utils/cn";
import {
  getZoneCropStatus,
  getCropIndicatorPreferences,
} from "@/api/zones";
import type {
  CropStatus,
  CropIndicator,
  CropIndicatorPreference,
  GrowthStatus,
  HydrationStatus,
  StressLevel,
  RiskLevel,
  LightLevel,
} from "@/types";

// ---------------------------------------------------------------------------
// Indicator metadata
// ---------------------------------------------------------------------------

interface IndicatorMeta {
  key: CropIndicator;
  emoji: string;
  labelKey: string;
  getValue: (cs: CropStatus) => string | number | null;
  getSeverity: (cs: CropStatus) => "ok" | "warn" | "crit";
}

function growthSeverity(s: GrowthStatus): "ok" | "warn" | "crit" {
  if (s === "NORMAL" || s === "FAST") return "ok";
  if (s === "SLOW") return "warn";
  return "warn";
}

function hydrationSeverity(s: HydrationStatus): "ok" | "warn" | "crit" {
  if (s === "OPTIMAL") return "ok";
  if (s === "CORRECT") return "ok";
  if (s === "DRY") return "crit";
  if (s === "EXCESS") return "warn";
  return "warn";
}

function stressSeverity(s: StressLevel): "ok" | "warn" | "crit" {
  if (s === "NONE") return "ok";
  if (s === "LIGHT") return "warn";
  if (s === "HIGH" || s === "CRITICAL") return "crit";
  return "warn";
}

function riskSeverity(r: RiskLevel): "ok" | "warn" | "crit" {
  if (r === "LOW") return "ok";
  if (r === "MODERATE") return "warn";
  return "crit";
}

function lightSeverity(l: LightLevel): "ok" | "warn" | "crit" {
  if (l === "OPTIMAL") return "ok";
  if (l === "CORRECT") return "ok";
  return "warn";
}

function yieldSeverity(v: number | null): "ok" | "warn" | "crit" {
  if (v === null) return "warn";
  if (v >= 0) return "ok";
  if (v >= -20) return "warn";
  return "crit";
}

const ALL_INDICATORS: IndicatorMeta[] = [
  {
    key: "GROWTH",
    emoji: "🌱",
    labelKey: "crop.growth",
    getValue: (cs) => cs.growth_status,
    getSeverity: (cs) => growthSeverity(cs.growth_status),
  },
  {
    key: "HYDRATION",
    emoji: "💧",
    labelKey: "crop.hydration",
    getValue: (cs) => cs.hydration_status,
    getSeverity: (cs) => hydrationSeverity(cs.hydration_status),
  },
  {
    key: "HEAT_STRESS",
    emoji: "🌡️",
    labelKey: "crop.heatStress",
    getValue: (cs) =>
      cs.heat_index !== null ? `${cs.heat_index.toFixed(1)}°C` : cs.heat_stress,
    getSeverity: (cs) => stressSeverity(cs.heat_stress),
  },
  {
    key: "YIELD",
    emoji: "📈",
    labelKey: "crop.yield",
    getValue: (cs) =>
      cs.yield_prediction !== null ? `${cs.yield_prediction > 0 ? "+" : ""}${cs.yield_prediction}%` : "—",
    getSeverity: (cs) => yieldSeverity(cs.yield_prediction),
  },
  {
    key: "PLANT_HEALTH",
    emoji: "🌿",
    labelKey: "crop.plantHealth",
    getValue: (cs) =>
      cs.plant_health_score !== null ? `${cs.plant_health_score}/100` : "—",
    getSeverity: (cs) => {
      const v = cs.plant_health_score;
      if (v === null) return "warn";
      if (v >= 70) return "ok";
      if (v >= 40) return "warn";
      return "crit";
    },
  },
  {
    key: "DISEASE_RISK",
    emoji: "🦠",
    labelKey: "crop.diseaseRisk",
    getValue: (cs) => cs.disease_risk,
    getSeverity: (cs) => riskSeverity(cs.disease_risk),
  },
  {
    key: "CLIMATE_STRESS",
    emoji: "⛅",
    labelKey: "crop.climateStress",
    getValue: (cs) => cs.climate_stress,
    getSeverity: (cs) => stressSeverity(cs.climate_stress),
  },
  {
    key: "LIGHT",
    emoji: "☀️",
    labelKey: "crop.light",
    getValue: (cs) => cs.light_level,
    getSeverity: (cs) => lightSeverity(cs.light_level),
  },
  {
    key: "HARVEST_ETA",
    emoji: "🌾",
    labelKey: "crop.harvestEta",
    getValue: (cs) =>
      cs.harvest_eta_days !== null ? `${cs.harvest_eta_days}d` : "—",
    getSeverity: () => "ok",
  },
  {
    key: "IRRIGATION",
    emoji: "🚿",
    labelKey: "crop.irrigation",
    getValue: (cs) =>
      cs.irrigation_needed_liters !== null
        ? `${cs.irrigation_needed_liters}L/plant`
        : "—",
    getSeverity: (cs) => {
      const v = cs.irrigation_needed_liters;
      if (v === null) return "warn";
      if (v === 0) return "ok";
      if (v < 1.0) return "ok";
      return "warn";
    },
  },
];

// ---------------------------------------------------------------------------
// Severity colours
// ---------------------------------------------------------------------------

const SEVERITY_CLASSES: Record<"ok" | "warn" | "crit", string> = {
  ok: "text-success border-success/30 bg-success/5",
  warn: "text-warning border-warning/30 bg-warning/5",
  crit: "text-error border-error/30 bg-error/5",
};

function overallGlowVariant(cs: CropStatus): GlowVariant {
  const indicators = ALL_INDICATORS;
  const crits = indicators.filter((i) => i.getSeverity(cs) === "crit").length;
  const warns = indicators.filter((i) => i.getSeverity(cs) === "warn").length;
  if (crits > 0) return "danger";
  if (warns > 2) return "warning";
  return "green";
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface CropIntelligenceCardProps {
  zoneId: number;
  className?: string;
}

interface State {
  cropStatus: CropStatus | null;
  preferences: CropIndicatorPreference[];
  loading: boolean;
  error: string | null;
  notComputed: boolean;
}

export function CropIntelligenceCard({ zoneId, className }: CropIntelligenceCardProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<State>({
    cropStatus: null,
    preferences: [],
    loading: true,
    error: null,
    notComputed: false,
  });

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [prefs, cs] = await Promise.all([
          getCropIndicatorPreferences(zoneId),
          getZoneCropStatus(zoneId),
        ]);
        if (!cancelled) {
          setState({ cropStatus: cs, preferences: prefs, loading: false, error: null, notComputed: false });
        }
      } catch (err: unknown) {
        if (cancelled) return;
        const isNotFound = (err as { response?: { status?: number } })?.response?.status === 404;
        setState({
          cropStatus: null,
          preferences: [],
          loading: false,
          error: isNotFound ? null : t("crop.fetchError", "Failed to load crop status"),
          notComputed: isNotFound,
        });
      }
    }

    void load();
    return () => { cancelled = true; };
  }, [zoneId, t]);

  const { cropStatus, preferences, loading, error, notComputed } = state;

  // Determine which indicators are enabled (default: all)
  const enabledSet = new Set<string>(
    preferences.filter((p) => p.enabled).map((p) => p.indicator),
  );
  const visibleIndicators = ALL_INDICATORS.filter(
    (i) => preferences.length === 0 || enabledSet.has(i.key),
  );

  const glowVariant: GlowVariant = cropStatus ? overallGlowVariant(cropStatus) : "none";

  return (
    <GlowCard
      variant={glowVariant}
      glass
      active={glowVariant === "green" && !!cropStatus}
      className={cn("p-4 space-y-3", className)}
      aria-label={t("crop.cardAriaLabel", "Crop Intelligence")}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm flex items-center gap-1.5">
          🧠 {t("crop.title", "Crop Intelligence")}
        </h3>
        {cropStatus?.calculated_at && (
          <span className="text-xs text-base-content/40">
            {new Date(cropStatus.calculated_at).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Body */}
      <AnimatePresence mode="wait">
        {loading && (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="grid grid-cols-2 gap-2"
            aria-busy="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-lg skeleton" />
            ))}
          </motion.div>
        )}

        {!loading && error && (
          <motion.p
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-error"
          >
            {error}
          </motion.p>
        )}

        {!loading && notComputed && (
          <motion.p
            key="not-computed"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-sm text-base-content/50 italic"
          >
            {t("crop.notComputed", "Crop status will be available after the first 15-minute cycle.")}
          </motion.p>
        )}

        {!loading && cropStatus && (
          <motion.div
            key="indicators"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-2 gap-2"
          >
            {visibleIndicators.map((ind) => {
              const severity = ind.getSeverity(cropStatus);
              const value = ind.getValue(cropStatus);
              return (
                <motion.div
                  key={ind.key}
                  className={cn(
                    "rounded-lg border px-3 py-2 flex items-start gap-2 text-xs",
                    SEVERITY_CLASSES[severity],
                  )}
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                >
                  <span className="text-base leading-none mt-0.5">{ind.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-base-content/60 truncate">{t(ind.labelKey)}</div>
                    <div className="font-semibold truncate">{value ?? "—"}</div>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </GlowCard>
  );
}
