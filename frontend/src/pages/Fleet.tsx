/**
 * Fleet Management page — overview of all edge devices with OTA status.
 *
 * Layout:
 *   - 4 MetricTile stats (online, outdated, offline, updating)
 *   - Filter bar + search
 *   - Device list (DeviceRow per device)
 *   - Empty state when no devices
 *
 * Cloud-only: wrapped in <FeatureGate feature="fleet"> at the route level.
 */

import { useState, useMemo, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { GlowCard } from "@/components/ui/GlowCard";
import { FeatureGate } from "@/components/ui/FeatureGate";
import { DeviceRow } from "@/components/fleet/DeviceRow";
import { NewFirmwareModal } from "@/components/fleet/NewFirmwareModal";
import {
  getFleetOverview,
  listFleetDevices,
  listFirmwareReleases,
  triggerOTAUpdate,
  type FleetDevice,
  type FleetOverview,
  type FirmwareRelease,
} from "@/api/fleet";
import toast from "react-hot-toast";

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------

function DeviceRowSkeleton({ index }: { index: number }) {
  return (
    <motion.div
      className="h-[72px] rounded-xl bg-base-200/60 border border-white/5"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0.4, 0.7, 0.4] }}
      transition={{ duration: 1.5, repeat: Infinity, delay: index * 0.1 }}
    />
  );
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

interface StatCardProps {
  emoji: string;
  value: number;
  label: string;
  variant?: "green" | "warning" | "danger" | "primary";
  loading?: boolean;
}

const VARIANT_VALUE_CLASS: Record<string, string> = {
  green: "text-success",
  warning: "text-warning",
  danger: "text-error",
  primary: "text-primary",
};

function StatCard({ emoji, value, label, variant = "green", loading }: StatCardProps) {
  return (
    <GlowCard
      variant={variant === "danger" ? "danger" : variant === "warning" ? "warning" : "green"}
      glass
      className="p-4"
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl" role="img" aria-hidden="true">{emoji}</span>
        <div className="min-w-0">
          {loading ? (
            <div className="h-7 w-12 animate-pulse rounded bg-base-300/60 mb-1" />
          ) : (
            <p className={`text-2xl font-bold tabular-nums leading-none ${VARIANT_VALUE_CLASS[variant]}`}>
              {value}
            </p>
          )}
          <p className="mt-0.5 text-xs text-base-content/50 leading-tight">{label}</p>
        </div>
      </div>
    </GlowCard>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function EmptyFleet({ onNewRelease }: { onNewRelease: () => void }) {
  const { t } = useTranslation("pages");
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <span className="text-6xl opacity-30" role="img" aria-label="device">📡</span>
      <h3 className="mt-6 text-base-content/50 text-sm font-medium">
        {t("fleet.empty.title")}
      </h3>
      <p className="mt-2 text-base-content/30 text-xs max-w-xs">
        {t("fleet.empty.subtitle")}
      </p>
      <button onClick={onNewRelease} className="btn btn-primary btn-sm mt-6">
        {t("fleet.firmware.newRelease")}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

type FilterStatus = "all" | "online" | "outdated" | "offline" | "updating";

export default function Fleet() {
  const { t } = useTranslation("pages");

  const [overview, setOverview] = useState<FleetOverview | null>(null);
  const [devices, setDevices] = useState<FleetDevice[]>([]);
  const [latestRelease, setLatestRelease] = useState<FirmwareRelease | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [search, setSearch] = useState("");
  const [showNewFirmware, setShowNewFirmware] = useState(false);

  const load = useCallback(async () => {
    try {
      const [ov, devs, releases] = await Promise.all([
        getFleetOverview(),
        listFleetDevices(),
        listFirmwareReleases("STABLE"),
      ]);
      setOverview(ov);
      setDevices(devs);
      const sorted = [...releases].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
      setLatestRelease(sorted[0] ?? null);
    } catch {
      toast.error(t("fleet.loadError"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleUpdate(device: FleetDevice) {
    if (!latestRelease) {
      toast.error(t("fleet.noRelease"));
      return;
    }
    try {
      await triggerOTAUpdate(device.device_id, latestRelease.id);
      toast.success(t("fleet.updateStarted", { name: device.name }));
      load();
    } catch {
      toast.error(t("fleet.updateError"));
    }
  }

  const filteredDevices = useMemo(() => {
    const latestVersion = latestRelease?.version;
    const oneHour = 60 * 60 * 1000;

    return devices.filter((d) => {
      // Search
      if (
        search &&
        !d.name.toLowerCase().includes(search.toLowerCase()) &&
        !d.organization_name.toLowerCase().includes(search.toLowerCase())
      ) {
        return false;
      }

      if (filterStatus === "all") return true;

      const now = Date.now();
      const lastSync = d.last_sync_at ? new Date(d.last_sync_at).getTime() : null;
      const isOnline = lastSync !== null && now - lastSync < oneHour;
      const isUpdating = d.active_ota_job !== null;
      const isOutdated = latestVersion != null && d.firmware_version !== latestVersion;

      if (filterStatus === "updating") return isUpdating;
      if (filterStatus === "online") return isOnline && !isUpdating;
      if (filterStatus === "outdated") return isOnline && isOutdated && !isUpdating;
      if (filterStatus === "offline") return !isOnline && !isUpdating;
      return true;
    });
  }, [devices, filterStatus, search, latestRelease]);

  const FILTER_OPTIONS: { value: FilterStatus; label: string }[] = [
    { value: "all", label: t("fleet.filter.all") },
    { value: "online", label: t("fleet.filter.online") },
    { value: "outdated", label: t("fleet.filter.outdated") },
    { value: "offline", label: t("fleet.filter.offline") },
    { value: "updating", label: t("fleet.filter.updating") },
  ];

  return (
    <FeatureGate feature="fleet">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-base-content">{t("fleet.title")}</h1>
            <p className="mt-1 text-sm text-base-content/50">
              {overview
                ? t("fleet.subtitle", {
                    count: overview.total_devices,
                    orgs: overview.organizations_count,
                  })
                : t("fleet.subtitleLoading")}
            </p>
          </div>
          <button
            onClick={() => setShowNewFirmware(true)}
            className="btn btn-primary btn-sm h-9 shrink-0"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t("fleet.newRelease")}
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatCard
            emoji="🟢"
            value={overview?.online_devices ?? 0}
            label={t("fleet.stats.online")}
            variant="green"
            loading={loading}
          />
          <StatCard
            emoji="🟡"
            value={overview?.outdated_devices ?? 0}
            label={t("fleet.stats.outdated")}
            variant="warning"
            loading={loading}
          />
          <StatCard
            emoji="🔴"
            value={overview?.offline_devices ?? 0}
            label={t("fleet.stats.offline")}
            variant="danger"
            loading={loading}
          />
          <StatCard
            emoji="📦"
            value={overview?.active_ota_jobs ?? 0}
            label={t("fleet.stats.updating")}
            variant="primary"
            loading={loading}
          />
        </div>

        {/* Filter + Search bar */}
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-base-200/40 px-4 h-auto py-3 sm:py-0 sm:h-12">
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFilterStatus(opt.value)}
                className={`rounded-lg px-3 py-1 text-xs font-medium transition-colors ${
                  filterStatus === opt.value
                    ? "bg-primary/20 text-primary"
                    : "text-base-content/50 hover:text-base-content"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2 rounded-lg bg-base-200/60 px-3 py-1.5 border border-white/5">
            <svg className="h-3.5 w-3.5 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("fleet.search")}
              className="bg-transparent text-sm text-base-content outline-none placeholder:text-base-content/30 w-40"
            />
          </div>
        </div>

        {/* Device list */}
        <div className="space-y-3">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => <DeviceRowSkeleton key={i} index={i} />)
          ) : filteredDevices.length === 0 && devices.length === 0 ? (
            <EmptyFleet onNewRelease={() => setShowNewFirmware(true)} />
          ) : filteredDevices.length === 0 ? (
            <div className="py-12 text-center text-sm text-base-content/40">
              {t("fleet.noResults")}
            </div>
          ) : (
            filteredDevices.map((device, i) => (
              <DeviceRow
                key={device.device_id}
                device={device}
                index={i}
                latestVersion={latestRelease?.version}
                onUpdate={handleUpdate}
              />
            ))
          )}
        </div>
      </div>

      <NewFirmwareModal
        open={showNewFirmware}
        onClose={() => setShowNewFirmware(false)}
        onSuccess={load}
      />
    </FeatureGate>
  );
}
