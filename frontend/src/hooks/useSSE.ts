/**
 * Hook for consuming Server-Sent Events (SSE) from the streaming
 * readings endpoint: ``GET /api/zones/{id}/readings/stream/``.
 *
 * Uses the native ``EventSource`` API with JWT token passed via
 * query parameter (since EventSource doesn't support custom headers).
 */

import { useEffect, useRef, useCallback, useState } from "react";

export interface SSEReading {
  type: "reading";
  sensor_id: number;
  sensor_type: string;
  value: number;
  received_at: string;
  [key: string]: unknown;
}

export interface SSEEvent {
  type: string;
  [key: string]: unknown;
}

interface UseSSEOptions {
  /** Zone ID to stream readings for. */
  zoneId: number | null;
  /** Callback for each incoming reading event. */
  onReading?: (data: SSEReading) => void;
  /** Callback for any SSE event (connected, heartbeat, timeout). */
  onEvent?: (data: SSEEvent) => void;
  /** Whether the SSE connection is enabled. Defaults to true. */
  enabled?: boolean;
}

/**
 * Connect to the SSE streaming endpoint for real-time sensor readings.
 *
 * Automatically reconnects on timeout or connection loss.
 */
export function useSSE({
  zoneId,
  onReading,
  onEvent,
  enabled = true,
}: UseSSEOptions) {
  const [isConnected, setIsConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const onReadingRef = useRef(onReading);
  const onEventRef = useRef(onEvent);
  onReadingRef.current = onReading;
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!enabled || zoneId === null) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    const baseUrl = (import.meta.env.VITE_API_URL as string | undefined) ?? "";
    const url = `${baseUrl}/zones/${zoneId}/readings/stream/?token=${token}`;

    const es = new EventSource(url);
    eventSourceRef.current = es;

    es.addEventListener("connected", (event) => {
      setIsConnected(true);
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEventRef.current?.(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener("reading", (event) => {
      try {
        const data = JSON.parse(event.data) as SSEReading;
        onReadingRef.current?.(data);
        onEventRef.current?.(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener("heartbeat", (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEventRef.current?.(data);
      } catch {
        // ignore
      }
    });

    es.addEventListener("timeout", (event) => {
      try {
        const data = JSON.parse(event.data) as SSEEvent;
        onEventRef.current?.(data);
      } catch {
        // ignore
      }
      // Reconnect after timeout
      es.close();
    });

    es.onerror = () => {
      setIsConnected(false);
      es.close();
      eventSourceRef.current = null;
      if (enabled) {
        reconnectTimeout.current = setTimeout(connect, 5000);
      }
    };
  }, [zoneId, enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      setIsConnected(false);
    };
  }, [connect]);

  return { isConnected };
}
