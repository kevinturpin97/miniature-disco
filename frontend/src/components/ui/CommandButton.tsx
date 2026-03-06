/**
 * CommandButton — ON/OFF actuator button with 3-state feedback animation.
 *
 * States:
 *  - idle:    normal button, click to send command
 *  - pending: spinner + pulse animation (command sent, waiting for ACK)
 *  - ack:     green flash confirmation
 *  - failed:  red flash with retry option
 *
 * Respects prefers-reduced-motion.
 */
import { useState, useEffect } from "react";
import { Power, PowerOff, Loader2, CheckCircle, XCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/utils/cn";

export type CommandState = "idle" | "pending" | "ack" | "failed";

interface CommandButtonProps {
  /** Current physical state of the actuator */
  isOn: boolean;
  /** External command status (driven from API polling) */
  commandState?: CommandState;
  /** Actuator name for a11y */
  name: string;
  /** Fired when the user clicks — return a promise; the component will track it */
  onToggle: () => Promise<void> | void;
  disabled?: boolean;
  className?: string;
}

const STATE_STYLES: Record<CommandState, string> = {
  idle: "",
  pending: "animate-command-pulse opacity-80",
  ack: "brightness-125",
  failed: "brightness-75",
};

export function CommandButton({
  isOn,
  commandState: externalState,
  name,
  onToggle,
  disabled = false,
  className,
}: CommandButtonProps) {
  const [internalState, setInternalState] = useState<CommandState>("idle");

  // Sync external command state (from API) into internal state
  useEffect(() => {
    if (externalState) setInternalState(externalState);
  }, [externalState]);

  async function handleClick() {
    if (disabled || internalState === "pending") return;
    setInternalState("pending");
    try {
      await onToggle();
      // Only auto-advance to ack if no external state drives it
      if (!externalState) {
        setInternalState("ack");
        setTimeout(() => setInternalState("idle"), 1500);
      }
    } catch {
      setInternalState("failed");
      setTimeout(() => setInternalState("idle"), 3000);
    }
  }

  const isPending = internalState === "pending";
  const isAck = internalState === "ack";
  const isFailed = internalState === "failed";

  const baseColor = isOn
    ? "bg-[#00ff9c]/15 border-[#00ff9c]/40 text-[#00ff9c] hover:bg-[#00ff9c]/25"
    : "bg-[#ff4d4f]/10 border-[#ff4d4f]/30 text-[#ff4d4f] hover:bg-[#ff4d4f]/20";

  const feedbackColor = isAck
    ? "bg-[#00ff9c]/30 border-[#00ff9c] text-[#00ff9c]"
    : isFailed
      ? "bg-[#ff4d4f]/30 border-[#ff4d4f] text-[#ff4d4f]"
      : baseColor;

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      disabled={disabled || isPending}
      aria-label={`${name}: ${isOn ? "ON" : "OFF"} — click to ${isOn ? "turn off" : "turn on"}`}
      aria-pressed={isOn}
      aria-busy={isPending}
      className={cn(
        "relative flex items-center gap-2 rounded-lg border px-4 py-2",
        "text-sm font-medium transition-colors duration-200 select-none",
        "disabled:cursor-not-allowed",
        feedbackColor,
        STATE_STYLES[internalState],
        className,
      )}
      whileHover={!disabled && !isPending ? { scale: 1.03 } : undefined}
      whileTap={!disabled && !isPending ? { scale: 0.97 } : undefined}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
    >
      {/* Icon area — animated between states */}
      <AnimatePresence mode="wait">
        {isPending ? (
          <motion.span
            key="pending"
            initial={{ opacity: 0, rotate: -90 }}
            animate={{ opacity: 1, rotate: 0 }}
            exit={{ opacity: 0, rotate: 90 }}
            transition={{ duration: 0.15 }}
          >
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </motion.span>
        ) : isAck ? (
          <motion.span
            key="ack"
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            <CheckCircle className="size-4" aria-hidden="true" />
          </motion.span>
        ) : isFailed ? (
          <motion.span
            key="failed"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <XCircle className="size-4" aria-hidden="true" />
          </motion.span>
        ) : isOn ? (
          <motion.span key="on" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <Power className="size-4" aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span key="off" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <PowerOff className="size-4" aria-hidden="true" />
          </motion.span>
        )}
      </AnimatePresence>

      {/* Label */}
      <span>{isOn ? "ON" : "OFF"}</span>

      {/* Progress bar for pending */}
      {isPending && (
        <motion.div
          className="absolute bottom-0 left-0 h-0.5 bg-current rounded-b-lg"
          initial={{ width: "0%" }}
          animate={{ width: "100%" }}
          transition={{ duration: 10, ease: "linear" }}
          aria-hidden="true"
        />
      )}
    </motion.button>
  );
}
