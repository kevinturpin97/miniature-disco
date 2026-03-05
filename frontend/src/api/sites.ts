/**
 * Sites & Weather API calls.
 */

import client from "./client";
import type {
  PaginatedResponse,
  Site,
  SiteDashboard,
  SiteWeatherResponse,
  WeatherAlert,
  WeatherData,
} from "@/types";

export async function listSites(): Promise<PaginatedResponse<Site>> {
  const { data } = await client.get<PaginatedResponse<Site>>("/sites/");
  return data;
}

export async function createSite(
  payload: Pick<Site, "name" | "address" | "latitude" | "longitude" | "timezone">,
): Promise<Site> {
  const { data } = await client.post<Site>("/sites/", payload);
  return data;
}

export async function updateSite(
  id: number,
  payload: Partial<Pick<Site, "name" | "address" | "latitude" | "longitude" | "timezone" | "is_active">>,
): Promise<Site> {
  const { data } = await client.patch<Site>(`/sites/${id}/`, payload);
  return data;
}

export async function deleteSite(id: number): Promise<void> {
  await client.delete(`/sites/${id}/`);
}

export async function getSiteWeather(siteId: number): Promise<SiteWeatherResponse> {
  const { data } = await client.get<SiteWeatherResponse>(
    `/sites/${siteId}/weather/`,
  );
  return data;
}

export async function getSiteWeatherHistory(
  siteId: number,
  days: number = 7,
): Promise<{ site_id: number; site_name: string; period_days: number; data: WeatherData[] }> {
  const { data } = await client.get(`/sites/${siteId}/weather/history/`, {
    params: { days },
  });
  return data;
}

export async function getSiteDashboard(): Promise<SiteDashboard[]> {
  const { data } = await client.get<SiteDashboard[]>("/sites/dashboard/");
  return data;
}

export async function listWeatherAlerts(params?: {
  site?: number;
  acknowledged?: boolean;
}): Promise<PaginatedResponse<WeatherAlert>> {
  const { data } = await client.get<PaginatedResponse<WeatherAlert>>(
    "/weather-alerts/",
    { params },
  );
  return data;
}

export async function acknowledgeWeatherAlert(id: number): Promise<WeatherAlert> {
  const { data } = await client.patch<WeatherAlert>(
    `/weather-alerts/${id}/acknowledge/`,
  );
  return data;
}

export async function getWeatherCorrelation(
  zoneId: number,
  days: number = 7,
): Promise<{
  zone_id: number;
  zone_name: string;
  site_name: string;
  period_days: number;
  data: Array<{
    timestamp: string;
    external_temperature: number | null;
    external_humidity: number | null;
    precipitation: number | null;
    uv_index: number | null;
    sensor_readings: Record<string, number | null>;
  }>;
}> {
  const { data } = await client.get(
    `/zones/${zoneId}/weather-correlation/`,
    { params: { days } },
  );
  return data;
}
