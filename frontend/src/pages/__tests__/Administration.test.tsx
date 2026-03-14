/**
 * Tests for the Administration hub page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Administration from "../Administration";

vi.mock("@/hooks/useAppMode", () => ({
  useAppMode: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}));

import { useAppMode } from "@/hooks/useAppMode";
import { useAuthStore } from "@/stores/authStore";

const mockUseAppMode = vi.mocked(useAppMode);
const mockUseAuthStore = vi.mocked(useAuthStore);

const cloudFeatures = {
  loraBridge: false,
  mqtt: false,
  multiTenant: true,
  billing: true,
  crm: true,
  cloudSync: true,
  fleet: true,
};

const edgeFeatures = {
  loraBridge: true,
  mqtt: true,
  multiTenant: true,
  billing: false,
  crm: false,
  cloudSync: false,
  fleet: false,
};

const fakeOrg = {
  id: 1,
  name: "Acme Farm",
  slug: "acme-farm",
  plan: "PRO",
  max_greenhouses: 10,
  max_zones: 50,
  greenhouse_count: 3,
  member_count: 5,
  is_on_trial: false,
  trial_expired: false,
  my_role: "OWNER" as const,
};

function renderAdministration() {
  return render(
    <MemoryRouter>
      <Administration />
    </MemoryRouter>,
  );
}

describe("Administration page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAppMode.mockReturnValue({
      isEdgeMode: false,
      isCloudMode: true,
      features: cloudFeatures,
      modeBadge: "Cloud — Remote access",
    });
    // Selector mock: return org when selector is called
    mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ currentOrganization: fakeOrg }),
    );
  });

  it("renders title and subtitle", () => {
    renderAdministration();
    expect(screen.getByText("Administration")).toBeInTheDocument();
  });

  it("shows plan usage with org data", () => {
    renderAdministration();
    expect(screen.getByText("Acme Farm")).toBeInTheDocument();
    expect(screen.getByText("PRO")).toBeInTheDocument();
  });

  it("renders base cards (Settings, Team, Notifications, Developer)", () => {
    renderAdministration();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByText("Team")).toBeInTheDocument();
    expect(screen.getByText("Notifications")).toBeInTheDocument();
    expect(screen.getByText("Developer")).toBeInTheDocument();
  });

  it("shows Billing card in cloud mode", () => {
    renderAdministration();
    expect(screen.getByText("Billing")).toBeInTheDocument();
  });

  it("shows CRM and Sync cards in cloud mode", () => {
    renderAdministration();
    expect(screen.getByText("CRM")).toBeInTheDocument();
    expect(screen.getByText("Sync")).toBeInTheDocument();
  });

  it("does not show Billing/CRM/Sync cards in edge mode", () => {
    mockUseAppMode.mockReturnValue({
      isEdgeMode: true,
      isCloudMode: false,
      features: edgeFeatures,
      modeBadge: "Edge — Main site",
    });
    renderAdministration();
    expect(screen.queryByText("Billing")).not.toBeInTheDocument();
    expect(screen.queryByText("CRM")).not.toBeInTheDocument();
    expect(screen.queryByText("Sync")).not.toBeInTheDocument();
  });

  it("shows greenhouse usage bar when org is loaded", () => {
    renderAdministration();
    expect(screen.getByText("3 / 10")).toBeInTheDocument();
  });

  it("renders gracefully when no org is set", () => {
    mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ currentOrganization: null }),
    );
    renderAdministration();
    // Still shows page title; usage block is hidden
    expect(screen.getByText("Administration")).toBeInTheDocument();
    expect(screen.queryByText("Acme Farm")).not.toBeInTheDocument();
  });
});
