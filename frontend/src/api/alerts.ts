/**
 * Alert API calls.
 */

import client from "./client";
import type { Alert, PaginatedResponse } from "@/types";

interface AlertListParams {
  zone?: number;
  severity?: string;
  is_acknowledged?: boolean;
  ordering?: string;
  page?: number;
}

export async function listAlerts(
  params?: AlertListParams,
): Promise<PaginatedResponse<Alert>> {
  const { data } = await client.get<PaginatedResponse<Alert>>("/alerts/", {
    params,
  });
  return data;
}

export async function getAlert(id: number): Promise<Alert> {
  const { data } = await client.get<Alert>(`/alerts/${id}/`);
  return data;
}

export async function acknowledgeAlert(id: number): Promise<Alert> {
  const { data } = await client.patch<Alert>(`/alerts/${id}/acknowledge/`);
  return data;
}
