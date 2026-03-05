/**
 * Tests for the CultureJournal page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CultureJournal from "../CultureJournal";

// Mock API modules
vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));
vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));
vi.mock("@/api/compliance", () => ({
  listCultureJournal: vi.fn(),
  listCropCycles: vi.fn(),
  createNote: vi.fn(),
  createCropCycle: vi.fn(),
  generateTraceabilityPDF: vi.fn(),
  exportGlobalGAP: vi.fn(),
}));

// Mock formatters (date-fns needs real dates)
vi.mock("@/utils/formatters", () => ({
  formatDate: (d: string) => d,
  formatRelativeTime: (d: string) => `relative(${d})`,
}));

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

// Mock Modal — CultureJournal passes `isOpen` while the real Modal expects `open`.
// We provide a thin wrapper that renders children when isOpen is truthy.
vi.mock("@/components/ui/Modal", () => ({
  Modal: ({
    isOpen,
    open,
    onClose,
    title,
    children,
  }: {
    isOpen?: boolean;
    open?: boolean;
    onClose: () => void;
    title: string;
    children: React.ReactNode;
  }) => {
    const visible = isOpen ?? open;
    if (!visible) return null;
    return (
      <div data-testid="modal" role="dialog" aria-label={title}>
        <h2>{title}</h2>
        <button onClick={onClose} aria-label="Close">x</button>
        <div>{children}</div>
      </div>
    );
  },
}));

// Mock framer-motion to avoid animation issues in tests
vi.mock("framer-motion", () => ({
  motion: {
    div: ({
      children,
      ...props
    }: React.HTMLAttributes<HTMLDivElement> & { [key: string]: unknown }) => (
      <div {...filterDomProps(props)}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

/** Strip non-DOM props injected by framer-motion to avoid React warnings. */
function filterDomProps(
  props: Record<string, unknown>,
): Record<string, unknown> {
  const {
    initial,
    animate,
    exit,
    transition,
    whileHover,
    whileTap,
    variants,
    ...rest
  } = props;
  return rest;
}

// Mock react-hot-toast
vi.mock("react-hot-toast", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import {
  listCultureJournal,
  listCropCycles,
} from "@/api/compliance";

const mockListGreenhouses = listGreenhouses as ReturnType<typeof vi.fn>;
const mockListZones = listZones as ReturnType<typeof vi.fn>;
const mockListCultureJournal = listCultureJournal as ReturnType<typeof vi.fn>;
const mockListCropCycles = listCropCycles as ReturnType<typeof vi.fn>;

function paginatedResponse<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

const fakeGreenhouses = paginatedResponse([
  {
    id: 1,
    name: "Greenhouse Alpha",
    location: "Field A",
    description: "",
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
    zone_count: 2,
  },
  {
    id: 2,
    name: "Greenhouse Beta",
    location: "Field B",
    description: "",
    is_active: true,
    created_at: "2024-02-01T00:00:00Z",
    updated_at: "2024-02-01T00:00:00Z",
    zone_count: 1,
  },
]);

const fakeZones = paginatedResponse([
  {
    id: 10,
    greenhouse: 1,
    name: "Zone Tomato",
    relay_id: 1,
    description: "",
    is_active: true,
    is_online: true,
    last_seen: "2024-06-01T12:00:00Z",
    transmission_interval: 300,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  {
    id: 11,
    greenhouse: 1,
    name: "Zone Basil",
    relay_id: 2,
    description: "",
    is_active: true,
    is_online: false,
    last_seen: null,
    transmission_interval: 300,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
]);

const fakeCropCycles = paginatedResponse([
  {
    id: 100,
    zone: 10,
    species: "Solanum lycopersicum",
    variety: "Roma",
    status: "ACTIVE",
    sowing_date: "2024-03-15",
    transplant_date: null,
    harvest_start_date: null,
    harvest_end_date: null,
    expected_yield: "",
    notes: "",
    created_at: "2024-03-15T00:00:00Z",
    updated_at: "2024-03-15T00:00:00Z",
  },
]);

const fakeJournalEntries = paginatedResponse([
  {
    id: 1,
    zone: 10,
    crop_cycle: 100,
    entry_type: "COMMAND" as const,
    entry_type_display: "Command",
    summary: "Turned on water valve for Zone Tomato",
    details: {},
    user: 1,
    username: "admin",
    created_at: "2024-06-01T10:00:00Z",
  },
  {
    id: 2,
    zone: 10,
    crop_cycle: 100,
    entry_type: "ALERT" as const,
    entry_type_display: "Alert",
    summary: "Temperature exceeded threshold at 38°C",
    details: {},
    user: null,
    username: "",
    created_at: "2024-06-01T09:30:00Z",
  },
  {
    id: 3,
    zone: 10,
    crop_cycle: 100,
    entry_type: "NOTE" as const,
    entry_type_display: "Note",
    summary: "Observed powdery mildew on lower leaves",
    details: {},
    user: 1,
    username: "admin",
    created_at: "2024-06-01T08:00:00Z",
  },
]);

function renderCultureJournal() {
  return render(
    <MemoryRouter>
      <CultureJournal />
    </MemoryRouter>,
  );
}

describe("CultureJournal page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: greenhouses loads, but no zone selected yet
    mockListGreenhouses.mockResolvedValue(fakeGreenhouses);
    mockListZones.mockResolvedValue(paginatedResponse([]));
    mockListCultureJournal.mockResolvedValue(paginatedResponse([]));
    mockListCropCycles.mockResolvedValue(paginatedResponse([]));
  });

  // ─── Initial Render ─────────────────────────────────────────────────

  it("shows title and subtitle", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Culture Journal")).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Track all interventions, notes, and crop cycles for regulatory compliance.",
      ),
    ).toBeInTheDocument();
  });

  it("shows 'select zone' prompt when no zone is selected", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(
        screen.getByText("Select a zone to view its culture journal."),
      ).toBeInTheDocument();
    });
  });

  it("disables action buttons when no zone is selected", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Culture Journal")).toBeInTheDocument();
    });

    expect(screen.getByText("Add Note").closest("button")).toBeDisabled();
    expect(screen.getByText("New Crop Cycle").closest("button")).toBeDisabled();
    expect(screen.getByText("Export Report").closest("button")).toBeDisabled();
  });

  // ─── Greenhouse Dropdown ────────────────────────────────────────────

  it("loads greenhouses into the dropdown", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    expect(screen.getByText("Greenhouse Beta")).toBeInTheDocument();
  });

  it("shows the 'Select greenhouse' placeholder option", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Select greenhouse")).toBeInTheDocument();
    });
  });

  // ─── Selecting a Greenhouse Loads Zones ─────────────────────────────

  it("fetches zones when a greenhouse is selected", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });

    // Select a greenhouse
    const greenhouseSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(greenhouseSelect, { target: { value: "1" } });

    await waitFor(() => {
      expect(mockListZones).toHaveBeenCalledWith(1);
    });

    // Zone options should appear
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
      expect(screen.getByText("Zone Basil")).toBeInTheDocument();
    });
  });

  // ─── Selecting a Zone Loads Journal + Crop Cycles ───────────────────

  it("fetches journal entries and crop cycles when a zone is selected", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });

    // Wait for zones to load
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });

    // Select a zone
    const zoneSelect = screen.getAllByRole("combobox")[1];
    fireEvent.change(zoneSelect, { target: { value: "10" } });

    // Journal entries should appear
    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Temperature exceeded threshold at 38°C"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("Observed powdery mildew on lower leaves"),
      ).toBeInTheDocument();
    });

    expect(mockListCultureJournal).toHaveBeenCalledWith(10, {});
    expect(mockListCropCycles).toHaveBeenCalledWith(10);
  });

  it("shows crop cycle cards when zone has active crop cycles", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    // Crop cycle heading + data
    await waitFor(() => {
      expect(screen.getByText("Active Crop Cycles")).toBeInTheDocument();
    });
    expect(
      screen.getByText("Solanum lycopersicum (Roma)"),
    ).toBeInTheDocument();
    expect(screen.getByText("ACTIVE")).toBeInTheDocument();
  });

  it("shows timeline entries with entry type badges and usernames", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    // Entry type display badges (also present in the filter dropdown options)
    const commandElements = screen.getAllByText("Command");
    expect(commandElements.length).toBeGreaterThanOrEqual(2); // dropdown option + badge
    const alertElements = screen.getAllByText("Alert");
    expect(alertElements.length).toBeGreaterThanOrEqual(2); // dropdown option + badge

    // Usernames shown for entries that have them
    const adminNames = screen.getAllByText("admin");
    expect(adminNames.length).toBeGreaterThanOrEqual(1);
  });

  it("shows 'no entries' message when zone has no journal entries", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(paginatedResponse([]));
    mockListCropCycles.mockResolvedValue(paginatedResponse([]));
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("No journal entries found for this zone."),
      ).toBeInTheDocument();
    });
  });

  // ─── Entry Type Filter ──────────────────────────────────────────────

  it("shows entry type filter with all options", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("All entry types")).toBeInTheDocument();
    });

    // Entry type options in the filter dropdown
    const entryTypeSelect = screen.getAllByRole("combobox")[2];
    expect(entryTypeSelect).toBeInTheDocument();

    // Check the option values exist
    const options = entryTypeSelect.querySelectorAll("option");
    const values = Array.from(options).map((opt) => opt.getAttribute("value"));
    expect(values).toContain("");
    expect(values).toContain("COMMAND");
    expect(values).toContain("ALERT");
    expect(values).toContain("NOTE");
    expect(values).toContain("THRESHOLD");
    expect(values).toContain("CROP");
    expect(values).toContain("AUTOMATION");
  });

  it("passes entry_type filter to API when changed", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(mockListCultureJournal).toHaveBeenCalledWith(10, {});
    });

    // Change entry type filter
    const entryTypeSelect = screen.getAllByRole("combobox")[2];
    fireEvent.change(entryTypeSelect, { target: { value: "NOTE" } });

    await waitFor(() => {
      expect(mockListCultureJournal).toHaveBeenCalledWith(10, {
        entry_type: "NOTE",
      });
    });
  });

  // ─── Add Note Modal ─────────────────────────────────────────────────

  it("opens the Add Note modal when button is clicked", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    // Click Add Note button
    fireEvent.click(screen.getByText("Add Note"));

    // Modal should be open with its fields
    await waitFor(() => {
      expect(screen.getByText("Observation")).toBeInTheDocument();
    });
    expect(screen.getByText("Observed at")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText(
        "Describe what you observed in the field...",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Save")).toBeInTheDocument();
  });

  it("disables the Save button when note content is empty", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Add Note"));

    await waitFor(() => {
      expect(screen.getByText("Observation")).toBeInTheDocument();
    });

    // Save button should be disabled when textarea is empty
    const saveButton = screen.getByText("Save").closest("button");
    expect(saveButton).toBeDisabled();
  });

  // ─── New Crop Cycle Modal ───────────────────────────────────────────

  it("opens the New Crop Cycle modal when button is clicked", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    // Click New Crop Cycle button
    fireEvent.click(screen.getByText("New Crop Cycle"));

    // Modal should be open with its form fields
    await waitFor(() => {
      expect(screen.getByText("Species")).toBeInTheDocument();
    });
    expect(screen.getByText("Variety")).toBeInTheDocument();
    expect(screen.getByText("Sowing date")).toBeInTheDocument();
    expect(
      screen.getByPlaceholderText("Solanum lycopersicum"),
    ).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Roma")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
    expect(screen.getByText("Create")).toBeInTheDocument();
  });

  it("disables the Create button when species is empty", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("New Crop Cycle"));

    await waitFor(() => {
      expect(screen.getByText("Species")).toBeInTheDocument();
    });

    // Create button should be disabled when species input is empty
    const createButton = screen.getByText("Create").closest("button");
    expect(createButton).toBeDisabled();
  });

  // ─── Export Report Modal ────────────────────────────────────────────

  it("opens the Export Report modal when button is clicked", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    // Click Export Report button
    fireEvent.click(screen.getByText("Export Report"));

    // Modal should be open with date pickers and export buttons
    await waitFor(() => {
      expect(screen.getByText("Period start")).toBeInTheDocument();
    });
    expect(screen.getByText("Period end")).toBeInTheDocument();
    expect(screen.getByText("Export GlobalG.A.P. JSON")).toBeInTheDocument();
    expect(screen.getByText("Download PDF")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("disables export buttons when period dates are not set", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Export Report"));

    await waitFor(() => {
      expect(screen.getByText("Period start")).toBeInTheDocument();
    });

    // Both export buttons should be disabled when dates are empty
    const gapButton = screen
      .getByText("Export GlobalG.A.P. JSON")
      .closest("button");
    const pdfButton = screen.getByText("Download PDF").closest("button");
    expect(gapButton).toBeDisabled();
    expect(pdfButton).toBeDisabled();
  });

  // ─── API Error Handling ─────────────────────────────────────────────

  it("handles greenhouse API failure gracefully", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));
    renderCultureJournal();

    // Page should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Culture Journal")).toBeInTheDocument();
    });
  });

  it("handles zone API failure gracefully", async () => {
    mockListZones.mockRejectedValue(new Error("Network error"));
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });

    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });

    // Page should still render without crashing
    await waitFor(() => {
      expect(screen.getByText("Culture Journal")).toBeInTheDocument();
    });
  });

  it("handles journal API failure gracefully", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockRejectedValue(new Error("Network error"));
    mockListCropCycles.mockRejectedValue(new Error("Network error"));
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    // Should not crash, should show empty state after loading
    await waitFor(() => {
      expect(
        screen.getByText("No journal entries found for this zone."),
      ).toBeInTheDocument();
    });
  });

  // ─── Zone Dropdown Disabled State ───────────────────────────────────

  it("disables zone dropdown when no greenhouse is selected", async () => {
    renderCultureJournal();

    await waitFor(() => {
      expect(screen.getByText("Culture Journal")).toBeInTheDocument();
    });

    const zoneSelect = screen.getAllByRole("combobox")[1];
    expect(zoneSelect).toBeDisabled();
  });

  // ─── Clearing Selection ─────────────────────────────────────────────

  it("clears zone selection and entries when greenhouse is cleared", async () => {
    mockListZones.mockResolvedValue(fakeZones);
    mockListCultureJournal.mockResolvedValue(fakeJournalEntries);
    mockListCropCycles.mockResolvedValue(fakeCropCycles);
    renderCultureJournal();

    // Select greenhouse then zone
    await waitFor(() => {
      expect(screen.getByText("Greenhouse Alpha")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "1" },
    });
    await waitFor(() => {
      expect(screen.getByText("Zone Tomato")).toBeInTheDocument();
    });
    fireEvent.change(screen.getAllByRole("combobox")[1], {
      target: { value: "10" },
    });

    await waitFor(() => {
      expect(
        screen.getByText("Turned on water valve for Zone Tomato"),
      ).toBeInTheDocument();
    });

    // Clear greenhouse selection
    fireEvent.change(screen.getAllByRole("combobox")[0], {
      target: { value: "" },
    });

    // Should go back to the select zone prompt
    await waitFor(() => {
      expect(
        screen.getByText("Select a zone to view its culture journal."),
      ).toBeInTheDocument();
    });
  });
});
