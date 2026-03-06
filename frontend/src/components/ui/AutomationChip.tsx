/**
 * AutomationChip — compact chip displaying an active automation rule.
 *
 * On trigger, call `triggerRipple()` to fire the ripple micro-animation.
 * Accepts an icon, rule name and current trigger count.
 */
import { useState } from "react";
import { Zap } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

interface AutomationChipProps {
  /** Automation rule name */
  name: string;
  /** Whether the rule is currently active */
  active?: boolean;
  /** Number of times triggered (displayed as badge) */
  triggerCount?: number;
  /** Custom icon component from lucide-react */
  icon?: React.ReactNode;
  className?: string;
  onClick?: () => void;
}

export function AutomationChip({
  name,
  active = true,
  triggerCount,
  icon,
  className,
  onClick,
}: AutomationChipProps) {
  const [rippling, setRippling] = useState(false);

  function triggerRipple() {
    setRippling(true);
    setTimeout(() => setRippling(false), 700);
  }

  function handleClick() {
    triggerRipple();
    onClick?.();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium",
        "transition-all duration-200 overflow-hidden",
        active
          ? "bg-[#00ff9c]/10 text-[#00ff9c] border border-[#00ff9c]/30"
          : "bg-muted text-muted-foreground border border-border",
        className,
      )}
      aria-label={`Automation: ${name}${active ? ", active" : ", inactive"}`}
    >
      {/* Ripple overlay */}
      <AnimatePresence>
        {rippling && (
          <motion.span
            key="ripple"
            className="absolute inset-0 rounded-full bg-[#00ff9c]/20"
            initial={{ scale: 0.5, opacity: 0.8 }}
            animate={{ scale: 2.5, opacity: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Icon */}
      <span className="relative z-10 size-3 shrink-0" aria-hidden="true">
        {icon ?? <Zap className="size-3" />}
      </span>

      {/* Name */}
      <span className="relative z-10 truncate max-w-[120px]">{name}</span>

      {/* Trigger count badge */}
      {triggerCount !== undefined && triggerCount > 0 && (
        <span
          className={cn(
            "relative z-10 ml-0.5 rounded-full px-1 py-0 text-[10px] font-bold tabular-nums",
            "bg-[#00ff9c]/20 text-[#00ff9c]",
          )}
          aria-label={`Triggered ${triggerCount} times`}
        >
          {triggerCount}
        </span>
      )}
    </button>
  );
}
