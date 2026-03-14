/**
 * API client for OTA Firmware & Fleet Management endpoints (Sprint 33).
 * Cloud-only feature — gated by `<FeatureGate feature="fleet">`.
 */

import api from "./client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type FirmwareChannel = "STABLE" | "BETA" | "NIGHTLY";

export type OTAJobStatus =
  | "PENDING"
  | "DOWNLOADING"
  | "INSTALLING"
  | "SUCCESS"
  | "FAILED"
  | "ROLLED_BACK";

export interface FirmwareRelease {
  id: number;
  version: string;
  channel: FirmwareChannel;
  release_notes: string;
  binary_url: string;
  checksum_sha256: string;
  file_size_bytes: number;
  min_hardware_version: string;
  is_active: boolean;
  created_at: string;
}

export interface DeviceOTAJob {
  id: number;
  edge_device: number;
  device_name: string;
  firmware_release: number;
  firmware_version: string;
  status: OTAJobStatus;
  progress_percent: number;
  previous_version: string;
  error_message: string;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface DeviceMetrics {
  id: number;
  edge_device: number;
  cpu_percent: number;
  memory_percent: number;
  disk_percent: number;
  cpu_temperature: number | null;
  uptime_seconds: number | null;
  network_latency_ms: number | null;
  recorded_at: string;
}

export interface FleetDevice {
  id: number;
  device_id: string;
  name: string;
  organization: number;
  organization_name: string;
  firmware_version: string;
  last_sync_at: string | null;
  is_active: boolean;
  created_at: string;
  latest_metrics: DeviceMetrics | null;
  active_ota_job: DeviceOTAJob | null;
}

export interface FleetDeviceDetail extends FleetDevice {
  ota_history: DeviceOTAJob[];
  metrics_24h: DeviceMetrics[];
}

export interface FleetOverview {
  total_devices: number;
  online_devices: number;
  offline_devices: number;
  outdated_devices: number;
  active_ota_jobs: number;
  organizations_count: number;
}

export interface PublishFirmwarePayload {
  version: string;
  channel: FirmwareChannel;
  binary_url: string;
  checksum_sha256: string;
  file_size_bytes: number;
  release_notes?: string;
  min_hardware_version?: string;
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** GET /api/fleet/overview/ */
export async function getFleetOverview(): Promise<FleetOverview> {
  const res = await api.get<FleetOverview>("/fleet/overview/");
  return res.data;
}

/** GET /api/fleet/devices/ */
export async function listFleetDevices(): Promise<FleetDevice[]> {
  const res = await api.get<FleetDevice[]>("/fleet/devices/");
  return res.data;
}

/** GET /api/fleet/devices/{deviceId}/ */
export async function getFleetDevice(deviceId: string): Promise<FleetDeviceDetail> {
  const res = await api.get<FleetDeviceDetail>(`/fleet/devices/${deviceId}/`);
  return res.data;
}

/** POST /api/fleet/devices/{deviceId}/update/ */
export async function triggerOTAUpdate(
  deviceId: string,
  firmwareReleaseId: number
): Promise<DeviceOTAJob> {
  const res = await api.post<DeviceOTAJob>(`/fleet/devices/${deviceId}/update/`, {
    firmware_release_id: firmwareReleaseId,
  });
  return res.data;
}

/** POST /api/fleet/devices/{deviceId}/rollback/ */
export async function rollbackDevice(deviceId: string): Promise<DeviceOTAJob> {
  const res = await api.post<DeviceOTAJob>(`/fleet/devices/${deviceId}/rollback/`);
  return res.data;
}

/** GET /api/fleet/firmware/ */
export async function listFirmwareReleases(
  channel?: FirmwareChannel
): Promise<FirmwareRelease[]> {
  const params = channel ? { channel } : {};
  const res = await api.get<FirmwareRelease[]>("/fleet/firmware/", { params });
  return res.data;
}

/** POST /api/fleet/firmware/ */
export async function publishFirmwareRelease(
  payload: PublishFirmwarePayload
): Promise<FirmwareRelease> {
  const res = await api.post<FirmwareRelease>("/fleet/firmware/", payload);
  return res.data;
}
