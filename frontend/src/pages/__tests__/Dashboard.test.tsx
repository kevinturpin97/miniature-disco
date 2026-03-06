/**
 * Tests for the Dashboard page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Dashboard from "../Dashboard";

// Mock the API modules
vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
  createGreenhouse: vi.fn(),
  updateGreenhouse: vi.fn(),
  deleteGreenhouse: vi.fn(),
}));
vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
  createZone: vi.fn(),
  updateZone: vi.fn(),
  deleteZone: vi.fn(),
}));
vi.mock("@/api/sensors", () => ({
  listSensors: vi.fn(),
}));
vi.mock("@/api/alerts", () => ({
  listAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors } from "@/api/sensors";
import { listAlerts } from "@/api/alerts";

const mockedListGreenhouses = vi.mocked(listGreenhouses);
const mockedListZones = vi.mocked(listZones);
const mockedListSensors = vi.mocked(listSensors);
const mockedListAlerts = vi.mocked(listAlerts);

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
    // Default: alerts returns empty list
    mockedListAlerts.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  it("shows skeleton loaders initially", () => {
    // Never resolve to keep loading state
    mockedListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderDashboard();
    // Sprint 30: loading state uses Skeleton components (animate-pulse divs)
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
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
          organization: 1,
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

    // Location is rendered as "· Rooftop" in Sprint 30 layout
    expect(screen.getByText("· Rooftop")).toBeInTheDocument();
    expect(screen.getByText("Zone Alpha")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    // ZoneStatusBadge renders "Online" — multiple may exist (zone badge + global metric label)
    expect(screen.getAllByText("Online").length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state on API failure (errors handled via toast)", async () => {
    mockedListGreenhouses.mockRejectedValue(new Error("Network error"));

    renderDashboard();

    // After API failure, loading finishes and empty state is shown
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("No greenhouses")).toBeInTheDocument();
    });
  });
});
