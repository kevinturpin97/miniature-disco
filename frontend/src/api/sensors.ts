/**
 * Sensor API calls.
 */

import client from "./client";
import type { PaginatedResponse, Sensor, SensorReading } from "@/types";

export async function listSensors(
  zoneId: number,
): Promise<PaginatedResponse<Sensor>> {
  const { data } = await client.get<PaginatedResponse<Sensor>>(
    `/zones/${zoneId}/sensors/`,
  );
  return data;
}

export async function createSensor(
  zoneId: number,
  payload: Pick<Sensor, "sensor_type" | "unit"> & Partial<Pick<Sensor, "label" | "min_threshold" | "max_threshold">>,
): Promise<Sensor> {
  const { data } = await client.post<Sensor>(`/zones/${zoneId}/sensors/`, payload);
  return data;
}

export async function deleteSensor(id: number): Promise<void> {
  await client.delete(`/sensors/${id}/`);
}

export async function updateSensor(
  id: number,
  payload: Partial<Pick<Sensor, "label" | "min_threshold" | "max_threshold" | "is_active">>,
): Promise<Sensor> {
  const { data } = await client.patch<Sensor>(`/sensors/${id}/`, payload);
  return data;
}

interface ReadingsParams {
  from?: string;
  to?: string;
  interval?: "hour" | "day";
}

export async function getSensorReadings(
  sensorId: number,
  params?: ReadingsParams,
): Promise<PaginatedResponse<SensorReading>> {
  const { data } = await client.get<PaginatedResponse<SensorReading>>(
    `/sensors/${sensorId}/readings/`,
    { params },
  );
  return data;
}
