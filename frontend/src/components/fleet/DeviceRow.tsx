/**
 * DeviceRow — single device card in the fleet list.
 *
 * States:
 *   online + up-to-date : green pulse, normal border
 *   online + outdated   : green pulse, warning border, [Update] button
 *   updating            : warning pulse (1s), primary border, progress bar
 *   offline < 1h        : static red dot, normal border, muted card
 *   offline > 24h       : static red dot, error border, error tinted card
 *
 * Animations:
 *   mount: opacity 0→1, y 12→0, 400ms ease-out, staggered by index × 60ms
 *   hover: bg brightens, border lightens, 200ms ease-out
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import type { FleetDevice } from "@/api/fleet";

interface DeviceRowProps {
  device: FleetDevice;
  index: number;
  latestVersion?: string;
  onUpdate?: (device: FleetDevice) => void;
}

type DeviceStatus = "online-current" | "online-outdated" | "updating" | "offline-recent" | "offline-critical";

function getDeviceStatus(device: FleetDevice, latestVersion?: string): DeviceStatus {
  const activeJob = device.active_ota_job;
  if (activeJob) return "updating";

  const lastSync = device.last_sync_at ? new Date(device.last_sync_at) : null;
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  const twentyFourHours = 24 * oneHour;

  const isOnline = lastSync !== null && now - lastSync.getTime() < oneHour;

  if (!isOnline) {
    if (lastSync && now - lastSync.getTime() < twentyFourHours) return "offline-recent";
    return "offline-critical";
  }

  if (latestVersion && device.firmware_version !== latestVersion) return "online-outdated";
  return "online-current";
}

function StatusDot({ status }: { status: DeviceStatus }) {
  const base = "w-2.5 h-2.5 rounded-full shrink-0";
  if (status === "updating")
    return <span className={cn(base, "bg-warning animate-[pulse_1s_ease-in-out_infinite]")} />;
  if (status === "online-current" || status === "online-outdated")
    return <span className={cn(base, "bg-success animate-[pulse_1.5s_ease-in-out_infinite]")} />;
  return <span className={cn(base, "bg-error")} />;
}

function VersionBadge({ version, status }: { version: string; status: DeviceStatus }) {
  const base = "rounded-md border px-2 py-0.5 text-xs font-mono";
  if (status === "online-outdated")
    return <span className={cn(base, "border-warning/30 text-warning")}>{version}</span>;
  if (status === "updating")
    return <span className={cn(base, "border-primary/30 text-primary")}>{version}</span>;
  if (status === "offline-critical")
    return (
      <span className={cn(base, "border-error/20 text-error/60 opacity-60")}>{version}</span>
    );
  return (
    <span className={cn(base, "border-success/20 text-success/80 bg-base-300/50")}>{version}</span>
  );
}

function MetricsInline({ device }: { device: FleetDevice }) {
  const metrics = device.latest_metrics;
  if (!metrics) return <span className="text-xs text-base-content/30">No metrics</span>;

  function metricColor(val: number) {
    if (val >= 90) return "text-error";
    if (val >= 70) return "text-warning";
    return "text-base-content/50";
  }

  return (
    <span className="flex items-center gap-3 text-xs">
      <span className={metricColor(metrics.cpu_percent)}>
        CPU {Math.round(metrics.cpu_percent)}%
      </span>
      <span className={metricColor(metrics.memory_percent)}>
        MEM {Math.round(metrics.memory_percent)}%
      </span>
      <span className={metricColor(metrics.disk_percent)}>
        DISK {Math.round(metrics.disk_percent)}%
      </span>
      {metrics.cpu_temperature != null && (
        <span className={metricColor(metrics.cpu_temperature > 80 ? 90 : metrics.cpu_temperature > 60 ? 70 : 0)}>
          {Math.round(metrics.cpu_temperature)}°C
        </span>
      )}
    </span>
  );
}

function OTAProgressBar({ progress }: { progress: number }) {
  return (
    <div className="w-20 h-1.5 rounded-full bg-base-300 overflow-hidden">
      <motion.div
        className="h-full rounded-full bg-primary relative overflow-hidden"
        initial={{ width: "0%" }}
        animate={{ width: `${progress}%` }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        {/* Shimmer */}
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      </motion.div>
    </div>
  );
}

function containerClasses(status: DeviceStatus): string {
  const base =
    "rounded-xl border p-4 backdrop-blur-md transition-all duration-200";
  if (status === "updating")
    return cn(base, "bg-primary/5 border-primary/30");
  if (status === "offline-critical")
    return cn(base, "bg-error/5 border-error/20");
  if (status === "online-outdated")
    return cn(base, "bg-base-200/60 border-warning/20 hover:border-warning/30 hover:bg-base-200/80");
  return cn(base, "bg-base-200/60 border-white/5 hover:border-white/10 hover:bg-base-200/80");
}

export function DeviceRow({ device, index, latestVersion, onUpdate }: DeviceRowProps) {
  const { t } = useTranslation("pages");
  const [menuOpen, setMenuOpen] = useState(false);
  const status = getDeviceStatus(device, latestVersion);
  const activeJob = device.active_ota_job;

  const lastSeenLabel = device.last_sync_at
    ? formatDistanceToNow(new Date(device.last_sync_at), { addSuffix: true })
    : t("fleet.neverSeen");

  return (
    <motion.div
      data-testid="device-row"
      data-status={status}
      className={containerClasses(status)}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.4,
        ease: [0.25, 0.46, 0.45, 0.94],
        delay: index * 0.06,
      }}
    >
      <div className="flex items-center gap-4">
        {/* Left: status dot + name + org */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <StatusDot status={status} />
          <div className="min-w-0">
            <span className="text-sm font-semibold text-base-content truncate block">
              {device.name}
            </span>
            <span className="text-xs text-base-content/50 truncate block">
              {device.organization_name}
            </span>
          </div>
        </div>

        {/* Center: version badge + inline metrics */}
        <div className="hidden sm:flex items-center gap-6 min-w-0">
          <VersionBadge version={device.firmware_version} status={status} />
          <MetricsInline device={device} />
        </div>

        {/* Right: last seen + action */}
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-base-content/40 hidden md:block">{lastSeenLabel}</span>

          {status === "online-outdated" && (
            <button
              onClick={() => onUpdate?.(device)}
              className="btn btn-primary btn-xs rounded-lg h-7"
            >
              {t("fleet.update")}
            </button>
          )}

          {status === "updating" && activeJob && (
            <div className="flex items-center gap-2">
              <OTAProgressBar progress={activeJob.progress_percent} />
              <span className="text-xs font-mono text-primary tabular-nums">
                {activeJob.progress_percent}%
              </span>
            </div>
          )}

          {/* Actions menu */}
          <div className="relative">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="btn btn-ghost btn-xs"
              aria-label={t("fleet.actions")}
            >
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
              </svg>
            </button>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setMenuOpen(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-44 rounded-xl border border-white/10 bg-base-100 py-1 shadow-xl">
                  <a
                    href={`/fleet/${device.device_id}`}
                    className="flex items-center gap-2 px-3 py-2 text-sm text-base-content/70 hover:bg-base-200 hover:text-base-content"
                    onClick={() => setMenuOpen(false)}
                  >
                    {t("fleet.menu.viewDetails")}
                  </a>
                  <button
                    onClick={() => { onUpdate?.(device); setMenuOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-base-content/70 hover:bg-base-200 hover:text-base-content"
                  >
                    {t("fleet.menu.forceUpdate")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile: version + metrics row */}
      <div className="mt-2 flex flex-wrap items-center gap-3 sm:hidden">
        <VersionBadge version={device.firmware_version} status={status} />
        <MetricsInline device={device} />
        <span className="text-xs text-base-content/40">{lastSeenLabel}</span>
      </div>
    </motion.div>
  );
}
