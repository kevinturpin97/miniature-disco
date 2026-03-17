/**
 * useOTAProgress — real-time OTA job progress for a fleet device.
 *
 * Connects to `/ws/fleet/{deviceId}/` and listens for `ota_status_update` events.
 * Filters by `jobId` when provided so callers only receive updates for a
 * specific job.
 *
 * Returns the latest `OTAProgressEvent` and whether the WebSocket is connected.
 */

import { useState } from "react";
import { useWebSocket } from "./useWebSocket";
import type { OTAJobStatus } from "@/api/fleet";

export interface OTAProgressEvent {
  jobId: number;
  deviceId: string;
  status: OTAJobStatus;
  progressPercent: number;
  firmwareVersion: string;
  errorMessage: string;
}

interface UseOTAProgressOptions {
  deviceId: string | undefined;
  /** When provided, only events for this specific job are returned. */
  jobId?: number;
}

export function useOTAProgress({ deviceId, jobId }: UseOTAProgressOptions) {
  const [progress, setProgress] = useState<OTAProgressEvent | null>(null);

  const enabled = Boolean(deviceId);
  const wsUrl = deviceId ? `/ws/fleet/${deviceId}/` : "";

  const { isConnected } = useWebSocket({
    url: wsUrl,
    enabled,
    onMessage: (msg) => {
      if (msg.type !== "ota_status_update") return;

      const event: OTAProgressEvent = {
        jobId: msg.job_id as number,
        deviceId: msg.device_id as string,
        status: msg.status as OTAJobStatus,
        progressPercent: msg.progress_percent as number,
        firmwareVersion: msg.firmware_version as string,
        errorMessage: (msg.error_message as string) ?? "",
      };

      // Filter by jobId if specified.
      if (jobId !== undefined && event.jobId !== jobId) return;

      setProgress(event);
    },
  });

  return { progress, isConnected };
}
