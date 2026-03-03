/**
 * Hook to consume real-time sensor data for a zone via WebSocket.
 *
 * Updates the sensor store with live readings.
 */

import { useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useSensorStore } from "@/stores/sensorStore";
import type { SensorReading } from "@/types";

export function useSensorData(zoneId: number | null) {
  const updateReading = useSensorStore((s) => s.updateReading);

  const onMessage = useCallback(
    (data: { type: string; [key: string]: unknown }) => {
      if (data.type === "sensor_reading") {
        const reading: SensorReading = {
          id: 0,
          sensor: data.sensor_id as number,
          value: data.value as number,
          relay_timestamp: null,
          received_at: data.received_at as string,
        };
        updateReading(data.sensor_id as number, reading);
      }
    },
    [updateReading],
  );

  const { isConnected } = useWebSocket({
    url: zoneId ? `/ws/sensors/${zoneId}/` : "",
    onMessage,
    enabled: zoneId !== null,
  });

  return { isConnected };
}
