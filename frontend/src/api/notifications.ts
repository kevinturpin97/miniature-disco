/**
 * Notification API calls — channels, rules, and logs.
 */

import client from "./client";
import type {
  NotificationChannel,
  NotificationChannelPayload,
  NotificationLog,
  NotificationRule,
  NotificationRulePayload,
  PaginatedResponse,
} from "@/types";

// ── Channels ────────────────────────────────────────────────────

export async function listChannels(
  orgSlug: string,
): Promise<PaginatedResponse<NotificationChannel>> {
  const { data } = await client.get<PaginatedResponse<NotificationChannel>>(
    `/orgs/${orgSlug}/notifications/channels/`,
  );
  return data;
}

export async function createChannel(
  orgSlug: string,
  payload: NotificationChannelPayload,
): Promise<NotificationChannel> {
  const { data } = await client.post<NotificationChannel>(
    `/orgs/${orgSlug}/notifications/channels/`,
    payload,
  );
  return data;
}

export async function updateChannel(
  orgSlug: string,
  channelId: number,
  payload: Partial<NotificationChannelPayload>,
): Promise<NotificationChannel> {
  const { data } = await client.patch<NotificationChannel>(
    `/orgs/${orgSlug}/notifications/channels/${channelId}/`,
    payload,
  );
  return data;
}

export async function deleteChannel(
  orgSlug: string,
  channelId: number,
): Promise<void> {
  await client.delete(`/orgs/${orgSlug}/notifications/channels/${channelId}/`);
}

// ── Rules ───────────────────────────────────────────────────────

export async function listRules(
  orgSlug: string,
): Promise<PaginatedResponse<NotificationRule>> {
  const { data } = await client.get<PaginatedResponse<NotificationRule>>(
    `/orgs/${orgSlug}/notifications/rules/`,
  );
  return data;
}

export async function createRule(
  orgSlug: string,
  payload: NotificationRulePayload,
): Promise<NotificationRule> {
  const { data } = await client.post<NotificationRule>(
    `/orgs/${orgSlug}/notifications/rules/`,
    payload,
  );
  return data;
}

export async function updateRule(
  orgSlug: string,
  ruleId: number,
  payload: Partial<NotificationRulePayload>,
): Promise<NotificationRule> {
  const { data } = await client.patch<NotificationRule>(
    `/orgs/${orgSlug}/notifications/rules/${ruleId}/`,
    payload,
  );
  return data;
}

export async function deleteRule(
  orgSlug: string,
  ruleId: number,
): Promise<void> {
  await client.delete(`/orgs/${orgSlug}/notifications/rules/${ruleId}/`);
}

// ── Logs ────────────────────────────────────────────────────────

export async function listLogs(
  orgSlug: string,
): Promise<PaginatedResponse<NotificationLog>> {
  const { data } = await client.get<PaginatedResponse<NotificationLog>>(
    `/orgs/${orgSlug}/notifications/logs/`,
  );
  return data;
}
