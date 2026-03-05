/**
 * Marketplace Templates API calls.
 */

import client from "./client";
import type {
  PaginatedResponse,
  Template,
  TemplateCategory,
  TemplateClonePayload,
  TemplateCloneResponse,
  TemplatePayload,
  TemplatePublishPayload,
  TemplateRating,
} from "@/types";

// --- Categories ---

export async function listCategories(): Promise<
  PaginatedResponse<TemplateCategory>
> {
  const { data } = await client.get<PaginatedResponse<TemplateCategory>>(
    "/templates/categories/",
  );
  return data;
}

// --- Templates ---

export async function listTemplates(params?: {
  category?: number;
  is_official?: boolean;
  search?: string;
  ordering?: string;
}): Promise<PaginatedResponse<Template>> {
  const { data } = await client.get<PaginatedResponse<Template>>(
    "/templates/",
    { params },
  );
  return data;
}

export async function getTemplate(id: number): Promise<Template> {
  const { data } = await client.get<Template>(`/templates/${id}/`);
  return data;
}

export async function createTemplate(
  payload: TemplatePayload,
): Promise<Template> {
  const { data } = await client.post<Template>("/templates/", payload);
  return data;
}

export async function updateTemplate(
  id: number,
  payload: Partial<TemplatePayload>,
): Promise<Template> {
  const { data } = await client.patch<Template>(`/templates/${id}/`, payload);
  return data;
}

export async function deleteTemplate(id: number): Promise<void> {
  await client.delete(`/templates/${id}/`);
}

// --- Clone ---

export async function cloneTemplate(
  id: number,
  payload: TemplateClonePayload,
): Promise<TemplateCloneResponse> {
  const { data } = await client.post<TemplateCloneResponse>(
    `/templates/${id}/clone/`,
    payload,
  );
  return data;
}

// --- Rate ---

export async function rateTemplate(
  id: number,
  score: number,
  comment?: string,
): Promise<Template> {
  const { data } = await client.post<Template>(`/templates/${id}/rate/`, {
    score,
    comment: comment ?? "",
  });
  return data;
}

export async function listRatings(
  id: number,
): Promise<PaginatedResponse<TemplateRating>> {
  const { data } = await client.get<PaginatedResponse<TemplateRating>>(
    `/templates/${id}/ratings/`,
  );
  return data;
}

// --- Publish from zone ---

export async function publishTemplate(
  zoneId: number,
  payload: TemplatePublishPayload,
): Promise<Template> {
  const { data } = await client.post<Template>(
    `/zones/${zoneId}/publish-template/`,
    payload,
  );
  return data;
}
