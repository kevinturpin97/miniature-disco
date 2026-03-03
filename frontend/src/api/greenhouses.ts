/**
 * Greenhouse API calls.
 */

import client from "./client";
import type { Greenhouse, PaginatedResponse } from "@/types";

export async function listGreenhouses(): Promise<PaginatedResponse<Greenhouse>> {
  const { data } = await client.get<PaginatedResponse<Greenhouse>>(
    "/greenhouses/",
  );
  return data;
}

export async function getGreenhouse(id: number): Promise<Greenhouse> {
  const { data } = await client.get<Greenhouse>(`/greenhouses/${id}/`);
  return data;
}

export async function createGreenhouse(
  payload: Pick<Greenhouse, "name" | "location" | "description">,
): Promise<Greenhouse> {
  const { data } = await client.post<Greenhouse>("/greenhouses/", payload);
  return data;
}

export async function updateGreenhouse(
  id: number,
  payload: Partial<Pick<Greenhouse, "name" | "location" | "description" | "is_active">>,
): Promise<Greenhouse> {
  const { data } = await client.patch<Greenhouse>(
    `/greenhouses/${id}/`,
    payload,
  );
  return data;
}

export async function deleteGreenhouse(id: number): Promise<void> {
  await client.delete(`/greenhouses/${id}/`);
}
