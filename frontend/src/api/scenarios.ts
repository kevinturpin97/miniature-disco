/**
 * Scenarios & Schedules API calls.
 */

import client from "./client";
import type {
  PaginatedResponse,
  Scenario,
  ScenarioPayload,
  ScheduleData,
  SchedulePayload,
} from "@/types";

// --- Scenarios ---

export async function listScenarios(
  zoneId: number,
): Promise<PaginatedResponse<Scenario>> {
  const { data } = await client.get<PaginatedResponse<Scenario>>(
    `/zones/${zoneId}/scenarios/`,
  );
  return data;
}

export async function createScenario(
  zoneId: number,
  payload: ScenarioPayload,
): Promise<Scenario> {
  const { data } = await client.post<Scenario>(
    `/zones/${zoneId}/scenarios/`,
    payload,
  );
  return data;
}

export async function updateScenario(
  id: number,
  payload: Partial<ScenarioPayload>,
): Promise<Scenario> {
  const { data } = await client.patch<Scenario>(`/scenarios/${id}/`, payload);
  return data;
}

export async function deleteScenario(id: number): Promise<void> {
  await client.delete(`/scenarios/${id}/`);
}

export async function runScenario(
  id: number,
): Promise<{ detail: string; scenario_id: number }> {
  const { data } = await client.post<{ detail: string; scenario_id: number }>(
    `/scenarios/${id}/run/`,
  );
  return data;
}

// --- Schedules ---

export async function listSchedules(
  zoneId: number,
): Promise<PaginatedResponse<ScheduleData>> {
  const { data } = await client.get<PaginatedResponse<ScheduleData>>(
    `/zones/${zoneId}/schedules/`,
  );
  return data;
}

export async function createSchedule(
  zoneId: number,
  payload: SchedulePayload,
): Promise<ScheduleData> {
  const { data } = await client.post<ScheduleData>(
    `/zones/${zoneId}/schedules/`,
    payload,
  );
  return data;
}

export async function updateSchedule(
  id: number,
  payload: Partial<SchedulePayload>,
): Promise<ScheduleData> {
  const { data } = await client.patch<ScheduleData>(
    `/schedules/${id}/`,
    payload,
  );
  return data;
}

export async function deleteSchedule(id: number): Promise<void> {
  await client.delete(`/schedules/${id}/`);
}
