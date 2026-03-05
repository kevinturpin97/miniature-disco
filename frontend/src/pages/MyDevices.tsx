/**
 * My Devices page — shows registered Raspberry Pi edge devices for the current org.
 *
 * Cloud mode: list of devices with sync status + last activity.
 * Allows registering new devices and viewing sync history.
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useAuthStore } from "@/stores/authStore";
import {
  listEdgeDevices,
  createEdgeDevice,
  deleteEdgeDevice,
  getDeviceSyncHistory,
  type EdgeDevice,
  type SyncBatch,
} from "@/api/sync";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function syncBadge(status: string) {
  const map: Record<string, string> = {
    SUCCESS: "badge-success",
    FAILED: "badge-error",
    RETRY: "badge-warning",
    PENDING: "badge-info",
  };
  return <span className={cn("badge badge-sm", map[status] ?? "badge-ghost")}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Register device modal
// ---------------------------------------------------------------------------

interface RegisterModalProps {
  orgSlug: string;
  onCreated: (device: EdgeDevice & { secret_key: string }) => void;
  onClose: () => void;
}

function RegisterDeviceModal({ orgSlug, onCreated, onClose }: RegisterModalProps) {
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    try {
      const device = await createEdgeDevice(orgSlug, { name: name.trim() });
      onCreated(device as EdgeDevice & { secret_key: string });
    } catch {
      toast.error("Failed to register device");
    } finally {
      setLoading(false);
    }
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box">
        <h3 className="font-bold text-lg mb-4">Register New Edge Device</h3>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="form-control">
            <label className="label">
              <span className="label-text">Device Name</span>
            </label>
            <input
              type="text"
              className="input input-bordered"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Raspberry Pi Site Nord"
              required
            />
          </div>
          <div className="modal-action">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? <span className="loading loading-spinner loading-sm" /> : "Register"}
            </button>
          </div>
        </form>
      </div>
      <div className="modal-backdrop" onClick={onClose} />
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Secret reveal modal (shown once after registration)
// ---------------------------------------------------------------------------

interface SecretModalProps {
  device: EdgeDevice & { secret_key: string };
  onClose: () => void;
}

function SecretModal({ device, onClose }: SecretModalProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    navigator.clipboard.writeText(device.secret_key);
    setCopied(true);
    toast.success("Secret key copied!");
    setTimeout(() => setCopied(false), 3000);
  };

  return (
    <dialog className="modal modal-open">
      <div className="modal-box max-w-lg">
        <h3 className="font-bold text-lg text-warning mb-2">Save Your Secret Key</h3>
        <p className="text-sm text-base-content/70 mb-4">
          This secret key is shown <strong>only once</strong>. Store it securely in your{" "}
          <code>.env</code> file on the Raspberry Pi.
        </p>
        <div className="bg-base-200 rounded-lg p-3 mb-4">
          <p className="text-xs text-base-content/60 mb-1">Device ID</p>
          <code className="text-xs break-all">{device.device_id}</code>
          <p className="text-xs text-base-content/60 mt-3 mb-1">Secret Key</p>
          <code className="text-xs break-all">{device.secret_key}</code>
        </div>
        <div className="bg-base-200 rounded-lg p-3 mb-4 text-xs text-base-content/70">
          <p className="font-semibold mb-1">Add to your Raspberry Pi .env:</p>
          <pre className="overflow-x-auto">{`EDGE_MODE=True
CLOUD_SYNC_URL=https://cloud.your-domain.com
EDGE_DEVICE_ID=${device.device_id}
EDGE_SECRET_KEY=${device.secret_key}`}</pre>
        </div>
        <div className="modal-action">
          <button className="btn btn-outline btn-sm" onClick={copy}>
            {copied ? "Copied!" : "Copy to clipboard"}
          </button>
          <button className="btn btn-primary" onClick={onClose}>
            I've saved it
          </button>
        </div>
      </div>
      <div className="modal-backdrop" />
    </dialog>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MyDevices() {
  const { t } = useTranslation();
  const orgSlug = useAuthStore((s) => s.currentOrganization?.slug ?? "");

  const [devices, setDevices] = useState<EdgeDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showRegister, setShowRegister] = useState(false);
  const [newDevice, setNewDevice] = useState<(EdgeDevice & { secret_key: string }) | null>(null);
  const [expandedDevice, setExpandedDevice] = useState<string | null>(null);
  const [history, setHistory] = useState<Record<string, SyncBatch[]>>({});
  const [loadingHistory, setLoadingHistory] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!orgSlug) return;
    setLoading(true);
    try {
      const devs = await listEdgeDevices(orgSlug);
      setDevices(devs);
    } catch {
      toast.error("Failed to load devices");
    } finally {
      setLoading(false);
    }
  }, [orgSlug]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (deviceId: string) => {
    if (!confirm("Delete this device? This cannot be undone.")) return;
    try {
      await deleteEdgeDevice(deviceId);
      toast.success("Device deleted");
      load();
    } catch {
      toast.error("Failed to delete device");
    }
  };

  const toggleHistory = async (deviceId: string) => {
    if (expandedDevice === deviceId) {
      setExpandedDevice(null);
      return;
    }
    setExpandedDevice(deviceId);
    if (history[deviceId]) return;
    setLoadingHistory(deviceId);
    try {
      const batches = await getDeviceSyncHistory(deviceId);
      setHistory((prev) => ({ ...prev, [deviceId]: batches }));
    } catch {
      toast.error("Failed to load sync history");
    } finally {
      setLoadingHistory(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {t("pages.myDevices.title", "My Edge Devices")}
          </h1>
          <p className="text-sm text-base-content/60 mt-0.5">
            {t(
              "pages.myDevices.subtitle",
              "Raspberry Pi devices registered for cloud synchronization"
            )}
          </p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => setShowRegister(true)}>
          + Register Device
        </button>
      </div>

      {/* Bandeau sync status */}
      <div className="alert alert-info text-sm">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <span>
          Data synchronized from edge devices — last updates shown below. Check{" "}
          <Link to="/sync" className="link">Sync status</Link> for backlog details.
        </span>
      </div>

      {/* Device list */}
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-20 w-full rounded-xl" />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="card bg-base-100 border border-base-200 p-12 flex flex-col items-center gap-4">
          <p className="text-4xl">🍓</p>
          <p className="font-semibold text-lg">No edge devices registered</p>
          <p className="text-sm text-base-content/60 text-center max-w-xs">
            Register your Raspberry Pi to start syncing greenhouse data to the cloud.
          </p>
          <button className="btn btn-primary" onClick={() => setShowRegister(true)}>
            Register Your First Device
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {devices.map((device) => {
            const ageH = device.last_sync_at
              ? (Date.now() - new Date(device.last_sync_at).getTime()) / 3_600_000
              : null;
            const online = ageH !== null && ageH < 1;

            return (
              <div
                key={device.device_id}
                className="card bg-base-100 border border-base-200"
              >
                <div className="card-body p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          "h-3 w-3 rounded-full",
                          online ? "bg-emerald-500 animate-pulse" : "bg-red-400"
                        )}
                      />
                      <div>
                        <p className="font-semibold">{device.name}</p>
                        <p className="text-xs text-base-content/50 font-mono">
                          {device.device_id}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-base-content/60">
                        Last sync: {formatDate(device.last_sync_at)}
                      </span>
                      {device.firmware_version && (
                        <span className="badge badge-xs badge-ghost">
                          v{device.firmware_version}
                        </span>
                      )}
                      <button
                        className="btn btn-xs btn-ghost"
                        onClick={() => toggleHistory(device.device_id)}
                      >
                        {expandedDevice === device.device_id ? "Hide history" : "Sync history"}
                      </button>
                      <button
                        className="btn btn-xs btn-error btn-outline"
                        onClick={() => handleDelete(device.device_id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded sync history */}
                  {expandedDevice === device.device_id && (
                    <div className="mt-4 border-t border-base-200 pt-4">
                      {loadingHistory === device.device_id ? (
                        <div className="flex gap-2 text-sm text-base-content/60">
                          <span className="loading loading-spinner loading-xs" />
                          Loading history...
                        </div>
                      ) : (history[device.device_id]?.length ?? 0) === 0 ? (
                        <p className="text-sm text-base-content/60">No sync history</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="table table-xs">
                            <thead>
                              <tr>
                                <th>Status</th>
                                <th>Records</th>
                                <th>Size</th>
                                <th>Retries</th>
                                <th>Started</th>
                                <th>Completed</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(history[device.device_id] ?? []).map((b) => (
                                <tr key={b.id} className="hover">
                                  <td>{syncBadge(b.status)}</td>
                                  <td>{b.records_count}</td>
                                  <td>{b.payload_size_kb.toFixed(1)} KB</td>
                                  <td>{b.retry_count}</td>
                                  <td className="text-xs">{formatDate(b.started_at)}</td>
                                  <td className="text-xs">{formatDate(b.completed_at)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Register modal */}
      {showRegister && orgSlug && (
        <RegisterDeviceModal
          orgSlug={orgSlug}
          onCreated={(device) => {
            setShowRegister(false);
            setNewDevice(device);
            load();
          }}
          onClose={() => setShowRegister(false)}
        />
      )}

      {/* Secret key reveal modal */}
      {newDevice && (
        <SecretModal device={newDevice} onClose={() => setNewDevice(null)} />
      )}
    </div>
  );
}
