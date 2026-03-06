/**
 * GlowCard — card with animated neon glow border and glassmorphism background.
 *
 * Applies a subtle green or cyan glow that intensifies on hover.
 * On active zones it pulses continuously via .glow-active CSS class.
 * Respects prefers-reduced-motion.
 */
import { forwardRef } from "react";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";

export type GlowVariant = "green" | "cyan" | "warning" | "danger" | "none";

interface GlowCardProps {
  /** Neon glow color variant. */
  variant?: GlowVariant;
  /** When true, the glow pulses continuously. */
  active?: boolean;
  /** Use glassmorphism background instead of solid card. */
  glass?: boolean;
  className?: string;
  children?: React.ReactNode;
  onClick?: () => void;
  /** Forwarded to the inner div for a11y. */
  role?: string;
  "aria-label"?: string;
}

const VARIANT_CLASSES: Record<GlowVariant, string> = {
  green: "glow-green-hover",
  cyan: "glow-cyan-hover",
  warning: "glow-warning",
  danger: "glow-danger",
  none: "",
};

export const GlowCard = forwardRef<HTMLDivElement, GlowCardProps>(
  (
    {
      variant = "green",
      active = false,
      glass = false,
      className,
      children,
      onClick,
      role,
      "aria-label": ariaLabel,
    },
    ref,
  ) => {
    const glassClass = glass
      ? "glass-auto"
      : "bg-card";

    return (
      <motion.div
        ref={ref}
        role={role}
        aria-label={ariaLabel}
        onClick={onClick}
        className={cn(
          "rounded-xl border transition-all duration-300",
          "border-border dark:border-white/10",
          glassClass,
          VARIANT_CLASSES[variant],
          active && "glow-active",
          onClick && "cursor-pointer",
          className,
        )}
        whileHover={onClick ? { scale: 1.01, y: -1 } : undefined}
        whileTap={onClick ? { scale: 0.99 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
      >
        {children}
      </motion.div>
    );
  },
);

GlowCard.displayName = "GlowCard";
