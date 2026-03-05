/**
 * Tests for the Commands page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Commands from "../Commands";

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
  listCommands: vi.fn(),
}));

// Mock formatters
vi.mock("@/utils/formatters", () => ({
  formatDate: (d: string) => d,
}));

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";

const mockListGreenhouses = listGreenhouses as ReturnType<typeof vi.fn>;
const mockListZones = listZones as ReturnType<typeof vi.fn>;

function renderCommands() {
  return render(
    <MemoryRouter>
      <Commands />
    </MemoryRouter>,
  );
}

describe("Commands page", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows loading spinner initially", () => {
    // Never resolve to keep loading state
    mockListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderCommands();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows title and subtitle after loading", async () => {
    mockListGreenhouses.mockResolvedValue({
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
    });
    mockListZones.mockResolvedValue({
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
    });

    renderCommands();

    await waitFor(() => {
      expect(screen.getByText("Commands")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Send commands to actuators and view command history."),
    ).toBeInTheDocument();
  });

  it("shows 'Select a zone to manage actuators.' when no zone selected", async () => {
    mockListGreenhouses.mockResolvedValue({
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
    });
    mockListZones.mockResolvedValue({
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
    });

    renderCommands();

    await waitFor(() => {
      expect(screen.getByText("Commands")).toBeInTheDocument();
    });

    // The select option and the empty-state paragraph both show this text
    const matches = screen.getAllByText("Select a zone to manage actuators.");
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows zone options in select dropdown", async () => {
    mockListGreenhouses.mockResolvedValue({
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
    });
    mockListZones.mockResolvedValue({
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
    });

    renderCommands();

    await waitFor(() => {
      expect(screen.getByText("Commands")).toBeInTheDocument();
    });

    // The greenhouse name appears as an optgroup label attribute
    const select = screen.getByRole("combobox");
    const optgroup = select.querySelector('optgroup[label="GH1"]');
    expect(optgroup).toBeInTheDocument();
    // The zone name appears as an option inside the select
    expect(screen.getByRole("option", { name: "Zone A" })).toBeInTheDocument();
  });

  it("shows page content on API failure (errors handled via toast)", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));

    renderCommands();

    // After API failure, loading finishes and page renders with empty data
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("Commands")).toBeInTheDocument();
    });
  });
});
