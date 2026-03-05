/**
 * API client for Cloud CRM endpoints (Sprint 28).
 * These endpoints are Cloud-only and restricted to platform operators.
 */

import api from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CRMTenant {
  id: number;
  org_id: number;
  org_slug: string;
  org_name: string;
  plan: "FREE" | "PRO" | "ENTERPRISE";
  is_on_trial: boolean;
  greenhouse_count: number;
  device_count: number;
  cloud_storage_mb: number;
  last_activity: string | null;
  unsynced_readings: number;
  is_active: boolean;
}

export interface CRMTenantDevice {
  device_id: string;
  name: string;
  firmware_version: string;
  last_sync_at: string | null;
  is_active: boolean;
}

export interface CRMTenantDetail {
  tenant: {
    id: number;
    org_id: number;
    org_slug: string;
    org_name: string;
    plan: string;
    cloud_storage_mb: number;
    last_activity: string | null;
    support_notes: string;
    is_active: boolean;
    created_at: string;
  };
  greenhouses: Array<{ id: number; name: string; location: string }>;
  zones: Array<{ id: number; name: string; last_seen: string | null; relay_id: number }>;
  devices: CRMTenantDevice[];
  recent_alerts: Array<{
    id: number;
    alert_type: string;
    severity: string;
    message: string;
    is_acknowledged: boolean;
    created_at: string;
  }>;
  sync_batches: Array<{
    id: number;
    status: string;
    records_count: number;
    payload_size_kb: number;
    retry_count: number;
    started_at: string;
    completed_at: string | null;
  }>;
  members: Array<{
    user__username: string;
    user__email: string;
    role: string;
    joined_at: string;
  }>;
}

export interface CRMTenantHealth {
  org_slug: string;
  health_status: "ok" | "degraded" | "critical";
  devices: Array<{
    device_id: string;
    name: string;
    last_sync_at: string | null;
    sync_age_hours: number | null;
    is_online: boolean;
  }>;
  critical_alerts_24h: number;
  failed_sync_batches: number;
  unsynced_readings_backlog: number;
  last_activity: string | null;
}

export interface CRMStats {
  total_tenants: number;
  active_tenants: number;
  total_greenhouses: number;
  total_zones: number;
  total_devices: number;
  active_devices_1h: number;
  readings_last_24h: number;
  alerts_last_24h: number;
  critical_alerts_unacknowledged: number;
  sync_batches_24h: number;
  failed_syncs_24h: number;
  plan_distribution: Record<string, number>;
}

export interface ImpersonateResult {
  access: string;
  expires_at: string;
  target_user: string;
  target_org: string;
  note: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** GET /api/crm/tenants/ */
export async function listCRMTenants(): Promise<CRMTenant[]> {
  const res = await api.get<CRMTenant[]>("/crm/tenants/");
  return res.data;
}

/** GET /api/crm/tenants/{id}/ */
export async function getCRMTenant(tenantId: number): Promise<CRMTenantDetail> {
  const res = await api.get<CRMTenantDetail>(`/crm/tenants/${tenantId}/`);
  return res.data;
}

/** PATCH /api/crm/tenants/{id}/ — update support notes or plan */
export async function updateCRMTenant(
  tenantId: number,
  data: { support_notes?: string; plan?: string }
): Promise<{ detail: string }> {
  const res = await api.patch<{ detail: string }>(`/crm/tenants/${tenantId}/`, data);
  return res.data;
}

/** GET /api/crm/tenants/{id}/health/ */
export async function getCRMTenantHealth(tenantId: number): Promise<CRMTenantHealth> {
  const res = await api.get<CRMTenantHealth>(`/crm/tenants/${tenantId}/health/`);
  return res.data;
}

/** GET /api/crm/stats/ */
export async function getCRMStats(): Promise<CRMStats> {
  const res = await api.get<CRMStats>("/crm/stats/");
  return res.data;
}

/** POST /api/crm/tenants/{id}/impersonate/ */
export async function impersonateTenant(tenantId: number): Promise<ImpersonateResult> {
  const res = await api.post<ImpersonateResult>(`/crm/tenants/${tenantId}/impersonate/`);
  return res.data;
}

/** GET /api/crm/tenants/export/csv/ — triggers browser download */
export function downloadTenantsCSV(): void {
  const baseUrl = (import.meta.env.VITE_API_URL as string) || "/api";
  window.open(`${baseUrl}/crm/tenants/export/csv/`, "_blank");
}
