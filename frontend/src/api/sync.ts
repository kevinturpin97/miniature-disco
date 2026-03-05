/**
 * API client for Edge Sync Agent endpoints (Sprint 27).
 */

import api from "./client";

export interface SyncBatchInfo {
  status: "PENDING" | "SUCCESS" | "FAILED" | "RETRY";
  records_count: number;
  payload_size_kb: number;
  started_at: string;
  completed_at: string | null;
  error_message: string;
}

export interface EdgeDeviceStatus {
  device_id: string;
  name: string;
  firmware_version: string;
  last_sync_at: string | null;
  pending_retries: number;
  last_batch: SyncBatchInfo | null;
}

export interface SyncStatus {
  total_backlog: number;
  backlog_detail: {
    readings: number;
    commands: number;
    alerts: number;
    audit_events: number;
  };
  devices: EdgeDeviceStatus[];
}

export interface EdgeDevice {
  id: number;
  device_id: string;
  name: string;
  firmware_version: string;
  is_active: boolean;
  last_sync_at: string | null;
  created_at: string;
  secret_key?: string; // Only present on creation
}

export interface SyncBatch {
  id: number;
  status: "PENDING" | "SUCCESS" | "FAILED" | "RETRY";
  records_count: number;
  payload_size_kb: number;
  retry_count: number;
  error_message: string;
  started_at: string;
  completed_at: string | null;
}

/** GET /api/sync/status/ */
export async function getSyncStatus(): Promise<SyncStatus> {
  const res = await api.get<SyncStatus>("/sync/status/");
  return res.data;
}

/** GET /api/orgs/{slug}/edge-devices/ */
export async function listEdgeDevices(orgSlug: string): Promise<EdgeDevice[]> {
  const res = await api.get<EdgeDevice[]>(`/orgs/${orgSlug}/edge-devices/`);
  return res.data;
}

/** POST /api/orgs/{slug}/edge-devices/ */
export async function createEdgeDevice(
  orgSlug: string,
  data: { name: string; firmware_version?: string }
): Promise<EdgeDevice> {
  const res = await api.post<EdgeDevice>(`/orgs/${orgSlug}/edge-devices/`, data);
  return res.data;
}

/** DELETE /api/edge-devices/{device_id}/ (soft-delete) */
export async function deleteEdgeDevice(deviceId: string): Promise<void> {
  await api.delete(`/edge-devices/${deviceId}/`);
}

/** GET /api/edge-devices/{device_id}/sync-history/ */
export async function getDeviceSyncHistory(deviceId: string): Promise<SyncBatch[]> {
  const res = await api.get<SyncBatch[]>(`/edge-devices/${deviceId}/sync-history/`);
  return res.data;
}
