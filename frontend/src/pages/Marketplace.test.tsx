/**
 * Tests for the Marketplace page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Marketplace from "./Marketplace";
import type { Template } from "@/types";

// Mock API modules
vi.mock("@/api/templates", () => ({
  listTemplates: vi.fn(),
  listCategories: vi.fn(),
  cloneTemplate: vi.fn(),
  rateTemplate: vi.fn(),
}));

vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));

vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));

import { listTemplates, listCategories } from "@/api/templates";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";

const mockedListTemplates = vi.mocked(listTemplates);
const mockedListCategories = vi.mocked(listCategories);
const mockedListGreenhouses = vi.mocked(listGreenhouses);
const mockedListZones = vi.mocked(listZones);

const fakeCategory = {
  id: 1,
  name: "Vegetables",
  slug: "vegetables",
  description: "Veggie templates",
  icon: "leaf",
  order: 1,
  template_count: 2,
};

const fakeTemplate = {
  id: 10,
  organization: 1,
  organization_name: "TestOrg",
  category: 1,
  category_name: "Vegetables",
  name: "Tomato Greenhouse",
  description: "Complete setup for tomato cultivation.",
  is_official: true,
  is_published: true,
  version: "1.0.0",
  changelog: "Initial release.",
  config: {
    sensors: [
      { sensor_type: "TEMP", label: "Air Temperature", unit: "°C", min_threshold: 15, max_threshold: 32 },
      { sensor_type: "HUM_AIR", label: "Air Humidity", unit: "%", min_threshold: 50, max_threshold: 80 },
    ],
    actuators: [
      { actuator_type: "VALVE", name: "Drip Valve", gpio_pin: 4 },
    ],
    automation_rules: [
      {
        name: "Low moisture",
        description: "Water when dry",
        sensor_type: "HUM_AIR",
        condition: "LT",
        threshold_value: 50,
        action_actuator_name: "Drip Valve",
        action_actuator_type: "VALVE",
        action_command_type: "ON",
        action_value: null,
        cooldown_seconds: 600,
      },
    ],
    scenarios: [
      {
        name: "Morning Watering",
        description: "20 min cycle",
        steps: [
          { order: 0, action: "ON", action_value: null, delay_seconds: 0, duration_seconds: 1200, actuator_name: "Drip Valve", actuator_type: "VALVE" },
        ],
      },
    ],
  },
  avg_rating: 4.5,
  rating_count: 12,
  clone_count: 35,
  created_by: 1,
  created_by_username: "admin",
  created_at: "2024-06-01T00:00:00Z",
  updated_at: "2024-06-01T00:00:00Z",
  user_rating: null,
} as unknown as Template;

const fakeGreenhouse = {
  id: 1,
  name: "GH1",
  location: "Rooftop",
  description: "",
  is_active: true,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  zone_count: 1,
  organization: 1,
};

const fakeZone = {
  id: 100,
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
};

function paginatedResponse<T>(results: T[]) {
  return { count: results.length, next: null, previous: null, results };
}

function setupDefaultMocks() {
  mockedListCategories.mockResolvedValue(paginatedResponse([fakeCategory]));
  mockedListGreenhouses.mockResolvedValue(paginatedResponse([fakeGreenhouse]));
  mockedListZones.mockResolvedValue(paginatedResponse([fakeZone]));
  mockedListTemplates.mockResolvedValue(paginatedResponse([fakeTemplate]));
}

function renderMarketplace() {
  return render(
    <MemoryRouter>
      <Marketplace />
    </MemoryRouter>,
  );
}

describe("Marketplace page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockedListTemplates.mockReturnValue(new Promise(() => {}));
    mockedListCategories.mockResolvedValue(paginatedResponse([]));
    mockedListGreenhouses.mockResolvedValue(paginatedResponse([]));
    renderMarketplace();
    expect(document.querySelector("span.loading")).toBeInTheDocument();
  });

  it("shows empty state when no templates", async () => {
    mockedListTemplates.mockResolvedValue(paginatedResponse([]));
    mockedListCategories.mockResolvedValue(paginatedResponse([]));
    mockedListGreenhouses.mockResolvedValue(paginatedResponse([]));
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("No templates found.")).toBeInTheDocument();
    });
  });

  it("renders template cards with name, description, and badges", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    expect(screen.getByText("Complete setup for tomato cultivation.")).toBeInTheDocument();
    expect(screen.getByText("Official")).toBeInTheDocument();
    expect(screen.getByText("v1.0.0")).toBeInTheDocument();
    expect(screen.getByText("(12)")).toBeInTheDocument();
    expect(screen.getByText("35")).toBeInTheDocument();
  });

  it("renders config summary counts on template cards", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    // Config summary uses tp() for labels — check the actual rendered text
    expect(screen.getByText(/2\s+Sensors/)).toBeInTheDocument();
    expect(screen.getByText(/1\s+Actuators/)).toBeInTheDocument();
    expect(screen.getByText(/1\s+Rules/)).toBeInTheDocument();
    expect(screen.getByText(/1\s+Scenarios/)).toBeInTheDocument();
  });

  it("renders filter bar with category and official checkbox", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    expect(screen.getByText("All categories")).toBeInTheDocument();
    expect(screen.getByText("Official only")).toBeInTheDocument();
  });

  it("opens detail modal when clicking a template card", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tomato Greenhouse"));

    // Modal should show config detail tab by default
    await waitFor(() => {
      expect(screen.getByText("Air Temperature")).toBeInTheDocument();
      expect(screen.getByText("Drip Valve")).toBeInTheDocument();
    });
  });

  it("shows automation rules and scenarios in config tab", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tomato Greenhouse"));

    await waitFor(() => {
      expect(screen.getByText(/Low moisture/)).toBeInTheDocument();
      expect(screen.getByText("Morning Watering")).toBeInTheDocument();
    });
  });

  it("shows rating tab content after switching", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tomato Greenhouse"));

    // Wait for modal to open, then switch to Rating tab
    await waitFor(() => {
      expect(screen.getByText("Rating")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Rating"));

    // Should show avg rating
    expect(screen.getByText("4.5")).toBeInTheDocument();
    expect(screen.getByText("Your Rating")).toBeInTheDocument();
  });

  it("shows import tab with zone selector and mode toggle", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Tomato Greenhouse"));

    // Wait for modal to open, then switch to Import tab
    await waitFor(() => {
      expect(screen.getByText("Import")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Import"));

    expect(screen.getByText("Target Zone")).toBeInTheDocument();
    expect(screen.getByText("Merge")).toBeInTheDocument();
    expect(screen.getByText("Replace")).toBeInTheDocument();
    expect(screen.getByText("Import Template")).toBeInTheDocument();
  });

  it("calls listTemplates on load", async () => {
    setupDefaultMocks();
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("Tomato Greenhouse")).toBeInTheDocument();
    });

    expect(mockedListTemplates).toHaveBeenCalled();
  });

  it("handles API error gracefully without crashing", async () => {
    mockedListTemplates.mockRejectedValue(new Error("Network error"));
    mockedListCategories.mockResolvedValue(paginatedResponse([]));
    mockedListGreenhouses.mockResolvedValue(paginatedResponse([]));
    renderMarketplace();

    await waitFor(() => {
      expect(screen.getByText("No templates found.")).toBeInTheDocument();
    });
  });
});
