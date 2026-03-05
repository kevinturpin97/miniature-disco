/**
 * CRM Tenant Detail page — platform operators only, Cloud mode.
 *
 * Shows full information for one client organization:
 *  - Summary card with plan + support notes (editable)
 *  - Health snapshot
 *  - Greenhouses / Zones list
 *  - Registered edge devices
 *  - Last 20 sync batches
 *  - Recent alerts
 *  - Team members
 */

import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { FeatureGate } from "@/components/ui/FeatureGate";
import {
  getCRMTenant,
  getCRMTenantHealth,
  updateCRMTenant,
  impersonateTenant,
  type CRMTenantDetail,
  type CRMTenantHealth,
} from "@/api/crm";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    SUCCESS: "badge-success",
    FAILED: "badge-error",
    RETRY: "badge-warning",
    PENDING: "badge-info",
  };
  return <span className={cn("badge badge-sm", map[s] ?? "badge-ghost")}>{s}</span>;
}

function healthBadge(status: "ok" | "degraded" | "critical") {
  const map = {
    ok: "badge-success",
    degraded: "badge-warning",
    critical: "badge-error",
  };
  return <span className={cn("badge", map[status])}>{status.toUpperCase()}</span>;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CRMDetail() {
  const { id } = useParams<{ id: string }>();
  const tenantId = Number(id);
  const { t } = useTranslation();

  const [detail, setDetail] = useState<CRMTenantDetail | null>(null);
  const [health, setHealth] = useState<CRMTenantHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingNotes, setSavingNotes] = useState(false);
  const [notes, setNotes] = useState("");
  const [impersonating, setImpersonating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, h] = await Promise.all([getCRMTenant(tenantId), getCRMTenantHealth(tenantId)]);
      setDetail(d);
      setHealth(h);
      setNotes(d.tenant.support_notes);
    } catch {
      toast.error("Failed to load tenant details");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      await updateCRMTenant(tenantId, { support_notes: notes });
      toast.success("Support notes saved");
    } catch {
      toast.error("Failed to save notes");
    } finally {
      setSavingNotes(false);
    }
  };

  const handleImpersonate = async () => {
    if (!detail) return;
    if (
      !confirm(
        `Impersonate org "${detail.tenant.org_name}"? You will have full access for 30 min.`
      )
    )
      return;
    setImpersonating(true);
    try {
      const result = await impersonateTenant(tenantId);
      toast.success(
        `Token generated for ${result.target_user}. Expires: ${new Date(
          result.expires_at
        ).toLocaleTimeString()}`
      );
      navigator.clipboard.writeText(result.access);
      toast.success("Access token copied to clipboard");
    } catch {
      toast.error("Failed to generate impersonation token");
    } finally {
      setImpersonating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="skeleton h-24 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-lg font-semibold">Tenant not found</p>
        <Link to="/crm" className="btn btn-primary btn-sm">
          Back to CRM
        </Link>
      </div>
    );
  }

  const { tenant, greenhouses, zones, devices, recent_alerts, sync_batches, members } = detail;

  return (
    <FeatureGate
      feature="crm"
      fallback={
        <div className="flex flex-col items-center justify-center h-64">
          <p className="text-lg font-semibold">CRM is only available in Cloud mode.</p>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Breadcrumb */}
        <div className="breadcrumbs text-sm">
          <ul>
            <li>
              <Link to="/administration">Administration</Link>
            </li>
            <li>
              <Link to="/crm">CRM</Link>
            </li>
            <li>{tenant.org_name}</li>
          </ul>
        </div>

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{tenant.org_name}</h1>
            <p className="text-sm text-base-content/60">{tenant.org_slug}</p>
          </div>
          <div className="flex gap-2">
            {health && healthBadge(health.health_status)}
            <span className="badge badge-outline">{tenant.plan}</span>
            <button
              className="btn btn-warning btn-sm"
              onClick={handleImpersonate}
              disabled={impersonating}
            >
              {impersonating ? (
                <span className="loading loading-spinner loading-xs" />
              ) : (
                "Impersonate"
              )}
            </button>
          </div>
        </div>

        {/* Health snapshot */}
        {health && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="card bg-base-100 border border-base-200 p-4">
              <p className="text-xs text-base-content/60">Health</p>
              <div className="mt-1">{healthBadge(health.health_status)}</div>
            </div>
            <div className="card bg-base-100 border border-base-200 p-4">
              <p className="text-xs text-base-content/60">Critical Alerts (24h)</p>
              <p className="text-2xl font-bold mt-1">{health.critical_alerts_24h}</p>
            </div>
            <div className="card bg-base-100 border border-base-200 p-4">
              <p className="text-xs text-base-content/60">Unsynced Backlog</p>
              <p className="text-2xl font-bold mt-1">{health.unsynced_readings_backlog}</p>
            </div>
            <div className="card bg-base-100 border border-base-200 p-4">
              <p className="text-xs text-base-content/60">Failed Batches</p>
              <p className="text-2xl font-bold mt-1">{health.failed_sync_batches}</p>
            </div>
          </div>
        )}

        {/* Devices */}
        <section className="card bg-base-100 border border-base-200">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Edge Devices</h2>
            {devices.length === 0 ? (
              <p className="text-sm text-base-content/60">No devices registered</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-sm">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Device ID</th>
                      <th>Firmware</th>
                      <th>Last Sync</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {devices.map((d) => {
                      const ageH = d.last_sync_at
                        ? (Date.now() - new Date(d.last_sync_at).getTime()) / 3_600_000
                        : null;
                      const online = ageH !== null && ageH < 1;
                      return (
                        <tr key={d.device_id} className="hover">
                          <td className="font-medium">{d.name}</td>
                          <td className="font-mono text-xs">{d.device_id}</td>
                          <td>{d.firmware_version || "—"}</td>
                          <td className="text-xs">{formatDate(d.last_sync_at)}</td>
                          <td>
                            <span
                              className={cn(
                                "badge badge-sm",
                                online ? "badge-success" : "badge-error"
                              )}
                            >
                              {online ? "Online" : "Offline"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Greenhouses & Zones */}
        <div className="grid md:grid-cols-2 gap-4">
          <section className="card bg-base-100 border border-base-200">
            <div className="card-body p-4">
              <h2 className="card-title text-base">
                Greenhouses ({greenhouses.length})
              </h2>
              <ul className="space-y-1">
                {greenhouses.map((g) => (
                  <li key={g.id} className="text-sm">
                    <span className="font-medium">{g.name}</span>
                    {g.location && (
                      <span className="text-base-content/50 ml-2 text-xs">{g.location}</span>
                    )}
                  </li>
                ))}
                {greenhouses.length === 0 && (
                  <li className="text-sm text-base-content/60">No greenhouses</li>
                )}
              </ul>
            </div>
          </section>

          <section className="card bg-base-100 border border-base-200">
            <div className="card-body p-4">
              <h2 className="card-title text-base">Zones ({zones.length})</h2>
              <ul className="space-y-1 max-h-48 overflow-y-auto">
                {zones.map((z) => (
                  <li key={z.id} className="text-sm flex justify-between">
                    <span>{z.name}</span>
                    <span className="text-xs text-base-content/50">
                      Relay #{z.relay_id} — {z.last_seen ? formatDate(z.last_seen) : "never seen"}
                    </span>
                  </li>
                ))}
                {zones.length === 0 && (
                  <li className="text-sm text-base-content/60">No zones</li>
                )}
              </ul>
            </div>
          </section>
        </div>

        {/* Sync batches */}
        <section className="card bg-base-100 border border-base-200">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Recent Sync Batches</h2>
            {sync_batches.length === 0 ? (
              <p className="text-sm text-base-content/60">No sync batches</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-xs">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Status</th>
                      <th>Records</th>
                      <th>Size</th>
                      <th>Retries</th>
                      <th>Started</th>
                      <th>Completed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sync_batches.map((b) => (
                      <tr key={b.id} className="hover">
                        <td>{b.id}</td>
                        <td>{statusBadge(b.status)}</td>
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
        </section>

        {/* Recent alerts */}
        <section className="card bg-base-100 border border-base-200">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Recent Alerts (last 10)</h2>
            {recent_alerts.length === 0 ? (
              <p className="text-sm text-base-content/60">No alerts</p>
            ) : (
              <ul className="space-y-1">
                {recent_alerts.map((a) => (
                  <li key={a.id} className="text-sm flex gap-2 items-start">
                    <span
                      className={cn("badge badge-xs mt-0.5", {
                        "badge-error": a.severity === "CRITICAL",
                        "badge-warning": a.severity === "WARNING",
                        "badge-info": a.severity === "INFO",
                      })}
                    >
                      {a.severity}
                    </span>
                    <span className="flex-1">{a.message}</span>
                    <span className="text-xs text-base-content/40">{formatDate(a.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        {/* Members */}
        <section className="card bg-base-100 border border-base-200">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Team Members</h2>
            <div className="overflow-x-auto">
              <table className="table table-xs">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {members.map((m, i) => (
                    <tr key={i} className="hover">
                      <td className="font-medium">{m.user__username}</td>
                      <td>{m.user__email}</td>
                      <td>
                        <span className="badge badge-sm badge-outline">{m.role}</span>
                      </td>
                      <td className="text-xs">{formatDate(m.joined_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Support notes */}
        <section className="card bg-base-100 border border-base-200">
          <div className="card-body p-4">
            <h2 className="card-title text-base">Support Notes</h2>
            <p className="text-xs text-base-content/50 mb-2">
              Internal notes — visible only to platform operators
            </p>
            <textarea
              className="textarea textarea-bordered w-full h-28 text-sm"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add support notes here..."
            />
            <div className="mt-2 flex justify-end">
              <button
                className="btn btn-primary btn-sm"
                onClick={saveNotes}
                disabled={savingNotes}
              >
                {savingNotes ? <span className="loading loading-spinner loading-xs" /> : "Save Notes"}
              </button>
            </div>
          </div>
        </section>
      </div>
    </FeatureGate>
  );
}
