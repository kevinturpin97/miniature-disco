/**
 * Automation rules API calls.
 */

import client from "./client";
import type { AutomationRule, PaginatedResponse } from "@/types";

export async function listAutomations(
  zoneId: number,
): Promise<PaginatedResponse<AutomationRule>> {
  const { data } = await client.get<PaginatedResponse<AutomationRule>>(
    `/zones/${zoneId}/automations/`,
  );
  return data;
}

export interface CreateAutomationPayload {
  name: string;
  description?: string;
  sensor_type: string;
  condition: string;
  threshold_value: number;
  action_actuator: number;
  action_command_type: string;
  action_value?: number | null;
  cooldown_seconds?: number;
  is_active?: boolean;
}

export async function createAutomation(
  zoneId: number,
  payload: CreateAutomationPayload,
): Promise<AutomationRule> {
  const { data } = await client.post<AutomationRule>(
    `/zones/${zoneId}/automations/`,
    payload,
  );
  return data;
}

export async function updateAutomation(
  id: number,
  payload: Partial<CreateAutomationPayload>,
): Promise<AutomationRule> {
  const { data } = await client.patch<AutomationRule>(
    `/automations/${id}/`,
    payload,
  );
  return data;
}

export async function deleteAutomation(id: number): Promise<void> {
  await client.delete(`/automations/${id}/`);
}
