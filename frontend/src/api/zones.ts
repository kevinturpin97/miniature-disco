/**
 * Zone API calls.
 */

import client from "./client";
import type { CropIndicatorPreference, CropStatus, PaginatedResponse, Zone } from "@/types";

export async function listZones(
  greenhouseId: number,
): Promise<PaginatedResponse<Zone>> {
  const { data } = await client.get<PaginatedResponse<Zone>>(
    `/greenhouses/${greenhouseId}/zones/`,
  );
  return data;
}

export async function getZone(id: number): Promise<Zone> {
  const { data } = await client.get<Zone>(`/zones/${id}/`);
  return data;
}

export async function createZone(
  greenhouseId: number,
  payload: Pick<Zone, "name" | "relay_id" | "description" | "transmission_interval">,
): Promise<Zone> {
  const { data } = await client.post<Zone>(
    `/greenhouses/${greenhouseId}/zones/`,
    payload,
  );
  return data;
}

export async function updateZone(
  id: number,
  payload: Partial<Pick<Zone, "name" | "description" | "is_active" | "transmission_interval">>,
): Promise<Zone> {
  const { data } = await client.patch<Zone>(`/zones/${id}/`, payload);
  return data;
}

export async function deleteZone(id: number): Promise<void> {
  await client.delete(`/zones/${id}/`);
}

export async function exportZoneCsv(
  zoneId: number,
  params?: { from?: string; to?: string },
): Promise<Blob> {
  const { data } = await client.get<Blob>(`/zones/${zoneId}/export/csv/`, {
    params,
    responseType: "blob",
  });
  return data;
}

// Sprint 31 — Crop Intelligence

export async function getZoneCropStatus(zoneId: number): Promise<CropStatus> {
  const { data } = await client.get<CropStatus>(`/zones/${zoneId}/crop-status/`);
  return data;
}

export async function getCropIndicatorPreferences(
  zoneId: number,
): Promise<CropIndicatorPreference[]> {
  const { data } = await client.get<CropIndicatorPreference[]>(
    `/zones/${zoneId}/crop-indicator-preferences/`,
  );
  return data;
}

export async function updateCropIndicatorPreferences(
  zoneId: number,
  preferences: CropIndicatorPreference[],
): Promise<{ preferences: CropIndicatorPreference[] }> {
  const { data } = await client.patch<{ preferences: CropIndicatorPreference[] }>(
    `/zones/${zoneId}/crop-indicator-preferences/`,
    { preferences },
  );
  return data;
}
