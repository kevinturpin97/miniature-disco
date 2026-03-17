/**
 * useDeviceMetrics — real-time device metrics for a fleet device.
 *
 * Strategy:
 *   1. Connects to `/ws/fleet/{deviceId}/` and listens for `device_metrics_update` events.
 *   2. Falls back to polling `getFleetDevice` every 30 seconds when the WebSocket
 *      is not connected (e.g. first load, reconnect gap).
 *
 * Returns the latest `DeviceMetrics` snapshot and the WebSocket connection state.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket } from "./useWebSocket";
import { getFleetDevice } from "@/api/fleet";
import type { DeviceMetrics } from "@/api/fleet";

const POLL_INTERVAL_MS = 30_000;

export function useDeviceMetrics(deviceId: string | undefined) {
  const [metrics, setMetrics] = useState<DeviceMetrics | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval>>();

  const enabled = Boolean(deviceId);

  // Fetch the latest metrics via REST (used for initial load + fallback polling).
  const fetchMetrics = useCallback(async () => {
    if (!deviceId) return;
    try {
      const device = await getFleetDevice(deviceId);
      if (device.latest_metrics) {
        setMetrics(device.latest_metrics);
      }
    } catch {
      // Silently ignore — stale data is fine for a metrics display.
    }
  }, [deviceId]);

  // WebSocket connection to /ws/fleet/{deviceId}/
  const wsUrl = deviceId ? `/ws/fleet/${deviceId}/` : "";

  const { isConnected } = useWebSocket({
    url: wsUrl,
    enabled,
    onMessage: (msg) => {
      if (msg.type === "device_metrics_update") {
        setMetrics({
          id: 0,
          edge_device: 0,
          cpu_percent: msg.cpu_percent as number,
          memory_percent: msg.memory_percent as number,
          disk_percent: msg.disk_percent as number,
          cpu_temperature: (msg.cpu_temperature as number | null) ?? null,
          uptime_seconds: (msg.uptime_seconds as number | null) ?? null,
          network_latency_ms: (msg.network_latency_ms as number | null) ?? null,
          recorded_at: msg.recorded_at as string,
        });
      }
    },
  });

  // Initial fetch on mount.
  useEffect(() => {
    if (!enabled) return;
    fetchMetrics();
  }, [enabled, fetchMetrics]);

  // Start polling when the WebSocket is not connected; stop when it connects.
  useEffect(() => {
    if (!enabled) return;

    if (!isConnected) {
      pollTimer.current = setInterval(fetchMetrics, POLL_INTERVAL_MS);
    } else {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = undefined;
      }
    }

    return () => {
      if (pollTimer.current) {
        clearInterval(pollTimer.current);
        pollTimer.current = undefined;
      }
    };
  }, [isConnected, enabled, fetchMetrics]);

  return { metrics, isConnected };
}
