/**
 * Zone API calls.
 */

import client from "./client";
import type { PaginatedResponse, Zone } from "@/types";

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
