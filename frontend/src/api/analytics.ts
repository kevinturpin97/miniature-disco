/**
 * Analytics and AI prediction API calls.
 */

import client from "./client";
import type {
  OrgAnalyticsSummary,
  ZoneAIReport,
  ZoneAnalytics,
  ZoneAnomalies,
  ZonePredictions,
  ZoneSuggestions,
} from "@/types";

export async function getZoneAnalytics(
  zoneId: number,
  days: number = 7,
): Promise<ZoneAnalytics> {
  const { data } = await client.get<ZoneAnalytics>(
    `/zones/${zoneId}/analytics/`,
    { params: { days } },
  );
  return data;
}

export async function getZoneReportPdf(
  zoneId: number,
  days: number = 7,
): Promise<Blob> {
  const { data } = await client.get<Blob>(
    `/zones/${zoneId}/report/pdf/`,
    { params: { days }, responseType: "blob" },
  );
  return data;
}

export async function getOrgAnalyticsSummary(
  slug: string,
): Promise<OrgAnalyticsSummary> {
  const { data } = await client.get<OrgAnalyticsSummary>(
    `/orgs/${slug}/analytics/summary/`,
  );
  return data;
}

export async function getZonePredictions(
  zoneId: number,
): Promise<ZonePredictions> {
  const { data } = await client.get<ZonePredictions>(
    `/zones/${zoneId}/predictions/`,
  );
  return data;
}

export async function getZoneAnomalies(
  zoneId: number,
  days: number = 7,
): Promise<ZoneAnomalies> {
  const { data } = await client.get<ZoneAnomalies>(
    `/zones/${zoneId}/anomalies/`,
    { params: { days } },
  );
  return data;
}

export async function getZoneSuggestions(
  zoneId: number,
): Promise<ZoneSuggestions> {
  const { data } = await client.get<ZoneSuggestions>(
    `/zones/${zoneId}/suggestions/`,
  );
  return data;
}

export async function applySuggestion(
  zoneId: number,
  suggestionId: number,
): Promise<{ detail: string; sensor_id: number; min_threshold: number | null; max_threshold: number | null }> {
  const { data } = await client.post(
    `/zones/${zoneId}/suggestions/apply/`,
    { suggestion_id: suggestionId },
  );
  return data;
}

export async function getZoneAIReport(
  zoneId: number,
): Promise<ZoneAIReport> {
  const { data } = await client.get<ZoneAIReport>(
    `/zones/${zoneId}/ai-report/`,
  );
  return data;
}
