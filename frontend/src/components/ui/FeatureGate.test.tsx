/**
 * Tests for FeatureGate component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FeatureGate } from "./FeatureGate";

// Mock useAppMode to control feature flags
vi.mock("@/hooks/useAppMode", () => ({
  useAppMode: vi.fn(),
}));

import { useAppMode } from "@/hooks/useAppMode";

const mockUseAppMode = useAppMode as ReturnType<typeof vi.fn>;

function makeFeatures(overrides: Partial<Record<string, boolean>> = {}) {
  return {
    loraBridge: false,
    mqtt: false,
    crm: true,
    cloudSync: true,
    billing: true,
    multiTenant: true,
    ...overrides,
  };
}

describe("FeatureGate", () => {
  it("renders children when feature is enabled", () => {
    mockUseAppMode.mockReturnValue({
      isEdgeMode: false,
      isCloudMode: true,
      features: makeFeatures({ billing: true }),
      modeBadge: "Cloud",
    });

    render(
      <FeatureGate feature="billing">
        <span>Billing Panel</span>
      </FeatureGate>
    );

    expect(screen.getByText("Billing Panel")).toBeDefined();
  });

  it("renders nothing when feature is disabled", () => {
    mockUseAppMode.mockReturnValue({
      isEdgeMode: false,
      isCloudMode: true,
      features: makeFeatures({ loraBridge: false }),
      modeBadge: "Cloud",
    });

    const { container } = render(
      <FeatureGate feature="loraBridge">
        <span>LoRa Bridge</span>
      </FeatureGate>
    );

    expect(container.textContent).toBe("");
  });

  it("renders fallback when feature is disabled and fallback provided", () => {
    mockUseAppMode.mockReturnValue({
      isEdgeMode: false,
      isCloudMode: true,
      features: makeFeatures({ loraBridge: false }),
      modeBadge: "Cloud",
    });

    render(
      <FeatureGate feature="loraBridge" fallback={<span>Not available</span>}>
        <span>LoRa Bridge</span>
      </FeatureGate>
    );

    expect(screen.getByText("Not available")).toBeDefined();
    expect(screen.queryByText("LoRa Bridge")).toBeNull();
  });

  it("renders children when loraBridge enabled (edge mode)", () => {
    mockUseAppMode.mockReturnValue({
      isEdgeMode: true,
      isCloudMode: false,
      features: makeFeatures({ loraBridge: true, mqtt: true }),
      modeBadge: "Edge",
    });

    render(
      <FeatureGate feature="loraBridge">
        <span>LoRa Bridge Panel</span>
      </FeatureGate>
    );

    expect(screen.getByText("LoRa Bridge Panel")).toBeDefined();
  });
});
