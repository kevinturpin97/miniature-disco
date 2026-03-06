/**
 * ZoneStatusBadge — compact badge showing zone state with semantic color coding.
 *
 * States:
 *  - online   → neon green glow
 *  - offline  → red
 *  - alert    → amber with pulse
 *  - syncing  → cyan
 */
import { cn } from "@/utils/cn";
import { LiveIndicator } from "./LiveIndicator";

export type ZoneState = "online" | "offline" | "alert" | "syncing";

interface ZoneStatusBadgeProps {
  state: ZoneState;
  label?: string;
  className?: string;
}

const BADGE_STYLES: Record<ZoneState, string> = {
  online:
    "bg-[#00ff9c]/10 text-[#00ff9c] dark:text-[#00ff9c] border border-[#00ff9c]/30",
  offline:
    "bg-[#ff4d4f]/10 text-[#ff4d4f] border border-[#ff4d4f]/30",
  alert:
    "bg-[#ffb300]/10 text-[#ffb300] border border-[#ffb300]/30 animate-command-pulse",
  syncing:
    "bg-[#00d9ff]/10 text-[#00d9ff] border border-[#00d9ff]/30",
};

const STATE_LABELS: Record<ZoneState, string> = {
  online: "Online",
  offline: "Offline",
  alert: "Alert",
  syncing: "Syncing",
};

const INDICATOR_STATE: Record<ZoneState, "live" | "offline" | "degraded"> = {
  online: "live",
  offline: "offline",
  alert: "degraded",
  syncing: "degraded",
};

export function ZoneStatusBadge({ state, label, className }: ZoneStatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        BADGE_STYLES[state],
        className,
      )}
      aria-label={`Zone status: ${label ?? STATE_LABELS[state]}`}
    >
      <LiveIndicator state={INDICATOR_STATE[state]} size="sm" />
      {label ?? STATE_LABELS[state]}
    </span>
  );
}
