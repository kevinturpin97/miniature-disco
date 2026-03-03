/**
 * Tests for the Dashboard page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "./Dashboard";

// Mock the API modules
vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));
vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));
vi.mock("@/api/sensors", () => ({
  listSensors: vi.fn(),
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors } from "@/api/sensors";

const mockedListGreenhouses = vi.mocked(listGreenhouses);
const mockedListZones = vi.mocked(listZones);
const mockedListSensors = vi.mocked(listSensors);

function renderDashboard() {
  return render(
    <MemoryRouter>
      <Dashboard />
    </MemoryRouter>,
  );
}

describe("Dashboard page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    // Never resolve to keep loading state
    mockedListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    // The Spinner component renders an SVG with role="status"
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("shows empty state when no greenhouses", async () => {
    mockedListGreenhouses.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("No greenhouses")).toBeInTheDocument();
    });
  });

  it("renders greenhouse with zones", async () => {
    mockedListGreenhouses.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 1,
          name: "My Greenhouse",
          location: "Rooftop",
          description: "",
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
          zone_count: 1,
        },
      ],
    });

    mockedListZones.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 10,
          greenhouse: 1,
          name: "Zone Alpha",
          relay_id: 1,
          description: "",
          is_active: true,
          is_online: true,
          last_seen: "2024-01-01T12:00:00Z",
          transmission_interval: 300,
          created_at: "2024-01-01T00:00:00Z",
          updated_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    mockedListSensors.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [
        {
          id: 100,
          zone: 10,
          sensor_type: "TEMP",
          label: "Temperature",
          unit: "°C",
          min_threshold: 10,
          max_threshold: 35,
          is_active: true,
          created_at: "2024-01-01T00:00:00Z",
        },
      ],
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("My Greenhouse")).toBeInTheDocument();
    });

    expect(screen.getByText("Rooftop")).toBeInTheDocument();
    expect(screen.getByText("Zone Alpha")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockedListGreenhouses.mockRejectedValue(new Error("Network error"));

    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText("Failed to load dashboard data.")).toBeInTheDocument();
    });
  });
});
