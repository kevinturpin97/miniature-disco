/**
 * Tests for the alert Zustand store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useAlertStore } from "./alertStore";

describe("alertStore", () => {
  beforeEach(() => {
    useAlertStore.setState({
      unacknowledgedCount: 0,
      recentAlerts: [],
    });
  });

  it("sets unacknowledged count", () => {
    useAlertStore.getState().setUnacknowledgedCount(5);
    expect(useAlertStore.getState().unacknowledgedCount).toBe(5);
  });

  it("decrements unacknowledged count", () => {
    useAlertStore.getState().setUnacknowledgedCount(3);
    useAlertStore.getState().decrementUnacknowledgedCount();
    expect(useAlertStore.getState().unacknowledgedCount).toBe(2);
  });

  it("does not go below zero", () => {
    useAlertStore.getState().setUnacknowledgedCount(0);
    useAlertStore.getState().decrementUnacknowledgedCount();
    expect(useAlertStore.getState().unacknowledgedCount).toBe(0);
  });

  it("adds a realtime alert and increments count", () => {
    useAlertStore.getState().setUnacknowledgedCount(1);
    useAlertStore.getState().addRealtimeAlert({
      id: 10,
      sensor: null,
      zone: 1,
      alert_type: "HIGH",
      severity: "WARNING",
      value: 35.5,
      message: "Temperature too high",
      is_acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      created_at: "2024-01-01T00:00:00Z",
    });

    const state = useAlertStore.getState();
    expect(state.unacknowledgedCount).toBe(2);
    expect(state.recentAlerts).toHaveLength(1);
    expect(state.recentAlerts[0].id).toBe(10);
  });

  it("limits recent alerts to 50", () => {
    for (let i = 0; i < 55; i++) {
      useAlertStore.getState().addRealtimeAlert({
        id: i,
        sensor: null,
        zone: 1,
        alert_type: "HIGH",
        severity: "WARNING",
        value: null,
        message: `Alert ${i}`,
        is_acknowledged: false,
        acknowledged_by: null,
        acknowledged_at: null,
        created_at: "2024-01-01T00:00:00Z",
      });
    }
    expect(useAlertStore.getState().recentAlerts).toHaveLength(50);
  });

  it("resets state", () => {
    useAlertStore.getState().setUnacknowledgedCount(10);
    useAlertStore.getState().addRealtimeAlert({
      id: 1,
      sensor: null,
      zone: 1,
      alert_type: "OFFLINE",
      severity: "CRITICAL",
      value: null,
      message: "Offline",
      is_acknowledged: false,
      acknowledged_by: null,
      acknowledged_at: null,
      created_at: "2024-01-01T00:00:00Z",
    });
    useAlertStore.getState().reset();

    const state = useAlertStore.getState();
    expect(state.unacknowledgedCount).toBe(0);
    expect(state.recentAlerts).toHaveLength(0);
  });
});
