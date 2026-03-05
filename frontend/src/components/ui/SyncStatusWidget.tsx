/**
 * SyncStatusWidget — header badge that shows the edge sync state.
 *
 * Shows:
 *   ✅  synced      — all records synced (total_backlog === 0)
 *   ⏳  X pending   — records waiting to be synced
 *   ❌  offline     — one or more devices have pending retries
 *
 * Only rendered in edge mode (VITE_EDGE_MODE=true).
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getSyncStatus, type SyncStatus } from "@/api/sync";
import { cn } from "@/utils/cn";

const POLL_INTERVAL_MS = 30_000; // 30 s

type SyncState = "synced" | "pending" | "offline";

function classifyState(status: SyncStatus): SyncState {
  const hasRetries = status.devices.some((d) => d.pending_retries > 0);
  if (hasRetries) return "offline";
  if (status.total_backlog > 0) return "pending";
  return "synced";
}

export function SyncStatusWidget() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchStatus = async () => {
      try {
        const data = await getSyncStatus();
        if (mounted) setStatus(data);
      } catch {
        // Silently ignore — widget is informational only
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchStatus();
    const timer = setInterval(fetchStatus, POLL_INTERVAL_MS);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  if (loading || !status) return null;

  const state = classifyState(status);

  const config: Record<SyncState, { label: string; classes: string; icon: React.ReactNode }> = {
    synced: {
      label: "Synced",
      classes: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
      icon: (
        <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
      ),
    },
    pending: {
      label: `${status.total_backlog} pending`,
      classes: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
      icon: (
        <svg className="h-3 w-3 flex-shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ),
    },
    offline: {
      label: "Sync offline",
      classes: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
      icon: (
        <svg className="h-3 w-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
      ),
    },
  };

  const { label, classes, icon } = config[state];

  return (
    <Link
      to="/sync"
      className={cn(
        "hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium transition-opacity hover:opacity-80 sm:flex",
        classes,
      )}
      title="Sync status — click to view details"
      aria-label={`Sync status: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </Link>
  );
}
