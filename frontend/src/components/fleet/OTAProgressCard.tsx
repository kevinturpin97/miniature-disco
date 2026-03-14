/**
 * OTAProgressCard — displayed when a device has an active OTA job.
 *
 * Replaces the Firmware card in DeviceDetail while an OTA is in progress.
 *
 * States:
 *   PENDING     : pulsing empty bar, "Preparing..."
 *   DOWNLOADING : shimmer progress bar, percent shown
 *   INSTALLING  : full warning bar + pulse, "do not power off"
 *   SUCCESS     : success bar + confetti particles, auto-fades after 2s
 *   FAILED      : error bar + shake, retry button
 *   ROLLED_BACK : warning bar + rollback message
 *
 * Animations:
 *   - mount: opacity 0→1, y 10→0, 300ms ease-out
 *   - progress: width transition 1s ease-out
 *   - shimmer: linear-gradient sweep 1.5s infinite
 *   - success: confetti 5 particles, 800ms
 *   - failed: shake translateX, 300ms
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import type { DeviceOTAJob, OTAJobStatus } from "@/api/fleet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function barColorClass(status: OTAJobStatus): string {
  if (status === "SUCCESS") return "bg-success";
  if (status === "FAILED") return "bg-error/70";
  if (status === "INSTALLING") return "bg-warning/70";
  if (status === "ROLLED_BACK") return "bg-warning/50";
  return "bg-primary"; // PENDING / DOWNLOADING
}

function stepStatus(step: OTAJobStatus, current: OTAJobStatus) {
  const order: OTAJobStatus[] = ["PENDING", "DOWNLOADING", "INSTALLING", "SUCCESS"];
  const si = order.indexOf(step);
  const ci = order.indexOf(current);
  if (si < ci) return "done";
  if (si === ci) return "active";
  return "pending";
}

// ---------------------------------------------------------------------------
// Confetti particle
// ---------------------------------------------------------------------------

const CONFETTI_COLORS = ["#00ff9c", "#00d9ff", "#ffb300", "#ff4d9c", "#a78bfa"];

function ConfettiParticle({ index }: { index: number }) {
  const x = (index % 2 === 0 ? 1 : -1) * (10 + index * 12);
  const color = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-1/2 w-1.5 h-1.5 rounded-full"
      style={{ background: color }}
      initial={{ opacity: 1, x, y: 0, rotate: 0 }}
      animate={{ opacity: 0, x: x + (x > 0 ? 24 : -24), y: -44, rotate: 200 }}
      transition={{ duration: 0.8, delay: index * 0.06, ease: [0.25, 0.46, 0.45, 0.94] }}
    />
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface OTAProgressCardProps {
  job: DeviceOTAJob;
  onCancel?: () => void;
  onRetry?: () => void;
  onDismiss?: () => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function OTAProgressCard({ job, onCancel, onRetry, onDismiss }: OTAProgressCardProps) {
  const { t } = useTranslation("pages");
  const { status, progress_percent, firmware_version, previous_version, error_message } = job;

  const [showConfetti, setShowConfetti] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  // Trigger confetti + auto-dismiss on SUCCESS
  useEffect(() => {
    if (status === "SUCCESS") {
      setShowConfetti(true);
      const timer = setTimeout(() => {
        setShowConfetti(false);
        const dismissTimer = setTimeout(() => {
          setDismissed(true);
          onDismiss?.();
        }, 1200);
        return () => clearTimeout(dismissTimer);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [status, onDismiss]);

  if (dismissed) return null;

  // Compute bar width
  let barWidth = progress_percent;
  if (status === "INSTALLING" || status === "SUCCESS" || status === "ROLLED_BACK") barWidth = 100;
  if (status === "PENDING") barWidth = 0;

  // Status label
  const statusLabel = (() => {
    switch (status) {
      case "PENDING":      return t("fleetDetail.ota.preparing");
      case "DOWNLOADING":  return t("fleetDetail.ota.downloading");
      case "INSTALLING":   return t("fleetDetail.ota.installing");
      case "SUCCESS":      return t("fleetDetail.ota.success");
      case "FAILED":       return t("fleetDetail.ota.failed");
      case "ROLLED_BACK":  return t("fleetDetail.ota.rolledBack", { version: previous_version });
    }
  })();

  // Steps (only show for active jobs)
  const STEPS: { key: OTAJobStatus; label: string }[] = [
    { key: "PENDING",     label: t("fleetDetail.ota.stepPrepare") },
    { key: "DOWNLOADING", label: t("fleetDetail.ota.stepDownload", { pct: progress_percent }) },
    { key: "INSTALLING",  label: t("fleetDetail.ota.stepInstall") },
  ];

  const isFailed = status === "FAILED" || status === "ROLLED_BACK";
  const isSuccess = status === "SUCCESS";

  return (
    <AnimatePresence>
      <motion.div
        data-testid="ota-progress-card"
        data-status={status}
        className={cn(
          "relative overflow-hidden rounded-xl border p-4",
          isSuccess ? "bg-success/5 border-success/20" :
          isFailed  ? "bg-error/5 border-error/20" :
                      "bg-primary/5 border-primary/20"
        )}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        {/* Confetti */}
        <AnimatePresence>
          {showConfetti &&
            Array.from({ length: 5 }).map((_, i) => <ConfettiParticle key={i} index={i} />)
          }
        </AnimatePresence>

        {/* Header row */}
        <motion.div
          className="flex items-center justify-between"
          animate={isFailed ? { x: [0, -4, 4, -2, 2, 0] } : {}}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-center gap-2">
            <span className="text-base" role="img" aria-hidden>
              {isSuccess ? "✅" : isFailed ? "❌" : "⬆️"}
            </span>
            <span className="text-sm font-semibold text-base-content">
              {isSuccess
                ? t("fleetDetail.ota.updatedTo", { version: firmware_version })
                : isFailed
                ? t("fleetDetail.ota.updateFailed")
                : t("fleetDetail.ota.updatingTo", { version: firmware_version })}
            </span>
          </div>

          {status === "DOWNLOADING" && (
            <span className="text-sm font-mono text-primary tabular-nums">
              {progress_percent}%
            </span>
          )}
        </motion.div>

        {/* Progress bar */}
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-base-300/50">
          <motion.div
            className={cn("relative h-full rounded-full overflow-hidden", barColorClass(status),
              status === "PENDING" ? "opacity-40" : "",
              status === "INSTALLING" ? "animate-pulse" : ""
            )}
            initial={{ width: "0%" }}
            animate={{ width: `${barWidth}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          >
            {/* Shimmer (DOWNLOADING only) */}
            {status === "DOWNLOADING" && (
              <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
            )}
          </motion.div>
        </div>

        {/* Status label */}
        <div className="mt-2 flex items-center justify-between">
          <span
            className={cn(
              "text-xs",
              isSuccess ? "text-success/70" :
              isFailed  ? "text-error/70" :
                          "text-base-content/50"
            )}
          >
            {statusLabel}
          </span>

          {/* Cancel (only while active) */}
          {(status === "DOWNLOADING" || status === "PENDING") && onCancel && (
            <button
              onClick={onCancel}
              className="btn btn-ghost btn-xs text-error/70 hover:text-error"
            >
              {t("fleetDetail.ota.cancel")}
            </button>
          )}

          {/* Retry (on failure) */}
          {status === "FAILED" && onRetry && (
            <motion.button
              initial={{ opacity: 0, scale: 0 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: "spring", stiffness: 200 }}
              onClick={onRetry}
              className="btn btn-primary btn-xs"
            >
              {t("fleetDetail.ota.retry")}
            </motion.button>
          )}
        </div>

        {/* Error message */}
        {status === "FAILED" && error_message && (
          <p className="mt-2 text-xs text-error/60 line-clamp-2">{error_message}</p>
        )}

        {/* Step indicators (only for active jobs) */}
        {!isFailed && !isSuccess && (
          <div className="mt-3 flex items-center gap-4">
            {STEPS.map(({ key, label }) => {
              const st = stepStatus(key, status);
              return (
                <span
                  key={key}
                  className={cn(
                    "text-xs",
                    st === "done"    ? "text-success/60" :
                    st === "active"  ? "text-primary" :
                                       "text-base-content/30"
                  )}
                >
                  {st === "done" ? "✅ " : st === "active" ? "📥 " : "○ "}
                  {label}
                </span>
              );
            })}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
