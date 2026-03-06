/**
 * Tests for the Zone Detail page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ZoneDetail from "../ZoneDetail";

// Mock API modules
vi.mock("@/api/zones", () => ({
  getZone: vi.fn(),
  exportZoneCsv: vi.fn(),
}));
vi.mock("@/api/sensors", () => ({
  listSensors: vi.fn(),
  getSensorReadings: vi.fn(),
  updateSensor: vi.fn(),
}));
vi.mock("@/api/actuators", () => ({
  listActuators: vi.fn(),
}));
vi.mock("@/api/analytics", () => ({
  getZonePredictions: vi.fn().mockResolvedValue({ zone_id: 10, zone_name: "Zone Alpha", timestamp: "", sensors: [], drift: {} }),
  getZoneAnomalies: vi.fn().mockResolvedValue({ zone_id: 10, zone_name: "Zone Alpha", period_days: 7, anomalies: [] }),
  getZoneSuggestions: vi.fn().mockResolvedValue({ zone_id: 10, zone_name: "Zone Alpha", suggestions: [] }),
}));

// Mock hooks — avoid real WebSocket
vi.mock("@/hooks/useSensorData", () => ({
  useSensorData: () => ({ isConnected: false }),
}));
vi.mock("@/stores/sensorStore", () => ({
  useSensorStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({ latestReadings: {} }),
}));

// Mock recharts to avoid rendering issues in jsdom
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children: React.ReactNode }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Legend: () => null,
}));

import { getZone, exportZoneCsv } from "@/api/zones";
import { listSensors, getSensorReadings } from "@/api/sensors";
import { listActuators } from "@/api/actuators";

const mockedGetZone = vi.mocked(getZone);
const mockedListSensors = vi.mocked(listSensors);
const mockedGetSensorReadings = vi.mocked(getSensorReadings);
const mockedListActuators = vi.mocked(listActuators);
const mockedExportZoneCsv = vi.mocked(exportZoneCsv);

const mockZone = {
  id: 10,
  greenhouse: 1,
  name: "Zone Alpha",
  relay_id: 42,
  description: "",
  is_active: true,
  is_online: true,
  last_seen: "2024-01-15T10:00:00Z",
  transmission_interval: 300,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

const mockSensors = [
  {
    id: 100,
    zone: 10,
    sensor_type: "TEMP" as const,
    label: "Temperature",
    unit: "°C",
    min_threshold: 10,
    max_threshold: 35,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 101,
    zone: 10,
    sensor_type: "HUM_AIR" as const,
    label: "Air Humidity",
    unit: "%",
    min_threshold: 40,
    max_threshold: 80,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
  },
];

const mockActuators = [
  {
    id: 200,
    zone: 10,
    actuator_type: "VALVE" as const,
    name: "Main Valve",
    gpio_pin: 4,
    state: true,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 201,
    zone: 10,
    actuator_type: "FAN" as const,
    name: "Exhaust Fan",
    gpio_pin: 5,
    state: false,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
  },
];

function renderZoneDetail() {
  return render(
    <MemoryRouter initialEntries={["/zones/10"]}>
      <Routes>
        <Route path="zones/:zoneId" element={<ZoneDetail />} />
      </Routes>
    </MemoryRouter>,
  );
}

function setupSuccessMocks() {
  mockedGetZone.mockResolvedValue(mockZone);
  mockedListSensors.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: mockSensors,
  });
  mockedListActuators.mockResolvedValue({
    count: 2,
    next: null,
    previous: null,
    results: mockActuators,
  });
  mockedGetSensorReadings.mockResolvedValue({
    count: 0,
    next: null,
    previous: null,
    results: [],
  });
}

describe("ZoneDetail page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading skeleton initially", () => {
    mockedGetZone.mockReturnValue(new Promise(() => {}));
    mockedListSensors.mockReturnValue(new Promise(() => {}));
    mockedListActuators.mockReturnValue(new Promise(() => {}));
    const { container } = renderZoneDetail();
    expect(container.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("renders zone header with name and relay ID", async () => {
    setupSuccessMocks();
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Zone Alpha" })).toBeInTheDocument();
    });
    expect(screen.getByText("Relay #42")).toBeInTheDocument();
    expect(screen.getAllByText("Online")[0]).toBeInTheDocument();
  });

  it("renders period selector buttons", async () => {
    setupSuccessMocks();
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Last hour")).toBeInTheDocument();
    });
    expect(screen.getByText("Last 24h")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Custom")).toBeInTheDocument();
  });

  it("renders latest readings table with sensor data", async () => {
    setupSuccessMocks();
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Latest Readings")).toBeInTheDocument();
    });
    // Sensor labels may appear in both the chart section and the table
    expect(screen.getAllByText("Temperature").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("Air Humidity").length).toBeGreaterThanOrEqual(1);
  });

  it("renders actuator states", async () => {
    setupSuccessMocks();
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Main Valve")).toBeInTheDocument();
    });
    expect(screen.getByText("Exhaust Fan")).toBeInTheDocument();
    expect(screen.getByText("ON")).toBeInTheDocument();
    expect(screen.getByText("OFF")).toBeInTheDocument();
  });

  it("renders export CSV button", async () => {
    setupSuccessMocks();
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeInTheDocument();
    });
  });

  it("shows custom date pickers when Custom period is selected", async () => {
    setupSuccessMocks();
    const { container } = renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Custom")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Custom"));

    await waitFor(() => {
      const inputs = container.querySelectorAll('input[type="datetime-local"]');
      expect(inputs.length).toBe(2);
    });
  });

  it("shows 'Zone not found' on API failure (errors handled via toast)", async () => {
    mockedGetZone.mockRejectedValue(new Error("Network error"));
    mockedListSensors.mockRejectedValue(new Error("Network error"));
    mockedListActuators.mockRejectedValue(new Error("Network error"));
    renderZoneDetail();

    // After API failure, zone is null so "Zone not found." is displayed
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("Zone not found.")).toBeInTheDocument();
    });
  });

  it("shows empty state for actuators when none exist", async () => {
    mockedGetZone.mockResolvedValue(mockZone);
    mockedListSensors.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockedListActuators.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("No actuators configured for this zone.")).toBeInTheDocument();
    });
  });

  it("calls export API and triggers download on Export CSV click", async () => {
    setupSuccessMocks();
    const blob = new Blob(["test,csv"], { type: "text/csv" });
    mockedExportZoneCsv.mockResolvedValue(blob);

    // Mock URL.createObjectURL + revokeObjectURL
    const mockUrl = "blob:test";
    const createObjectURL = vi.fn(() => mockUrl);
    const revokeObjectURL = vi.fn();
    Object.defineProperty(globalThis.URL, "createObjectURL", { value: createObjectURL, writable: true });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });

    renderZoneDetail();

    await waitFor(() => {
      expect(screen.getByText("Export CSV")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Export CSV"));

    await waitFor(() => {
      expect(mockedExportZoneCsv).toHaveBeenCalled();
    });
  });
});
