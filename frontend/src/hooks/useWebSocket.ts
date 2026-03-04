/**
 * WebSocket hook for real-time sensor data.
 *
 * Connects to ``/ws/sensors/{zoneId}/`` using the JWT access token.
 * Automatically reconnects on disconnect.
 */

import { useEffect, useRef, useCallback, useState } from "react";

interface WsMessage {
  type: string;
  [key: string]: unknown;
}

interface UseWebSocketOptions {
  url: string;
  onMessage?: (data: WsMessage) => void;
  enabled?: boolean;
}

export function useWebSocket({ url, onMessage, enabled = true }: UseWebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout>>();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  const connect = useCallback(() => {
    if (!enabled) return;

    const token = localStorage.getItem("access_token");
    if (!token) return;

    let fullUrl: string;
    const wsBaseUrl = import.meta.env.VITE_WS_URL as string | undefined;
    if (wsBaseUrl) {
      // Use explicit WS base URL (e.g. ws://localhost:8000/ws)
      const base = wsBaseUrl.replace(/\/+$/, "");
      const path = url.startsWith("/ws") ? url.slice(3) : url;
      fullUrl = `${base}${path}?token=${token}`;
    } else {
      // Fallback: connect via current host (relies on proxy / Nginx)
      const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsHost = window.location.host;
      fullUrl = `${wsProtocol}//${wsHost}${url}?token=${token}`;
    }

    const ws = new WebSocket(fullUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as WsMessage;
        onMessageRef.current?.(data);
      } catch {
        // Ignore non-JSON messages
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      if (enabled) {
        reconnectTimeout.current = setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [url, enabled]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { isConnected };
}
