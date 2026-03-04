/**
 * Tests for the sensor Zustand store.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useSensorStore } from "./sensorStore";
import type { Greenhouse, Zone, Sensor, SensorReading } from "@/types";

const mockGreenhouse: Greenhouse = {
  id: 1,
  name: "Test Greenhouse",
  location: "Test Location",
  description: "",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  zone_count: 2,
  organization: 1,
};

const mockZone: Zone = {
  id: 10,
  greenhouse: 1,
  name: "Zone A",
  relay_id: 1,
  description: "",
  is_active: true,
  is_online: true,
  last_seen: "2024-01-01T00:00:00Z",
  transmission_interval: 300,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockSensor: Sensor = {
  id: 100,
  zone: 10,
  sensor_type: "TEMP",
  label: "Temperature",
  unit: "°C",
  min_threshold: 10,
  max_threshold: 35,
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
};

const mockReading: SensorReading = {
  id: 1000,
  sensor: 100,
  value: 23.5,
  relay_timestamp: null,
  received_at: "2024-01-01T12:00:00Z",
};

describe("sensorStore", () => {
  beforeEach(() => {
    useSensorStore.setState({
      greenhouses: [],
      zonesByGreenhouse: {},
      sensorsByZone: {},
      latestReadings: {},
    });
  });

  it("has correct initial state", () => {
    const state = useSensorStore.getState();
    expect(state.greenhouses).toEqual([]);
    expect(state.zonesByGreenhouse).toEqual({});
    expect(state.sensorsByZone).toEqual({});
    expect(state.latestReadings).toEqual({});
  });

  it("sets greenhouses", () => {
    useSensorStore.getState().setGreenhouses([mockGreenhouse]);
    expect(useSensorStore.getState().greenhouses).toEqual([mockGreenhouse]);
  });

  it("sets zones by greenhouse", () => {
    useSensorStore.getState().setZones(1, [mockZone]);
    expect(useSensorStore.getState().zonesByGreenhouse[1]).toEqual([mockZone]);
  });

  it("sets sensors by zone", () => {
    useSensorStore.getState().setSensors(10, [mockSensor]);
    expect(useSensorStore.getState().sensorsByZone[10]).toEqual([mockSensor]);
  });

  it("updates a reading", () => {
    useSensorStore.getState().updateReading(100, mockReading);
    expect(useSensorStore.getState().latestReadings[100]).toEqual(mockReading);
  });

  it("preserves other greenhouse zones when setting new ones", () => {
    const otherZone: Zone = { ...mockZone, id: 20, greenhouse: 2, name: "Zone B" };
    useSensorStore.getState().setZones(1, [mockZone]);
    useSensorStore.getState().setZones(2, [otherZone]);

    expect(useSensorStore.getState().zonesByGreenhouse[1]).toEqual([mockZone]);
    expect(useSensorStore.getState().zonesByGreenhouse[2]).toEqual([otherZone]);
  });
});
