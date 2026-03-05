/**
 * Tests for the Analytics page.
 * Note: The page loads all greenhouses+zones at startup using optgroups.
 * Greenhouse names appear as optgroup labels (attributes), not visible text.
 * Zones are auto-selected when loaded.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analytics from "../Analytics";

vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
}));

vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
}));

vi.mock("@/api/analytics", () => ({
  getZoneAnalytics: vi.fn(),
  getZoneReportPdf: vi.fn(),
  getOrgAnalyticsSummary: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <svg data-testid="spinner" className="animate-spin" />,
}));

// Recharts renders SVG which JSDOM can't fully handle — stub it
vi.mock("recharts", () => ({
  LineChart: ({ children }) => <div data-testid="line-chart">{children}</div>,
  Line: () => null,
  XAxis: () => null,
  YAxis: () => null,
  CartesianGrid: () => null,
  Tooltip: () => null,
  ResponsiveContainer: ({ children }) => <div>{children}</div>,
  Legend: () => null,
  ScatterChart: ({ children }) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => null,
}));

import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { getZoneAnalytics, getOrgAnalyticsSummary } from "@/api/analytics";
import { useAuthStore } from "@/stores/authStore";

const mockListGreenhouses = vi.mocked(listGreenhouses);
const mockListZones = vi.mocked(listZones);
const mockGetZoneAnalytics = vi.mocked(getZoneAnalytics);
const mockGetOrgAnalyticsSummary = vi.mocked(getOrgAnalyticsSummary);
const mockUseAuthStore = vi.mocked(useAuthStore);

function paginated(results) {
  return { count: results.length, next: null, previous: null, results };
}

const fakeOrg = {
  id: 1, name: "Acme Farm", slug: "acme-farm", plan: "PRO",
  max_greenhouses: 10, max_zones: 50, greenhouse_count: 2, member_count: 2,
  is_on_trial: false, trial_expired: false, my_role: "OWNER",
};

const fakeGreenhouses = paginated([
  { id: 1, name: "Greenhouse A", location: "", description: "", is_active: true, zone_count: 1, created_at: "", updated_at: "", organization: 1 },
]);

const fakeZones = paginated([
  { id: 10, greenhouse: 1, name: "Zone Alpha", relay_id: 1, description: "", is_active: true, is_online: true, last_seen: null, transmission_interval: 300, created_at: "", updated_at: "" },
]);

const fakeAnalytics = {
  zone_id: 10,
  zone_name: "Zone Alpha",
  period_days: 7,
  sensors: [
    {
      sensor_type: "TEMP",
      label: "Temperature",
      unit: "°C",
      min: 18.0, max: 32.0, avg: 24.5, std_dev: 2.1,
      trend: "stable",
      daily_data: [],
      daily_averages: [],
    },
  ],
};

function renderAnalytics() {
  mockUseAuthStore.mockImplementation((selector) =>
    selector({ currentOrganization: fakeOrg }),
  );
  return render(
    <MemoryRouter>
      <Analytics />
    </MemoryRouter>,
  );
}

describe("Analytics page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListGreenhouses.mockResolvedValue(fakeGreenhouses);
    mockListZones.mockResolvedValue(fakeZones);
    mockGetZoneAnalytics.mockResolvedValue(fakeAnalytics);
    mockGetOrgAnalyticsSummary.mockResolvedValue({ org_slug: "acme-farm", zones: [] });
  });

  it("renders zone select option after loading", async () => {
    renderAnalytics();
    // Zone names appear as <option> elements — check the select contains it
    await waitFor(() => {
      expect(screen.getByText("Zone Alpha")).toBeInTheDocument();
    });
  });

  it("auto-selects first zone and calls getZoneAnalytics on load", async () => {
    renderAnalytics();
    await waitFor(() => {
      expect(mockGetZoneAnalytics).toHaveBeenCalledWith(10, 7);
    });
  });

  it("shows sensor stats once analytics are loaded", async () => {
    renderAnalytics();
    await waitFor(() => {
      // Sensor label shown in the analytics stats
      expect(screen.getByText(/Temperature/)).toBeInTheDocument();
    });
  });

  it("calls getOrgAnalyticsSummary when org is loaded", async () => {
    renderAnalytics();
    await waitFor(() => {
      expect(mockGetOrgAnalyticsSummary).toHaveBeenCalledWith("acme-farm");
    });
  });

  it("handles API failure gracefully without crashing", async () => {
    mockListGreenhouses.mockRejectedValue(new Error("Network error"));
    renderAnalytics();
    await waitFor(() => {
      expect(document.querySelector("svg.animate-spin")).not.toBeInTheDocument();
    });
  });
});
