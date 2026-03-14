/**
 * FleetDeviceDetail — `/fleet/:deviceId`
 *
 * Tabbed device detail page:
 *   Overview   — System Health gauges + Firmware card + Resource Usage chart
 *   Metrics    — Table of recent recorded metrics
 *   OTA History — Vertical timeline of firmware updates
 *   Logs        — Placeholder (coming soon)
 *
 * Cloud-only feature, gated by <FeatureGate feature="fleet">.
 *
 * Layout:
 *   Desktop: max-w-5xl, two-column cards in Overview (System Health + Firmware)
 *   Mobile:  single column, stacked cards
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { format, formatDistanceToNow, subHours, parseISO } from "date-fns";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from "recharts";
import toast from "react-hot-toast";

import { FeatureGate } from "@/components/ui/FeatureGate";
import { ResourceGauge } from "@/components/fleet/ResourceGauge";
import { OTAProgressCard } from "@/components/fleet/OTAProgressCard";
import { cn } from "@/utils/cn";
import {
  getFleetDevice,
  listFirmwareReleases,
  triggerOTAUpdate,
  rollbackDevice,
  type FleetDeviceDetail as FleetDeviceDetailType,
  type FirmwareRelease,
  type FirmwareChannel,
  type DeviceMetrics,
} from "@/api/fleet";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const parts: string[] = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(" ");
}

function formatDuration(startedAt: string | null, completedAt: string | null): string {
  if (!startedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(startedAt).getTime();
  const totalSeconds = Math.floor(ms / 1000);
  const min = Math.floor(totalSeconds / 60);
  const sec = totalSeconds % 60;
  return min > 0 ? `${min}min ${sec}s` : `${sec}s`;
}

type Period = "1h" | "24h";

function filterMetricsByPeriod(metrics: DeviceMetrics[], period: Period): DeviceMetrics[] {
  const cutoff = period === "1h" ? subHours(new Date(), 1) : subHours(new Date(), 24);
  return metrics
    .filter((m) => parseISO(m.recorded_at) >= cutoff)
    .sort((a, b) => parseISO(a.recorded_at).getTime() - parseISO(b.recorded_at).getTime());
}

function metricsToChartData(metrics: DeviceMetrics[]) {
  return metrics.map((m) => ({
    time: format(parseISO(m.recorded_at), "HH:mm"),
    cpu: Math.round(m.cpu_percent),
    mem: Math.round(m.memory_percent),
    disk: Math.round(m.disk_percent),
  }));
}

type OTAJobStatus = "PENDING" | "DOWNLOADING" | "INSTALLING" | "SUCCESS" | "FAILED" | "ROLLED_BACK";

function timelineDotClass(status: OTAJobStatus): string {
  if (status === "SUCCESS") return "bg-success";
  if (status === "FAILED") return "bg-error";
  if (status === "ROLLED_BACK") return "bg-warning";
  return "bg-primary animate-pulse";
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative h-9 rounded-lg px-4 text-sm transition-colors duration-200",
        active
          ? "bg-base-100 text-base-content shadow-sm"
          : "text-base-content/50 hover:text-base-content/80"
      )}
    >
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function DetailSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-12 rounded-xl bg-base-200/60 w-64" />
      <div className="h-9 rounded-xl bg-base-200/40 w-80" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="h-52 rounded-xl bg-base-200/60" />
        <div className="h-52 rounded-xl bg-base-200/60" />
      </div>
      <div className="h-64 rounded-xl bg-base-200/60" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Custom chart tooltip
// ---------------------------------------------------------------------------

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-white/10 bg-base-300 p-3 text-xs shadow-xl">
      <p className="mb-1 font-medium text-base-content/70">{label}</p>
      {payload.map((entry: any) => (
        <div key={entry.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: entry.color }} />
          <span className="text-base-content/60">{entry.name}</span>
          <span className="ml-auto font-mono text-base-content">{entry.value}%</span>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  device,
  releases,
  selectedChannel,
  onChannelChange,
  onForceUpdate,
  onRollback,
  onJobDismiss,
}: {
  device: FleetDeviceDetailType;
  releases: FirmwareRelease[];
  selectedChannel: FirmwareChannel;
  onChannelChange: (c: FirmwareChannel) => void;
  onForceUpdate: () => void;
  onRollback: () => void;
  onJobDismiss: () => void;
}) {
  const { t } = useTranslation("pages");
  const [period, setPeriod] = useState<Period>("24h");

  const metrics = device.latest_metrics;
  const activeJob = device.active_ota_job;
  const latestInChannel = [...releases]
    .filter((r) => r.channel === selectedChannel && r.is_active)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

  const isUpToDate = latestInChannel
    ? device.firmware_version === latestInChannel.version
    : true;

  const chartData = metricsToChartData(filterMetricsByPeriod(device.metrics_24h, period));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Two-column cards */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* System Health */}
        <div className="rounded-xl border border-white/5 bg-base-200/60 backdrop-blur-md p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-base-content/50">
            {t("fleetDetail.systemHealth.title")}
          </h3>

          {metrics ? (
            <div className="space-y-1">
              <ResourceGauge
                label="CPU"
                value={Math.round(metrics.cpu_percent)}
                unit="%"
              />
              <ResourceGauge
                label="MEM"
                value={Math.round(metrics.memory_percent)}
                unit="%"
              />
              <ResourceGauge
                label="DISK"
                value={Math.round(metrics.disk_percent)}
                unit="%"
              />
              {metrics.cpu_temperature != null && (
                <ResourceGauge
                  label="TEMP"
                  value={Math.round(metrics.cpu_temperature)}
                  max={100}
                  unit="°C"
                />
              )}

              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs text-base-content/40">
                {metrics.uptime_seconds != null && (
                  <span>
                    {t("fleetDetail.systemHealth.uptime")}: {formatUptime(metrics.uptime_seconds)}
                  </span>
                )}
                {metrics.network_latency_ms != null && (
                  <span>
                    {t("fleetDetail.systemHealth.latency")}: {metrics.network_latency_ms}ms
                  </span>
                )}
              </div>
            </div>
          ) : (
            <p className="text-xs text-base-content/30">{t("fleetDetail.systemHealth.noMetrics")}</p>
          )}
        </div>

        {/* Firmware */}
        <div className="rounded-xl border border-white/5 bg-base-200/60 backdrop-blur-md p-5">
          <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-base-content/50">
            {t("fleetDetail.firmware.title")}
          </h3>

          {/* Active OTA job */}
          {activeJob ? (
            <OTAProgressCard
              job={activeJob}
              onDismiss={onJobDismiss}
            />
          ) : (
            <div className="space-y-4">
              {/* Current version */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/50">{t("fleetDetail.firmware.current")}</span>
                <span className="rounded-md border border-success/20 bg-base-300/50 px-2 py-0.5 text-xs font-mono text-success/80">
                  {device.firmware_version}
                </span>
              </div>

              {/* Channel selector */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/50">{t("fleetDetail.firmware.channel")}</span>
                <select
                  value={selectedChannel}
                  onChange={(e) => onChannelChange(e.target.value as FirmwareChannel)}
                  className="h-8 rounded-lg border border-white/10 bg-base-200/60 px-2 text-xs text-base-content focus:border-primary/50 focus:outline-none"
                >
                  <option value="STABLE">Stable</option>
                  <option value="BETA">Beta</option>
                  <option value="NIGHTLY">Nightly</option>
                </select>
              </div>

              {/* Latest in channel */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-base-content/50">{t("fleetDetail.firmware.latest")}</span>
                {latestInChannel ? (
                  isUpToDate ? (
                    <span className="flex items-center gap-1 text-xs text-success/70">
                      {latestInChannel.version} ✓ {t("fleetDetail.firmware.upToDate")}
                    </span>
                  ) : (
                    <span className="rounded-md border border-warning/30 px-2 py-0.5 text-xs font-mono text-warning">
                      {latestInChannel.version}
                    </span>
                  )
                ) : (
                  <span className="text-xs text-base-content/30">{t("fleetDetail.firmware.noRelease")}</span>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={onForceUpdate}
                  disabled={isUpToDate || !latestInChannel}
                  className="btn btn-outline btn-sm flex-1 disabled:opacity-40"
                >
                  {t("fleetDetail.firmware.forceUpdate")}
                </button>
                <button
                  onClick={onRollback}
                  className="btn btn-outline btn-sm flex-1"
                >
                  {t("fleetDetail.firmware.rollback")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Resource usage chart */}
      <div className="rounded-xl border border-white/5 bg-base-200/60 backdrop-blur-md p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-base-content/50">
            {t("fleetDetail.resources.title")}
          </h3>
          <div className="flex items-center gap-1 rounded-lg bg-base-300/40 p-0.5">
            {(["1h", "24h"] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs transition-colors",
                  period === p
                    ? "bg-base-100 text-base-content shadow-sm"
                    : "text-base-content/40 hover:text-base-content/70"
                )}
              >
                {t(`fleetDetail.resources.periods.${p}`)}
              </button>
            ))}
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="flex h-48 items-center justify-center text-xs text-base-content/30">
            {t("fleetDetail.resources.noData")}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: "rgba(255,255,255,0.4)" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip content={<ChartTooltip />} />
              <Legend
                iconType="circle"
                iconSize={6}
                wrapperStyle={{ fontSize: "11px", color: "rgba(255,255,255,0.5)", paddingTop: "8px" }}
              />
              <ReferenceLine
                y={80}
                stroke="rgba(255,179,0,0.3)"
                strokeDasharray="4 4"
              />
              <Line
                type="monotone"
                dataKey="cpu"
                stroke="#00ff9c"
                strokeWidth={1.5}
                dot={false}
                name="CPU"
                aria-label="CPU usage"
              />
              <Line
                type="monotone"
                dataKey="mem"
                stroke="#00d9ff"
                strokeWidth={1.5}
                dot={false}
                name="MEM"
                aria-label="Memory usage"
              />
              <Line
                type="monotone"
                dataKey="disk"
                stroke="#ffb300"
                strokeWidth={1.5}
                dot={false}
                name="DISK"
                aria-label="Disk usage"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Metrics tab
// ---------------------------------------------------------------------------

function MetricsTab({ device }: { device: FleetDeviceDetailType }) {
  const { t } = useTranslation("pages");
  const sorted = [...device.metrics_24h].sort(
    (a, b) => parseISO(b.recorded_at).getTime() - parseISO(a.recorded_at).getTime()
  );

  if (sorted.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-12 text-center text-sm text-base-content/30"
      >
        {t("fleetDetail.metrics.noData")}
      </motion.div>
    );
  }

  function metricColor(val: number) {
    if (val >= 90) return "text-error";
    if (val >= 70) return "text-warning";
    return "text-base-content/70";
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="overflow-x-auto rounded-xl border border-white/5 bg-base-200/60 backdrop-blur-md"
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-white/5 text-left text-base-content/40 uppercase tracking-wider">
            <th className="px-4 py-3">{t("fleetDetail.metrics.time")}</th>
            <th className="px-4 py-3">CPU</th>
            <th className="px-4 py-3">MEM</th>
            <th className="px-4 py-3">DISK</th>
            <th className="px-4 py-3">TEMP</th>
            <th className="px-4 py-3">{t("fleetDetail.metrics.latency")}</th>
            <th className="px-4 py-3">{t("fleetDetail.metrics.uptime")}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((m, i) => (
            <tr
              key={m.id}
              className={cn(
                "border-b border-white/5 transition-colors hover:bg-base-200/40",
                i % 2 === 0 ? "bg-transparent" : "bg-base-200/20"
              )}
            >
              <td className="px-4 py-2.5 font-mono text-base-content/50">
                {format(parseISO(m.recorded_at), "HH:mm:ss")}
              </td>
              <td className={cn("px-4 py-2.5 font-mono", metricColor(m.cpu_percent))}>
                {Math.round(m.cpu_percent)}%
              </td>
              <td className={cn("px-4 py-2.5 font-mono", metricColor(m.memory_percent))}>
                {Math.round(m.memory_percent)}%
              </td>
              <td className={cn("px-4 py-2.5 font-mono", metricColor(m.disk_percent))}>
                {Math.round(m.disk_percent)}%
              </td>
              <td className={cn("px-4 py-2.5 font-mono",
                m.cpu_temperature != null && m.cpu_temperature > 80 ? "text-error" :
                m.cpu_temperature != null && m.cpu_temperature > 60 ? "text-warning" :
                "text-base-content/50"
              )}>
                {m.cpu_temperature != null ? `${Math.round(m.cpu_temperature)}°C` : "—"}
              </td>
              <td className="px-4 py-2.5 font-mono text-base-content/50">
                {m.network_latency_ms != null ? `${m.network_latency_ms}ms` : "—"}
              </td>
              <td className="px-4 py-2.5 text-base-content/50">
                {m.uptime_seconds != null ? formatUptime(m.uptime_seconds) : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// OTA History tab
// ---------------------------------------------------------------------------

function OTAHistoryTab({ device }: { device: FleetDeviceDetailType }) {
  const { t } = useTranslation("pages");

  if (device.ota_history.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="py-12 text-center text-sm text-base-content/30"
      >
        {t("fleetDetail.otaHistory.empty")}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative pl-6"
    >
      {/* Vertical line */}
      <div className="absolute left-2.5 top-0 bottom-0 w-0.5 bg-base-content/10" />

      {device.ota_history.map((job, i) => {
        const st = job.status as OTAJobStatus;
        return (
          <motion.div
            key={job.id}
            className="relative mb-8 last:mb-0"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: i * 0.05 }}
          >
            {/* Dot */}
            <div
              className={cn(
                "absolute -left-6 top-1 w-3 h-3 rounded-full border-2 border-base-100",
                timelineDotClass(st)
              )}
            />

            {/* Content */}
            <div className="text-xs text-base-content/40 font-mono">
              {format(parseISO(job.created_at), "yyyy-MM-dd HH:mm")}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="text-sm text-base-content">
                {job.previous_version
                  ? `v${job.previous_version} → v${job.firmware_version}`
                  : `v${job.firmware_version}`}
              </span>
              <span
                className={cn(
                  "rounded-md border px-1.5 py-0.5 text-xs font-medium",
                  st === "SUCCESS"     ? "border-success/20 text-success/70" :
                  st === "FAILED"      ? "border-error/20 text-error/70" :
                  st === "ROLLED_BACK" ? "border-warning/20 text-warning/70" :
                                        "border-primary/20 text-primary"
                )}
              >
                {t(`fleetDetail.otaHistory.status.${st.toLowerCase()}`)}
              </span>
            </div>

            {/* Duration */}
            {(st === "SUCCESS" || st === "FAILED" || st === "ROLLED_BACK") && (
              <p className="mt-1 text-xs text-base-content/40">
                {t("fleetDetail.otaHistory.duration")}: {formatDuration(job.started_at, job.completed_at)}
              </p>
            )}

            {/* Error */}
            {job.error_message && (
              <p className="mt-1 text-xs text-error/60 italic">{job.error_message}</p>
            )}
          </motion.div>
        );
      })}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Logs tab placeholder
// ---------------------------------------------------------------------------

function LogsTab() {
  const { t } = useTranslation("pages");
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex flex-col items-center justify-center py-20 text-center"
    >
      <span className="text-4xl opacity-30" role="img" aria-label="logs">📋</span>
      <p className="mt-4 text-sm text-base-content/40">{t("fleetDetail.logs.comingSoon")}</p>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Status indicator
// ---------------------------------------------------------------------------

function DeviceStatusBadge({ device }: { device: FleetDeviceDetailType }) {
  const { t } = useTranslation("pages");
  const lastSync = device.last_sync_at ? new Date(device.last_sync_at) : null;
  const isOnline = lastSync !== null && Date.now() - lastSync.getTime() < 60 * 60 * 1000;

  return (
    <span className="flex items-center gap-1.5 text-sm">
      <span
        className={cn(
          "h-2 w-2 rounded-full",
          isOnline ? "bg-success animate-[pulse_1.5s_ease-in-out_infinite]" : "bg-error"
        )}
      />
      <span className={isOnline ? "text-success/80" : "text-error/70"}>
        {isOnline ? t("fleetDetail.status.online") : t("fleetDetail.status.offline")}
      </span>
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type Tab = "overview" | "metrics" | "otaHistory" | "logs";

export default function FleetDeviceDetail() {
  const { deviceId } = useParams<{ deviceId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("pages");

  const [device, setDevice] = useState<FleetDeviceDetailType | null>(null);
  const [releases, setReleases] = useState<FirmwareRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [selectedChannel, setSelectedChannel] = useState<FirmwareChannel>("STABLE");

  // Keep device ref for polling without stale closure issues
  const deviceRef = useRef<FleetDeviceDetailType | null>(null);
  deviceRef.current = device;

  const load = useCallback(async () => {
    if (!deviceId) return;
    try {
      const [dev, rels] = await Promise.all([
        getFleetDevice(deviceId),
        listFirmwareReleases(),
      ]);
      setDevice(dev);
      setReleases(rels);
    } catch {
      toast.error(t("fleetDetail.loadError"));
    } finally {
      setLoading(false);
    }
  }, [deviceId, t]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while an OTA job is active
  useEffect(() => {
    const activeStatuses = ["PENDING", "DOWNLOADING", "INSTALLING"];
    const hasActiveJob = device?.active_ota_job &&
      activeStatuses.includes(device.active_ota_job.status);

    if (!hasActiveJob) return;
    const interval = setInterval(load, 5000);
    return () => clearInterval(interval);
  }, [device?.active_ota_job?.status, load]);

  async function handleForceUpdate() {
    if (!device || !deviceId) return;
    const latestInChannel = [...releases]
      .filter((r) => r.channel === selectedChannel && r.is_active)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0];

    if (!latestInChannel) {
      toast.error(t("fleetDetail.firmware.noRelease"));
      return;
    }
    try {
      await triggerOTAUpdate(deviceId, latestInChannel.id);
      toast.success(t("fleetDetail.firmware.updateStarted"));
      load();
    } catch {
      toast.error(t("fleetDetail.firmware.updateError"));
    }
  }

  async function handleRollback() {
    if (!deviceId) return;
    try {
      await rollbackDevice(deviceId);
      toast.success(t("fleetDetail.firmware.rollbackStarted"));
      load();
    } catch {
      toast.error(t("fleetDetail.firmware.rollbackError"));
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "overview",   label: t("fleetDetail.tabs.overview") },
    { key: "metrics",    label: t("fleetDetail.tabs.metrics") },
    { key: "otaHistory", label: t("fleetDetail.tabs.otaHistory") },
    { key: "logs",       label: t("fleetDetail.tabs.logs") },
  ];

  return (
    <FeatureGate feature="fleet">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
        >
          {/* Breadcrumb */}
          <nav className="mb-2 flex items-center gap-1 text-sm text-base-content/40">
            <Link to="/fleet" className="hover:text-base-content/70 transition-colors flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t("fleetDetail.backToFleet")}
            </Link>
          </nav>

          {loading ? (
            <div className="h-10 w-64 animate-pulse rounded-xl bg-base-200/60" />
          ) : device ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-xl font-semibold text-base-content">{device.name}</h1>
                  <DeviceStatusBadge device={device} />
                </div>
                <p className="mt-1 text-sm text-base-content/50">
                  {device.organization_name} •{" "}
                  {t("fleetDetail.registered", {
                    date: format(parseISO(device.created_at), "yyyy-MM-dd"),
                  })}
                </p>
              </div>
              {device.last_sync_at && (
                <span className="text-xs text-base-content/30">
                  {formatDistanceToNow(parseISO(device.last_sync_at), { addSuffix: true })}
                </span>
              )}
            </div>
          ) : null}
        </motion.div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl bg-base-200/40 p-1 w-fit flex-wrap">
          {TABS.map(({ key, label }) => (
            <TabButton
              key={key}
              label={label}
              active={activeTab === key}
              onClick={() => setActiveTab(key)}
            />
          ))}
        </div>

        {/* Content */}
        {loading ? (
          <DetailSkeleton />
        ) : !device ? (
          <div className="py-20 text-center">
            <p className="text-sm text-base-content/40">{t("fleetDetail.deviceNotFound")}</p>
            <button
              onClick={() => navigate("/fleet")}
              className="btn btn-ghost btn-sm mt-4"
            >
              {t("fleetDetail.backToFleet")}
            </button>
          </div>
        ) : (
          <>
            {activeTab === "overview" && (
              <OverviewTab
                device={device}
                releases={releases}
                selectedChannel={selectedChannel}
                onChannelChange={setSelectedChannel}
                onForceUpdate={handleForceUpdate}
                onRollback={handleRollback}
                onJobDismiss={load}
              />
            )}
            {activeTab === "metrics"    && <MetricsTab device={device} />}
            {activeTab === "otaHistory" && <OTAHistoryTab device={device} />}
            {activeTab === "logs"       && <LogsTab />}
          </>
        )}
      </div>
    </FeatureGate>
  );
}
