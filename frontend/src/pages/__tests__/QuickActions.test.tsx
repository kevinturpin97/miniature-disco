/**
 * Tests for the QuickActions page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuickActions from "../QuickActions";

// Mock API modules
vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));
vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));
vi.mock("@/api/actuators", () => ({
  listActuators: vi.fn(),
}));
vi.mock("@/api/commands", () => ({
  createCommand: vi.fn(),
}));

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

// Mock ZoneStatusWidget
vi.mock("@/components/ui/ZoneStatusWidget", () => ({
  ZoneStatusWidget: ({ zone }: { zone: { id: number; name: string } }) => (
    <div data-testid={`zone-widget-${zone.id}`}>{zone.name}</div>
  ),
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { createCommand } from "@/api/commands";

const mockListGreenhouses = listGreenhouses as ReturnType<typeof vi.fn>;
const mockListZones = listZones as ReturnType<typeof vi.fn>;
const mockListActuators = listActuators as ReturnType<typeof vi.fn>;
const mockCreateCommand = createCommand as ReturnType<typeof vi.fn>;

const ghResponse = {
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

const actuatorResponse = {
  count: 2,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      zone: 10,
      actuator_type: "VALVE",
      name: "Water Valve 1",
      gpio_pin: 5,
      state: false,
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
    },
    {
      id: 2,
      zone: 10,
      actuator_type: "FAN",
      name: "Fan 1",
      gpio_pin: 6,
      state: true,
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
    },
  ],
};

function renderQuickActions() {
  return render(
    <MemoryRouter>
      <QuickActions />
    </MemoryRouter>,
  );
}

describe("QuickActions page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderQuickActions();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows title and zone overview after loading", async () => {
    mockListGreenhouses.mockResolvedValue(ghResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListActuators.mockResolvedValue(actuatorResponse);

    renderQuickActions();

    await waitFor(() => {
      expect(screen.getByText("Quick Actions")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Fast actuator control from your mobile home screen."),
    ).toBeInTheDocument();
  });

  it("renders zone status widgets", async () => {
    mockListGreenhouses.mockResolvedValue(ghResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListActuators.mockResolvedValue(actuatorResponse);

    renderQuickActions();

    await waitFor(() => {
      expect(screen.getByTestId("zone-widget-10")).toBeInTheDocument();
    });
    expect(screen.getByTestId("zone-widget-10")).toHaveTextContent("Zone A");
  });

  it("renders actuator toggle switches", async () => {
    mockListGreenhouses.mockResolvedValue(ghResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListActuators.mockResolvedValue(actuatorResponse);

    renderQuickActions();

    await waitFor(() => {
      expect(screen.getByText("Water Valve 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Fan 1")).toBeInTheDocument();

    // Check toggle switch roles
    const switches = screen.getAllByRole("switch");
    expect(switches).toHaveLength(2);

    // Water Valve 1 is OFF (state: false)
    expect(switches[0]).not.toBeChecked();
    // Fan 1 is ON (state: true)
    expect(switches[1]).toBeChecked();
  });

  it("shows no actuators message when empty", async () => {
    mockListGreenhouses.mockResolvedValue(ghResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListActuators.mockResolvedValue({
      count: 0,
      next: null,
      previous: null,
      results: [],
    });

    renderQuickActions();

    await waitFor(() => {
      expect(screen.getByText("No actuators found.")).toBeInTheDocument();
    });
  });

  it("toggles actuator on click", async () => {
    mockListGreenhouses.mockResolvedValue(ghResponse);
    mockListZones.mockResolvedValue(zoneResponse);
    mockListActuators.mockResolvedValue(actuatorResponse);
    mockCreateCommand.mockResolvedValue({ id: 1, status: "PENDING" });

    renderQuickActions();

    await waitFor(() => {
      expect(screen.getByText("Water Valve 1")).toBeInTheDocument();
    });

    // Click to toggle Water Valve 1 (OFF → ON)
    const switches = screen.getAllByRole("switch");
    fireEvent.click(switches[0]);

    await waitFor(() => {
      expect(mockCreateCommand).toHaveBeenCalledWith(1, {
        command_type: "ON",
      });
    });

    // Optimistic update: switch should now be ON
    expect(switches[0]).toBeChecked();
  });

  it("shows empty state on API failure (errors handled via toast)", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));

    renderQuickActions();

    // After API failure, loading finishes and no actuators message is shown
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("No actuators found.")).toBeInTheDocument();
    });
  });
});
