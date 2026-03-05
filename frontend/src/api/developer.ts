/**
 * API client for developer platform endpoints (API Keys, Webhooks, Sandbox).
 */

import client from "./client";
import type {
  APIKeyCreatePayload,
  APIKeyCreateResponse,
  APIKeyData,
  APIKeyLogData,
  PaginatedResponse,
  SandboxInfo,
  WebhookData,
  WebhookDeliveryData,
  WebhookPayload,
} from "@/types";

// API Keys
export const listAPIKeys = (orgSlug: string) =>
  client.get<PaginatedResponse<APIKeyData>>(`/orgs/${orgSlug}/api-keys/`);

export const createAPIKey = (orgSlug: string, data: APIKeyCreatePayload) =>
  client.post<APIKeyCreateResponse>(`/orgs/${orgSlug}/api-keys/`, data);

export const revokeAPIKey = (orgSlug: string, id: number) =>
  client.post<{ detail: string }>(`/orgs/${orgSlug}/api-keys/${id}/revoke/`);

export const deleteAPIKey = (orgSlug: string, id: number) =>
  client.delete(`/orgs/${orgSlug}/api-keys/${id}/`);

export const listAPIKeyLogs = (orgSlug: string, params?: Record<string, string>) =>
  client.get<PaginatedResponse<APIKeyLogData>>(`/orgs/${orgSlug}/api-keys/logs/`, { params });

// Webhooks
export const listWebhooks = (orgSlug: string) =>
  client.get<PaginatedResponse<WebhookData>>(`/orgs/${orgSlug}/webhooks/`);

export const createWebhook = (orgSlug: string, data: WebhookPayload) =>
  client.post<WebhookData>(`/orgs/${orgSlug}/webhooks/`, data);

export const updateWebhook = (orgSlug: string, id: number, data: Partial<WebhookPayload>) =>
  client.patch<WebhookData>(`/orgs/${orgSlug}/webhooks/${id}/`, data);

export const deleteWebhook = (orgSlug: string, id: number) =>
  client.delete(`/orgs/${orgSlug}/webhooks/${id}/`);

export const listWebhookDeliveries = (orgSlug: string, params?: Record<string, string>) =>
  client.get<PaginatedResponse<WebhookDeliveryData>>(`/orgs/${orgSlug}/webhooks/deliveries/`, { params });

// Sandbox
export const getSandboxInfo = () =>
  client.get<SandboxInfo>(`/developer/sandbox/`);
