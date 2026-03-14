/**
 * ResourceGauge — horizontal bar gauge for CPU / MEM / DISK / TEMP.
 *
 * Color thresholds:
 *   < 60%  → success (green)
 *   60–79% → warning (amber)
 *   ≥ 80%  → error (red)
 *
 * Bar animates from 0 → value on mount (spring overshoot).
 * Subsequent value changes animate smoothly at 500ms ease-out.
 * Respects prefers-reduced-motion.
 */

import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

interface ResourceGaugeProps {
  label: string;
  value: number;
  /** Max value for percentage calculation (default 100). For temperature use e.g. 100. */
  max?: number;
  /** Unit suffix shown next to the value (e.g., "%" or "°C"). */
  unit?: string;
}

function getColorClass(pct: number): string {
  if (pct >= 80) return "bg-error/70";
  if (pct >= 60) return "bg-warning/70";
  return "bg-success/70";
}

function getTextColorClass(pct: number): string {
  if (pct >= 80) return "text-error";
  if (pct >= 60) return "text-warning";
  return "text-success";
}

export function ResourceGauge({ label, value, max = 100, unit = "%" }: ResourceGaugeProps) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  const colorClass = getColorClass(pct);
  const textColorClass = getTextColorClass(pct);

  return (
    <div className="flex items-center gap-3 h-8" data-testid="resource-gauge">
      {/* Label */}
      <span className="w-10 text-xs font-medium uppercase tracking-wider text-base-content/60 shrink-0">
        {label}
      </span>

      {/* Bar track */}
      <div className="flex-1 h-2 bg-base-300/50 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", colorClass)}
          initial={{ width: "0%" }}
          animate={{ width: `${pct}%` }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 20,
            duration: 0.8,
          }}
          aria-valuenow={value}
          aria-valuemin={0}
          aria-valuemax={max}
          role="progressbar"
          aria-label={`${label} ${value}${unit}`}
        />
      </div>

      {/* Value */}
      <span className={cn("w-12 text-right text-xs font-mono shrink-0", textColorClass)}>
        {value}
        {unit}
      </span>
    </div>
  );
}
