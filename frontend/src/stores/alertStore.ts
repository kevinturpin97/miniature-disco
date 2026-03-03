/**
 * Alert store (Zustand).
 *
 * Manages real-time alert state: unacknowledged count and live feed.
 */

import { create } from "zustand";
import type { Alert } from "@/types";

interface AlertStoreState {
  /** Unacknowledged alert count for the badge. */
  unacknowledgedCount: number;
  /** Recently received alerts via WebSocket (newest first, max 50). */
  recentAlerts: Alert[];

  setUnacknowledgedCount: (count: number) => void;
  decrementUnacknowledgedCount: () => void;
  addRealtimeAlert: (alert: Alert) => void;
  reset: () => void;
}

export const useAlertStore = create<AlertStoreState>((set) => ({
  unacknowledgedCount: 0,
  recentAlerts: [],

  setUnacknowledgedCount: (count) => set({ unacknowledgedCount: count }),

  decrementUnacknowledgedCount: () =>
    set((state) => ({
      unacknowledgedCount: Math.max(0, state.unacknowledgedCount - 1),
    })),

  addRealtimeAlert: (alert) =>
    set((state) => ({
      recentAlerts: [alert, ...state.recentAlerts].slice(0, 50),
      unacknowledgedCount: state.unacknowledgedCount + 1,
    })),

  reset: () => set({ unacknowledgedCount: 0, recentAlerts: [] }),
}));
