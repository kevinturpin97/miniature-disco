/**
 * Tests for the Automations page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Automations from "./Automations";

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
  listCommands: vi.fn(),
}));
vi.mock("@/api/automations", () => ({
  listAutomations: vi.fn(),
  createAutomation: vi.fn(),
  updateAutomation: vi.fn(),
  deleteAutomation: vi.fn(),
}));

// Mock formatters
vi.mock("@/utils/formatters", () => ({
  formatDate: (d: string) => d,
  formatRelativeTime: (d: string) => d,
}));

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

// Mock Modal
vi.mock("@/components/ui/Modal", () => ({
  Modal: ({
    open,
    children,
    title,
  }: {
    open: boolean;
    children: React.ReactNode;
    title: string;
    onClose: () => void;
  }) => (open ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null),
}));

// Mock ConfirmDialog
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    message,
    onConfirm,
    onClose,
  }: {
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    onClose: () => void;
    loading?: boolean;
  }) =>
    open ? (
      <div data-testid="confirm-dialog">
        <p>{title}</p>
        <p>{message}</p>
        <button onClick={onConfirm}>confirm-btn</button>
        <button onClick={onClose}>cancel-btn</button>
      </div>
    ) : null,
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { listCommands } from "@/api/commands";
import {
  listAutomations,
  updateAutomation,
  deleteAutomation,
} from "@/api/automations";

const mockListGreenhouses = listGreenhouses as ReturnType<typeof vi.fn>;
const mockListZones = listZones as ReturnType<typeof vi.fn>;
const mockListActuators = listActuators as ReturnType<typeof vi.fn>;
const mockListCommands = listCommands as ReturnType<typeof vi.fn>;
const mockListAutomations = listAutomations as ReturnType<typeof vi.fn>;
const mockUpdateAutomation = updateAutomation as ReturnType<typeof vi.fn>;
const mockDeleteAutomation = deleteAutomation as ReturnType<typeof vi.fn>;

/* ---------- helpers ---------- */

const GH1 = {
  id: 1,
  name: "GH1",
  location: "",
  description: "",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  zone_count: 1,
};

const ZONE_A = {
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
};

const ACTUATOR_FAN = {
  id: 5,
  zone: 10,
  actuator_type: "FAN",
  name: "Main Fan",
  gpio_pin: 4,
  state: false,
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
};

const RULE_1 = {
  id: 100,
  zone: 10,
  name: "Cool when hot",
  description: "Activate fan above 30C",
  sensor_type: "TEMP",
  condition: "GT",
  threshold_value: 30,
  action_actuator: 5,
  action_command_type: "ON",
  action_value: null,
  cooldown_seconds: 300,
  is_active: true,
  last_triggered: "2024-06-01T12:00:00Z",
  created_at: "2024-01-01T00:00:00Z",
};

function paginated<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function setupStructure() {
  mockListGreenhouses.mockResolvedValue(paginated([GH1]));
  mockListZones.mockResolvedValue(paginated([ZONE_A]));
}

function setupZoneData(rules = [RULE_1]) {
  mockListAutomations.mockResolvedValue(paginated(rules));
  mockListActuators.mockResolvedValue(paginated([ACTUATOR_FAN]));
  mockListCommands.mockResolvedValue(paginated([]));
}

function renderAutomations() {
  return render(
    <MemoryRouter>
      <Automations />
    </MemoryRouter>,
  );
}

/* ---------- tests ---------- */

describe("Automations page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockListGreenhouses.mockReturnValue(new Promise(() => {}));
    renderAutomations();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows title and subtitle after loading", async () => {
    setupStructure();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Define rules to automatically control actuators based on sensor readings.",
      ),
    ).toBeInTheDocument();
  });

  it("shows select zone prompt when no zone selected", async () => {
    setupStructure();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });
    const matches = screen.getAllByText(
      "Select a zone to manage automation rules.",
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it("shows zone options in select dropdown", async () => {
    setupStructure();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    const optgroup = select.querySelector('optgroup[label="GH1"]');
    expect(optgroup).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Zone A" }),
    ).toBeInTheDocument();
  });

  it("shows error state on API failure", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Failed to load data.")).toBeInTheDocument();
    });
  });

  it("shows 'no rules' when zone has no automation rules", async () => {
    setupStructure();
    setupZoneData([]);
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    // Select zone
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("No automation rules configured."),
      ).toBeInTheDocument();
    });
  });

  it("shows Add Rule button when zone is selected", async () => {
    setupStructure();
    setupZoneData([]);
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    // No Add Rule button before selecting zone
    expect(screen.queryByText("Add Rule")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Add Rule")).toBeInTheDocument();
    });
  });

  it("renders rule card with name and condition summary", async () => {
    setupStructure();
    setupZoneData();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });
    expect(screen.getByText("Activate fan above 30C")).toBeInTheDocument();
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("Main Fan")).toBeInTheDocument();
  });

  it("shows active/inactive badge on rule cards", async () => {
    setupStructure();
    setupZoneData();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });

    // Active badge
    const badges = screen.getAllByText("Active");
    expect(badges.length).toBeGreaterThanOrEqual(1);
  });

  it("toggles rule active state on button click", async () => {
    setupStructure();
    setupZoneData();
    mockUpdateAutomation.mockResolvedValue({ ...RULE_1, is_active: false });
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });

    // Click the toggle button (shows "Inactive" text to deactivate an active rule)
    const toggleButtons = screen.getAllByText("Inactive");
    fireEvent.click(toggleButtons[0]);

    await waitFor(() => {
      expect(mockUpdateAutomation).toHaveBeenCalledWith(100, {
        is_active: false,
      });
    });
  });

  it("opens create modal on Add Rule click", async () => {
    setupStructure();
    setupZoneData([]);
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Add Rule")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Rule"));

    await waitFor(() => {
      expect(screen.getByTestId("modal")).toBeInTheDocument();
    });
  });

  it("opens edit modal for existing rule", async () => {
    setupStructure();
    setupZoneData();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Edit"));

    await waitFor(() => {
      const modal = screen.getByTestId("modal");
      expect(modal).toBeInTheDocument();
      expect(screen.getByText("Edit Rule")).toBeInTheDocument();
    });
  });

  it("shows delete confirmation dialog", async () => {
    setupStructure();
    setupZoneData();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
      expect(
        screen.getByText(
          "Are you sure you want to delete this automation rule?",
        ),
      ).toBeInTheDocument();
    });
  });

  it("deletes rule on confirm", async () => {
    setupStructure();
    setupZoneData();
    mockDeleteAutomation.mockResolvedValue(undefined);
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Cool when hot")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Delete"));

    await waitFor(() => {
      expect(screen.getByTestId("confirm-dialog")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("confirm-btn"));

    await waitFor(() => {
      expect(mockDeleteAutomation).toHaveBeenCalledWith(100);
    });
  });

  it("shows trigger history section", async () => {
    setupStructure();
    setupZoneData();
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Trigger History")).toBeInTheDocument();
    });
    expect(
      screen.getByText("No triggers recorded yet."),
    ).toBeInTheDocument();
  });

  it("shows trigger history with commands linked to automation rules", async () => {
    setupStructure();
    mockListAutomations.mockResolvedValue(paginated([RULE_1]));
    mockListActuators.mockResolvedValue(paginated([ACTUATOR_FAN]));
    mockListCommands.mockResolvedValue(
      paginated([
        {
          id: 200,
          actuator: 5,
          command_type: "ON",
          value: null,
          status: "ACK",
          created_by: null,
          automation_rule: 100,
          created_at: "2024-06-01T12:00:00Z",
          sent_at: "2024-06-01T12:00:01Z",
          acknowledged_at: "2024-06-01T12:00:02Z",
          error_message: "",
        },
      ]),
    );
    renderAutomations();

    await waitFor(() => {
      expect(screen.getByText("Automations")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(screen.getByText("Trigger History")).toBeInTheDocument();
    });

    // "Main Fan" appears in both the rule card and the trigger history table
    const fanTexts = screen.getAllByText("Main Fan");
    expect(fanTexts.length).toBe(2);
    // "Cool when hot" appears in both the rule card and the trigger history rule column
    const ruleTexts = screen.getAllByText("Cool when hot");
    expect(ruleTexts.length).toBe(2);
    expect(screen.getByText("Acknowledged")).toBeInTheDocument();
  });
});
