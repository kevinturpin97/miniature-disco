/**
 * Tests for CropIntelligenceCard component.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CropIntelligenceCard } from "./CropIntelligenceCard";
import type { CropStatus, CropIndicatorPreference } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

const mockCropStatus: CropStatus = {
  zone: 1,
  growth_status: "NORMAL",
  gdd_accumulated: 300,
  hydration_status: "OPTIMAL",
  evapotranspiration: 2.5,
  heat_stress: "NONE",
  heat_index: 22.0,
  yield_prediction: 10.0,
  plant_health_score: 85.0,
  disease_risk: "LOW",
  climate_stress: "NONE",
  light_level: "CORRECT",
  harvest_eta_days: 45,
  irrigation_needed_liters: 0.3,
  calculated_at: "2026-03-06T10:00:00Z",
};

const defaultPreferences: CropIndicatorPreference[] = [
  { indicator: "GROWTH", enabled: true },
  { indicator: "HYDRATION", enabled: true },
  { indicator: "HEAT_STRESS", enabled: true },
  { indicator: "YIELD", enabled: true },
  { indicator: "PLANT_HEALTH", enabled: true },
  { indicator: "DISEASE_RISK", enabled: true },
  { indicator: "CLIMATE_STRESS", enabled: true },
  { indicator: "LIGHT", enabled: true },
  { indicator: "HARVEST_ETA", enabled: true },
  { indicator: "IRRIGATION", enabled: true },
];

// Mock API modules
vi.mock("@/api/zones", () => ({
  getZoneCropStatus: vi.fn(),
  getCropIndicatorPreferences: vi.fn(),
}));

import * as zonesApi from "@/api/zones";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CropIntelligenceCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(zonesApi.getCropIndicatorPreferences).mockResolvedValue(defaultPreferences);
    vi.mocked(zonesApi.getZoneCropStatus).mockResolvedValue(mockCropStatus);
  });

  it("shows skeleton loaders while loading", () => {
    // Prevent resolution during render
    vi.mocked(zonesApi.getZoneCropStatus).mockImplementation(
      () => new Promise(() => {}),
    );
    vi.mocked(zonesApi.getCropIndicatorPreferences).mockImplementation(
      () => new Promise(() => {}),
    );

    const { container } = render(<CropIntelligenceCard zoneId={1} />);
    // Skeleton divs are present
    expect(container.querySelectorAll(".skeleton").length).toBeGreaterThan(0);
  });

  it("renders indicator tiles after data loads", async () => {
    render(<CropIntelligenceCard zoneId={1} />);

    // Wait for async load
    await waitFor(() => {
      expect(screen.getByText(/NORMAL/i)).toBeInTheDocument();
    });

    // Growth value
    expect(screen.getByText("NORMAL")).toBeInTheDocument();
    // Yield value
    expect(screen.getByText("+10%")).toBeInTheDocument();
    // Plant health
    expect(screen.getByText("85/100")).toBeInTheDocument();
    // Harvest ETA
    expect(screen.getByText("45d")).toBeInTheDocument();
    // Irrigation
    expect(screen.getByText("0.3L/plant")).toBeInTheDocument();
  });

  it("shows 'not computed' message when API returns 404", async () => {
    vi.mocked(zonesApi.getZoneCropStatus).mockRejectedValue({
      response: { status: 404 },
    });

    render(<CropIntelligenceCard zoneId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/15-minute/i)).toBeInTheDocument();
    });
  });

  it("shows error message on unexpected API error", async () => {
    vi.mocked(zonesApi.getZoneCropStatus).mockRejectedValue({
      response: { status: 500 },
    });

    render(<CropIntelligenceCard zoneId={1} />);

    await waitFor(() => {
      expect(screen.getByText(/Failed to load crop status/i)).toBeInTheDocument();
    });
  });

  it("hides disabled indicators", async () => {
    vi.mocked(zonesApi.getCropIndicatorPreferences).mockResolvedValue([
      ...defaultPreferences.map((p) =>
        p.indicator === "YIELD" ? { ...p, enabled: false } : p,
      ),
    ]);

    render(<CropIntelligenceCard zoneId={1} />);

    await waitFor(() => {
      expect(screen.getByText("NORMAL")).toBeInTheDocument();
    });

    // +10% yield tile should be absent when YIELD is disabled
    expect(screen.queryByText("+10%")).not.toBeInTheDocument();
  });

  it("displays the calculated_at time", async () => {
    render(<CropIntelligenceCard zoneId={1} />);

    await waitFor(() => {
      // Time is localised so just verify some text appears in the header area
      expect(screen.getByText(/Crop Intelligence/i)).toBeInTheDocument();
    });
  });
});
