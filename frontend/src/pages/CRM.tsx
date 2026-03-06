/**
 * CRM Dashboard page — Cloud mode only, platform operators.
 *
 * Shows:
 *  - Global platform stats (top cards)
 *  - Searchable/filterable list of all client tenants
 *  - Quick actions: view detail, impersonate, export CSV
 */

import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import axios from "axios";
import { FeatureGate } from "@/components/ui/FeatureGate";
import {
  listCRMTenants,
  getCRMStats,
  impersonateTenant,
  downloadTenantsCSV,
  type CRMTenant,
  type CRMStats,
} from "@/api/crm";
import { cn } from "@/utils/cn";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function planBadge(plan: string) {
  const map: Record<string, string> = {
    FREE: "badge badge-ghost text-xs",
    PRO: "badge badge-primary text-xs",
    ENTERPRISE: "badge badge-secondary text-xs",
  };
  return <span className={map[plan] ?? "badge text-xs"}>{plan}</span>;
}

function healthDot(lastActivity: string | null) {
  if (!lastActivity) return <span className="h-2 w-2 rounded-full bg-gray-300 inline-block" />;
  const ageH = (Date.now() - new Date(lastActivity).getTime()) / 3_600_000;
  const color = ageH < 1 ? "bg-emerald-500" : ageH < 24 ? "bg-amber-400" : "bg-red-500";
  return <span className={cn("h-2 w-2 rounded-full inline-block", color)} />;
}

function formatDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
}

// ---------------------------------------------------------------------------
// Stat card
// ---------------------------------------------------------------------------

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card bg-base-100 shadow-sm border border-base-200 p-4">
      <p className="text-sm text-base-content/60">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-base-content/40 mt-0.5">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CRM() {
  const { t } = useTranslation();

  const [stats, setStats] = useState<CRMStats | null>(null);
  const [tenants, setTenants] = useState<CRMTenant[]>([]);
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [impersonating, setImpersonating] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setAccessDenied(false);
    try {
      const [s, ts] = await Promise.all([getCRMStats(), listCRMTenants()]);
      setStats(s);
      setTenants(ts);
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 403) {
        setAccessDenied(true);
      } else {
        toast.error("Failed to load CRM data");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleImpersonate = async (tenant: CRMTenant) => {
    if (!confirm(`Impersonate org "${tenant.org_name}"? You will have full access for 30 min.`)) return;
    setImpersonating(tenant.id);
    try {
      const result = await impersonateTenant(tenant.id);
      // Store the temp token and redirect
      toast.success(`Impersonating ${result.target_user} @ ${result.target_org}. Expires: ${new Date(result.expires_at).toLocaleTimeString()}`);
      // In production: set access token and reload
      navigator.clipboard.writeText(result.access).then(() =>
        toast.success("Access token copied to clipboard")
      );
    } catch {
      toast.error("Failed to generate impersonation token");
    } finally {
      setImpersonating(null);
    }
  };

  const filtered = tenants.filter((t) => {
    const matchSearch =
      t.org_name.toLowerCase().includes(search.toLowerCase()) ||
      t.org_slug.toLowerCase().includes(search.toLowerCase());
    const matchPlan = planFilter === "all" || t.plan === planFilter;
    return matchSearch && matchPlan;
  });

  if (accessDenied) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <div className="text-5xl">🔒</div>
        <h2 className="text-xl font-bold">Access Restricted</h2>
        <p className="text-base-content/60 max-w-sm">
          The CRM dashboard is reserved for platform operators.
          Contact your administrator to request access.
        </p>
      </div>
    );
  }

  return (
    <FeatureGate
      feature="crm"
      fallback={
        <div className="flex flex-col items-center justify-center h-64 gap-4">
          <p className="text-lg font-semibold">CRM is only available in Cloud mode.</p>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{t("pages.crm.title", "CRM — Client Management")}</h1>
            <p className="text-sm text-base-content/60 mt-0.5">
              {t("pages.crm.subtitle", "Platform operator view — manage all client tenants")}
            </p>
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => downloadTenantsCSV()}>
            Export CSV
          </button>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            <StatCard label="Total Tenants" value={stats.total_tenants} />
            <StatCard label="Active Tenants" value={stats.active_tenants} />
            <StatCard label="Greenhouses" value={stats.total_greenhouses} />
            <StatCard label="Devices Online" value={`${stats.active_devices_1h}/${stats.total_devices}`} sub="last 1h" />
            <StatCard label="Readings 24h" value={stats.readings_last_24h.toLocaleString()} />
            <StatCard
              label="Critical Alerts"
              value={stats.critical_alerts_unacknowledged}
              sub="unacknowledged"
            />
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 items-center">
          <input
            type="text"
            className="input input-bordered input-sm w-64"
            placeholder="Search org name or slug..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="select select-bordered select-sm"
            value={planFilter}
            onChange={(e) => setPlanFilter(e.target.value)}
          >
            <option value="all">All plans</option>
            <option value="FREE">Free</option>
            <option value="PRO">Pro</option>
            <option value="ENTERPRISE">Enterprise</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load} disabled={loading}>
            {loading ? <span className="loading loading-spinner loading-xs" /> : "Refresh"}
          </button>
        </div>

        {/* Tenant table */}
        {loading ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="card bg-base-100 border border-base-200 p-12 flex flex-col items-center gap-3">
            <p className="text-2xl">🏢</p>
            <p className="font-semibold">No tenants found</p>
            <p className="text-sm text-base-content/60">
              {search || planFilter !== "all"
                ? "Try adjusting your filters"
                : "No client organizations registered yet"}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-base-200 bg-base-100">
            <table className="table table-sm">
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Organization</th>
                  <th>Plan</th>
                  <th>Greenhouses</th>
                  <th>Devices</th>
                  <th>Storage</th>
                  <th>Last Activity</th>
                  <th>Backlog</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((t) => (
                  <tr key={t.id} className="hover">
                    <td>{healthDot(t.last_activity)}</td>
                    <td>
                      <div>
                        <p className="font-medium">{t.org_name}</p>
                        <p className="text-xs text-base-content/50">{t.org_slug}</p>
                      </div>
                    </td>
                    <td>{planBadge(t.plan)}</td>
                    <td>{t.greenhouse_count}</td>
                    <td>{t.device_count}</td>
                    <td>{t.cloud_storage_mb.toFixed(1)} MB</td>
                    <td className="text-xs">{formatDate(t.last_activity)}</td>
                    <td>
                      {t.unsynced_readings > 0 ? (
                        <span className="badge badge-warning badge-sm">{t.unsynced_readings}</span>
                      ) : (
                        <span className="badge badge-success badge-sm">0</span>
                      )}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <Link
                          to={`/crm/${t.id}`}
                          className="btn btn-xs btn-ghost"
                          title="View details"
                        >
                          Detail
                        </Link>
                        <button
                          className="btn btn-xs btn-warning"
                          title="Impersonate"
                          onClick={() => handleImpersonate(t)}
                          disabled={impersonating === t.id}
                        >
                          {impersonating === t.id ? (
                            <span className="loading loading-spinner loading-xs" />
                          ) : (
                            "Impersonate"
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </FeatureGate>
  );
}
