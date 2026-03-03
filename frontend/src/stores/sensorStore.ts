/**
 * Sensor data store (Zustand).
 *
 * Caches the latest sensor readings per zone for the dashboard.
 */

import { create } from "zustand";
import type { Greenhouse, Zone, Sensor, SensorReading } from "@/types";

interface SensorStoreState {
  greenhouses: Greenhouse[];
  zonesByGreenhouse: Record<number, Zone[]>;
  sensorsByZone: Record<number, Sensor[]>;
  latestReadings: Record<number, SensorReading>;

  setGreenhouses: (greenhouses: Greenhouse[]) => void;
  setZones: (greenhouseId: number, zones: Zone[]) => void;
  setSensors: (zoneId: number, sensors: Sensor[]) => void;
  updateReading: (sensorId: number, reading: SensorReading) => void;
}

export const useSensorStore = create<SensorStoreState>((set) => ({
  greenhouses: [],
  zonesByGreenhouse: {},
  sensorsByZone: {},
  latestReadings: {},

  setGreenhouses: (greenhouses) => set({ greenhouses }),

  setZones: (greenhouseId, zones) =>
    set((state) => ({
      zonesByGreenhouse: { ...state.zonesByGreenhouse, [greenhouseId]: zones },
    })),

  setSensors: (zoneId, sensors) =>
    set((state) => ({
      sensorsByZone: { ...state.sensorsByZone, [zoneId]: sensors },
    })),

  updateReading: (sensorId, reading) =>
    set((state) => ({
      latestReadings: { ...state.latestReadings, [sensorId]: reading },
    })),
}));
