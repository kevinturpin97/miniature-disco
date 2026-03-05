/**
 * Sync Administration page (Sprint 27 — Edge Sync Agent).
 *
 * Shows:
 *  - Sync backlog summary
 *  - Per-device status cards
 *  - Sync history (last 50 batches per device)
 *  - Edge device management (register / deactivate)
 */

import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/utils/cn";
import {
  getSyncStatus,
  listEdgeDevices,
  createEdgeDevice,
  deleteEdgeDevice,
  getDeviceSyncHistory,
  type SyncStatus,
  type EdgeDevice,
  type SyncBatch,
} from "@/api/sync";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusBadge(s: SyncBatch["status"] | "PENDING" | "SUCCESS" | "FAILED" | "RETRY") {
  const map: Record<string, string> = {
    SUCCESS: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    FAILED: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    RETRY: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    PENDING: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
  };
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", map[s] ?? map.PENDING)}>
      {s}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Backlog summary card
// ---------------------------------------------------------------------------

function BacklogCard({ status }: { status: SyncStatus }) {
  const { t } = useTranslation("pages");
  const total = status.total_backlog;
  const hasRetries = status.devices.some((d) => d.pending_retries > 0);

  return (
    <div className={cn(
      "rounded-xl border p-5",
      total === 0 && !hasRetries
        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-900/20"
        : hasRetries
          ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20"
          : "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
    )}>
      <div className="mb-3 flex items-center gap-2">
        <span className="text-2xl font-bold text-foreground">{total}</span>
        <span className="text-sm text-muted-foreground">{t("sync.pendingRecords", "records pending sync")}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Object.entries(status.backlog_detail).map(([key, val]) => (
          <div key={key} className="rounded-lg bg-card/60 p-3 text-center">
            <p className="text-lg font-semibold text-foreground">{val}</p>
            <p className="text-xs capitalize text-muted-foreground">{key.replace("_", " ")}</p>
          </div>
        ))}
      </div>
      {hasRetries && (
        <p className="mt-3 text-sm font-medium text-red-700 dark:text-red-400">
          ⚠ One or more devices have failed syncs pending retry.
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Device card with expandable history
// ---------------------------------------------------------------------------

function DeviceCard({ device, orgSlug, onDeactivate }: {
  device: EdgeDevice;
  orgSlug: string;
  onDeactivate: (id: string) => void;
}) {
  const [history, setHistory] = useState<SyncBatch[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const loadHistory = async () => {
    if (history !== null) return; // already loaded
    setLoading(true);
    try {
      const data = await getDeviceSyncHistory(device.device_id);
      setHistory(data);
    } catch {
      toast.error("Failed to load sync history.");
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = () => {
    if (!expanded) loadHistory();
    setExpanded(!expanded);
  };

  const handleDeactivate = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    try {
      await deleteEdgeDevice(device.device_id);
      toast.success(`Device '${device.name}' deactivated.`);
      onDeactivate(device.device_id);
    } catch {
      toast.error("Failed to deactivate device.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex items-start justify-between p-4">
        <div>
          <h3 className="font-semibold text-foreground">{device.name}</h3>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground">{device.device_id}</p>
          {device.firmware_version && (
            <p className="text-xs text-muted-foreground">fw {device.firmware_version}</p>
          )}
          <p className="mt-1 text-xs text-muted-foreground">
            Last sync: {formatDate(device.last_sync_at)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!device.is_active && (
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Inactive
            </span>
          )}
          {device.is_active && (
            <button
              onClick={handleDeactivate}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                confirming
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {confirming ? "Confirm?" : "Deactivate"}
            </button>
          )}
          <button
            onClick={handleExpand}
            className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
          >
            {expanded ? "Hide history" : "View history"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 pb-4 pt-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Last 50 sync batches
          </h4>
          {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!loading && history?.length === 0 && (
            <p className="text-sm text-muted-foreground">No sync history yet.</p>
          )}
          {!loading && history && history.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-muted-foreground">
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2 pr-4">Records</th>
                    <th className="pb-2 pr-4">Size (KB)</th>
                    <th className="pb-2 pr-4">Retries</th>
                    <th className="pb-2 pr-4">Started</th>
                    <th className="pb-2">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((batch) => (
                    <tr key={batch.id} className="border-b border-border/50 last:border-0">
                      <td className="py-2 pr-4">{statusBadge(batch.status)}</td>
                      <td className="py-2 pr-4 tabular-nums">{batch.records_count}</td>
                      <td className="py-2 pr-4 tabular-nums">{batch.payload_size_kb.toFixed(1)}</td>
                      <td className="py-2 pr-4 tabular-nums">{batch.retry_count}</td>
                      <td className="py-2 pr-4 text-xs text-muted-foreground">{formatDate(batch.started_at)}</td>
                      <td className="py-2 max-w-xs truncate text-xs text-muted-foreground" title={batch.error_message}>
                        {batch.error_message || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Register device modal (simple inline form)
// ---------------------------------------------------------------------------

function RegisterDeviceForm({ orgSlug, onCreated }: {
  orgSlug: string;
  onCreated: (device: EdgeDevice) => void;
}) {
  const [name, setName] = useState("");
  const [firmware, setFirmware] = useState("");
  const [loading, setLoading] = useState(false);
  const [createdDevice, setCreatedDevice] = useState<EdgeDevice | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const device = await createEdgeDevice(orgSlug, { name: name.trim(), firmware_version: firmware.trim() || undefined });
      setCreatedDevice(device);
      onCreated(device);
      toast.success(`Device '${device.name}' registered!`);
    } catch {
      toast.error("Failed to register device.");
    } finally {
      setLoading(false);
    }
  };

  if (createdDevice) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 dark:border-emerald-800 dark:bg-emerald-900/20">
        <p className="mb-2 font-semibold text-foreground">Device registered!</p>
        <p className="mb-1 text-sm text-muted-foreground">Save this secret key — it will not be shown again:</p>
        <div className="rounded-lg bg-card p-3 font-mono text-sm break-all select-all border border-border">
          {createdDevice.secret_key}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Device ID: <span className="font-mono">{createdDevice.device_id}</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-xl border border-border bg-card p-5">
      <h3 className="mb-4 font-semibold text-foreground">Register New Device</h3>
      <div className="space-y-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Device Name *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Raspberry Pi Site Nord"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Firmware Version</label>
          <input
            type="text"
            value={firmware}
            onChange={(e) => setFirmware(e.target.value)}
            placeholder="1.0.0"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !name.trim()}
          className="w-full rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
        >
          {loading ? "Registering…" : "Register Device"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function Sync() {
  const { t } = useTranslation("pages");
  const org = useAuthStore((s) => s.currentOrganization);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [devices, setDevices] = useState<EdgeDevice[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [showRegisterForm, setShowRegisterForm] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [status, devList] = await Promise.all([
        getSyncStatus(),
        org ? listEdgeDevices(org.slug) : Promise.resolve([]),
      ]);
      setSyncStatus(status);
      setDevices(devList);
    } catch {
      // handled by API client toasts
    } finally {
      setStatusLoading(false);
    }
  }, [org]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30_000);
    return () => clearInterval(interval);
  }, [loadData]);

  const handleDeviceDeactivated = (deviceId: string) => {
    setDevices((prev) => prev.filter((d) => d.device_id !== deviceId));
  };

  const handleDeviceCreated = (device: EdgeDevice) => {
    setDevices((prev) => [...prev, device]);
    setShowRegisterForm(false);
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("sync.title", "Edge Sync")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("sync.subtitle", "Monitor and manage data synchronization between edge devices and the cloud.")}
          </p>
        </div>
        <button
          onClick={() => setShowRegisterForm(!showRegisterForm)}
          className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          Register Device
        </button>
      </div>

      {/* Register form */}
      {showRegisterForm && org && (
        <RegisterDeviceForm orgSlug={org.slug} onCreated={handleDeviceCreated} />
      )}

      {/* Backlog summary */}
      {statusLoading ? (
        <div className="h-36 animate-pulse rounded-xl bg-muted" />
      ) : syncStatus ? (
        <BacklogCard status={syncStatus} />
      ) : null}

      {/* Refresh notice */}
      <p className="text-right text-xs text-muted-foreground">Auto-refreshes every 30 s</p>

      {/* Devices */}
      <div>
        <h2 className="mb-3 text-lg font-semibold text-foreground">
          {t("sync.devices", "Edge Devices")} ({devices.length})
        </h2>
        {devices.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-12 text-center">
            <svg className="mx-auto mb-3 h-10 w-10 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
            <p className="font-medium text-foreground">No edge devices registered</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Register your Raspberry Pi to start syncing data to the cloud.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {devices.map((device) => (
              <DeviceCard
                key={device.device_id}
                device={device}
                orgSlug={org?.slug ?? ""}
                onDeactivate={handleDeviceDeactivated}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
