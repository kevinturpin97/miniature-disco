/**
 * Actuator API calls.
 */

import client from "./client";
import type { Actuator, PaginatedResponse } from "@/types";

export async function listActuators(
  zoneId: number,
): Promise<PaginatedResponse<Actuator>> {
  const { data } = await client.get<PaginatedResponse<Actuator>>(
    `/zones/${zoneId}/actuators/`,
  );
  return data;
}

export async function updateActuator(
  id: number,
  payload: Partial<Pick<Actuator, "name" | "is_active">>,
): Promise<Actuator> {
  const { data } = await client.patch<Actuator>(`/actuators/${id}/`, payload);
  return data;
}
