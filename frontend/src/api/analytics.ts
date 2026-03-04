/**
 * Analytics API calls.
 */

import client from "./client";
import type { OrgAnalyticsSummary, ZoneAnalytics } from "@/types";

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
