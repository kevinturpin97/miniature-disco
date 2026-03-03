/**
 * Custom hook for real-time alerts via WebSocket.
 *
 * Connects to ``/ws/alerts/`` to receive live alert notifications.
 * Fetches the initial unacknowledged count on mount.
 */

import { useEffect, useCallback } from "react";
import { useWebSocket } from "./useWebSocket";
import { useAlertStore } from "@/stores/alertStore";
import { listAlerts } from "@/api/alerts";
import type { Alert } from "@/types";

export function useAlerts() {
  const {
    unacknowledgedCount,
    setUnacknowledgedCount,
    addRealtimeAlert,
  } = useAlertStore();

  // Fetch initial unacknowledged count
  useEffect(() => {
    async function fetchCount() {
      try {
        const data = await listAlerts({ is_acknowledged: false });
        setUnacknowledgedCount(data.count);
      } catch {
        // Silently fail — badge will show stale count
      }
    }
    fetchCount();
  }, [setUnacknowledgedCount]);

  // Handle incoming WebSocket alert messages
  const handleMessage = useCallback(
    (data: Record<string, unknown>) => {
      if (data.type === "alert_notification") {
        const alert: Alert = {
          id: data.alert_id as number,
          sensor: null,
          zone: data.zone_id as number,
          alert_type: data.alert_type as Alert["alert_type"],
          severity: data.severity as Alert["severity"],
          value: null,
          message: data.message as string,
          is_acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          created_at: (data.created_at as string) ?? new Date().toISOString(),
        };
        addRealtimeAlert(alert);
      }
    },
    [addRealtimeAlert],
  );

  const { isConnected } = useWebSocket({
    url: "/ws/alerts/",
    onMessage: handleMessage,
  });

  return { unacknowledgedCount, isConnected };
}
