/**
 * LiveIndicator — pulsing dot that reflects live connection state.
 *
 * Green pulse = connected/live.
 * Red = offline.
 * Yellow = degraded/syncing.
 *
 * On new reading received, call `triggerPulse()` to flash a bright burst.
 * All animations are CSS-only (GPU transforms) and respect prefers-reduced-motion.
 */
import { useEffect, useRef, useState } from "react";
import { cn } from "@/utils/cn";

export type IndicatorState = "live" | "offline" | "degraded";

interface LiveIndicatorProps {
  state?: IndicatorState;
  /** When changed, triggers a bright pulse burst (new reading received). */
  readingTimestamp?: number | string;
  /** Size in pixels */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Accessible label */
  label?: string;
}

const STATE_COLORS: Record<IndicatorState, string> = {
  live: "bg-[#00ff9c]",
  offline: "bg-[#ff4d4f]",
  degraded: "bg-[#ffb300]",
};

const STATE_RING: Record<IndicatorState, string> = {
  live: "ring-[#00ff9c]/30",
  offline: "ring-[#ff4d4f]/30",
  degraded: "ring-[#ffb300]/30",
};

const SIZES = {
  sm: "size-2",
  md: "size-2.5",
  lg: "size-3.5",
};

const RING_SIZES = {
  sm: "size-4",
  md: "size-5",
  lg: "size-6",
};

export function LiveIndicator({
  state = "live",
  readingTimestamp,
  size = "md",
  className,
  label,
}: LiveIndicatorProps) {
  const [burst, setBurst] = useState(false);
  const prevTimestamp = useRef(readingTimestamp);

  // Flash on new reading
  useEffect(() => {
    if (readingTimestamp !== prevTimestamp.current) {
      prevTimestamp.current = readingTimestamp;
      setBurst(true);
      const t = setTimeout(() => setBurst(false), 700);
      return () => clearTimeout(t);
    }
  }, [readingTimestamp]);

  const dotColor = STATE_COLORS[state];
  const ringColor = STATE_RING[state];
  const dotSize = SIZES[size];
  const ringSize = RING_SIZES[size];

  return (
    <span
      role="status"
      aria-label={label ?? `Connection ${state}`}
      className={cn("relative inline-flex items-center justify-center", className)}
    >
      {/* Outer ring — continuous pulse for live state */}
      {state === "live" && (
        <span
          className={cn(
            "absolute rounded-full ring-2 ring-inset",
            ringSize,
            ringColor,
            "animate-live-pulse",
          )}
          aria-hidden="true"
        />
      )}
      {/* Core dot */}
      <span
        className={cn(
          "relative rounded-full transition-all duration-300",
          dotSize,
          dotColor,
          burst && "scale-150 brightness-150",
        )}
        aria-hidden="true"
      />
    </span>
  );
}
