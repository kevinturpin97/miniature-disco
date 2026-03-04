/**
 * Tests for the History page.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import History from "./History";

// Mock API modules
vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));
vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));
vi.mock("@/api/sensors", () => ({
  listSensors: vi.fn(),
  getSensorReadings: vi.fn(),
}));

// Mock recharts to avoid rendering issues in tests
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

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors, getSensorReadings } from "@/api/sensors";

const mockListGreenhouses = listGreenhouses as ReturnType<typeof vi.fn>;
const mockListZones = listZones as ReturnType<typeof vi.fn>;
const mockListSensors = listSensors as ReturnType<typeof vi.fn>;
const mockGetSensorReadings = getSensorReadings as ReturnType<typeof vi.fn>;

function renderHistory() {
  return render(
    <MemoryRouter>
      <History />
    </MemoryRouter>,
  );
}

const greenhouseResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      name: "GH1",
      location: "",
      description: "",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      zone_count: 1,
    },
  ],
};

const zoneResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 10,
      greenhouse: 1,
      name: "Zone A",
      relay_id: 1,
      description: "",
      is_active: true,
      is_online: true,
      last_seen: null,
      transmission_interval: 300,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
};

const emptySensorResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

const emptyReadingsResponse = {
  count: 0,
  next: null,
  previous: null,
  results: [],
};

describe("History page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    // Never resolve to keep loading state
    mockListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderHistory();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows title and subtitle after loading", async () => {
    mockListGreenhouses.mockResolvedValue(greenhouseResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListSensors.mockResolvedValue(emptySensorResponse);
    mockGetSensorReadings.mockResolvedValue(emptyReadingsResponse);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Compare sensor data across multiple zones."),
    ).toBeInTheDocument();
  });

  it("shows empty state message when no zones selected", async () => {
    mockListGreenhouses.mockResolvedValue(greenhouseResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListSensors.mockResolvedValue(emptySensorResponse);
    mockGetSensorReadings.mockResolvedValue(emptyReadingsResponse);

    renderHistory();

    await waitFor(() => {
      expect(
        screen.getByText("Select at least one zone to view historical data."),
      ).toBeInTheDocument();
    });
  });

  it("shows zone checkboxes grouped by greenhouse", async () => {
    mockListGreenhouses.mockResolvedValue(greenhouseResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListSensors.mockResolvedValue(emptySensorResponse);
    mockGetSensorReadings.mockResolvedValue(emptyReadingsResponse);

    renderHistory();

    await waitFor(() => {
      // Greenhouse name as group heading
      expect(screen.getByText("GH1")).toBeInTheDocument();
    });

    // Zone checkbox
    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByText("Zone A")).toBeInTheDocument();
  });

  it("shows period selector buttons", async () => {
    mockListGreenhouses.mockResolvedValue(greenhouseResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListSensors.mockResolvedValue(emptySensorResponse);
    mockGetSensorReadings.mockResolvedValue(emptyReadingsResponse);

    renderHistory();

    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });

    expect(screen.getByText("Last hour")).toBeInTheDocument();
    expect(screen.getByText("Last 24h")).toBeInTheDocument();
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("Last 30 days")).toBeInTheDocument();
  });

  it("shows page content on API failure (errors handled via toast)", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));

    renderHistory();

    // After API failure, loading finishes and empty page is shown
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("History")).toBeInTheDocument();
    });
  });
});
