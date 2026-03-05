/**
 * Tests for the Scenarios & Schedules page.
 * Note: the page loads all greenhouses+zones at startup and auto-selects the first zone.
 * The select shows zone names grouped by greenhouse; greenhouse names are not rendered as text.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Scenarios from "../Scenarios";

vi.mock("@/api/greenhouses", () => ({ listGreenhouses: vi.fn() }));
vi.mock("@/api/zones", () => ({ listZones: vi.fn() }));
vi.mock("@/api/actuators", () => ({ listActuators: vi.fn() }));
vi.mock("@/api/scenarios", () => ({
  listScenarios: vi.fn(),
  createScenario: vi.fn(),
  updateScenario: vi.fn(),
  deleteScenario: vi.fn(),
  runScenario: vi.fn(),
  listSchedules: vi.fn(),
  createSchedule: vi.fn(),
  updateSchedule: vi.fn(),
  deleteSchedule: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <svg data-testid="spinner" className="animate-spin" />,
}));

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ open, children, title }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, title }) =>
    open ? <div data-testid="confirm-dialog"><button onClick={onConfirm}>{title}</button></div> : null,
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import * as scenariosApi from "@/api/scenarios";

const mockListGreenhouses = vi.mocked(listGreenhouses);
const mockListZones = vi.mocked(listZones);
const mockListActuators = vi.mocked(listActuators);
const mockListScenarios = vi.mocked(scenariosApi.listScenarios);
const mockListSchedules = vi.mocked(scenariosApi.listSchedules);

function paginated(results) {
  return { count: results.length, next: null, previous: null, results };
}

const fakeGreenhouses = paginated([
  { id: 1, name: "Greenhouse A", location: "", description: "", is_active: true, zone_count: 1, created_at: "", updated_at: "", organization: 1 },
]);

const fakeZones = paginated([
  { id: 10, greenhouse: 1, name: "Zone Alpha", relay_id: 1, description: "", is_active: true, is_online: true, last_seen: null, transmission_interval: 300, created_at: "", updated_at: "" },
]);

const fakeScenario = {
  id: 1, name: "Morning Watering", description: "", zone: 10,
  is_active: true, status: "IDLE", steps: [], created_at: "", updated_at: "",
};

function renderScenarios() {
  return render(
    <MemoryRouter>
      <Scenarios />
    </MemoryRouter>,
  );
}

describe("Scenarios page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGreenhouses.mockResolvedValue(fakeGreenhouses);
    mockListZones.mockResolvedValue(fakeZones);
    mockListActuators.mockResolvedValue(paginated([]));
    mockListScenarios.mockResolvedValue(paginated([]));
    mockListSchedules.mockResolvedValue(paginated([]));
  });

  it("renders zone selector with zone names after loading", async () => {
    renderScenarios();
    await waitFor(() => {
      expect(screen.getByText("Zone Alpha")).toBeInTheDocument();
    });
  });

  it("auto-selects first zone and calls listScenarios on load", async () => {
    renderScenarios();
    await waitFor(() => {
      expect(mockListScenarios).toHaveBeenCalledWith(10);
    });
  });

  it("auto-selects first zone and calls listSchedules on load", async () => {
    renderScenarios();
    await waitFor(() => {
      expect(mockListSchedules).toHaveBeenCalledWith(10);
    });
  });

  it("shows scenario name in the list after loading", async () => {
    mockListScenarios.mockResolvedValue(paginated([fakeScenario]));
    renderScenarios();
    await waitFor(() => {
      expect(screen.getByText("Morning Watering")).toBeInTheDocument();
    });
  });

  it("handles greenhouse API failure gracefully without crashing", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));
    renderScenarios();
    await waitFor(() => {
      expect(document.querySelector("svg.animate-spin")).not.toBeInTheDocument();
    });
  });
});
