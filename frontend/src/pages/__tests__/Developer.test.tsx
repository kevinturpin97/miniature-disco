/**
 * Tests for the Developer Platform page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Developer from "../Developer";

vi.mock("@/api/developer", () => ({
  listAPIKeys: vi.fn(),
  createAPIKey: vi.fn(),
  revokeAPIKey: vi.fn(),
  deleteAPIKey: vi.fn(),
  listWebhooks: vi.fn(),
  createWebhook: vi.fn(),
  updateWebhook: vi.fn(),
  deleteWebhook: vi.fn(),
  listWebhookDeliveries: vi.fn(),
  getSandboxInfo: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("react-hot-toast", () => ({
  default: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: () => <svg data-testid="spinner" className="animate-spin" />,
}));

vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "2 days ago",
}));

import * as devApi from "@/api/developer";
import { useAuthStore } from "@/stores/authStore";

const mockListAPIKeys = vi.mocked(devApi.listAPIKeys);
const mockListWebhooks = vi.mocked(devApi.listWebhooks);
const mockGetSandboxInfo = vi.mocked(devApi.getSandboxInfo);
const mockUseAuthStore = vi.mocked(useAuthStore);

const fakeOrg = {
  id: 1, name: "Acme Farm", slug: "acme-farm", plan: "PRO",
  max_greenhouses: 10, max_zones: 50, greenhouse_count: 2, member_count: 2,
  is_on_trial: false, trial_expired: false, my_role: "OWNER" as const,
};

const fakeApiKey = {
  id: 1,
  name: "My Key",
  prefix: "ghk_abc123",
  scope: "READ" as const,
  is_revoked: false,
  created_at: "2024-01-01T00:00:00Z",
  expires_at: null,
  last_used_at: null,
};

function renderDeveloper(org = fakeOrg) {
  mockUseAuthStore.mockImplementation((selector) =>
    selector({ currentOrganization: org }),
  );
  return render(
    <MemoryRouter>
      <Developer />
    </MemoryRouter>,
  );
}

describe("Developer page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListAPIKeys.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } });
    mockListWebhooks.mockResolvedValue({ data: { count: 0, next: null, previous: null, results: [] } });
    mockGetSandboxInfo.mockResolvedValue({ org_slug: "sandbox", is_sandbox: true, base_url: "https://api.example.com" });
  });

  it("shows loading spinner initially", () => {
    mockListAPIKeys.mockReturnValue(new Promise(() => {}));
    renderDeveloper();
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders API Keys, Webhooks, Sandbox tabs", async () => {
    renderDeveloper();
    await waitFor(() => {
      const tabs = screen.getAllByRole("tab");
      expect(tabs.length).toBe(3);
    });
    const tabs = screen.getAllByRole("tab");
    expect(tabs[0].textContent).toMatch(/api keys/i);
    expect(tabs[1].textContent).toMatch(/webhooks/i);
    expect(tabs[2].textContent).toMatch(/sandbox/i);
  });

  it("shows API key name in the list", async () => {
    mockListAPIKeys.mockResolvedValue({
      data: { count: 1, next: null, previous: null, results: [fakeApiKey] },
    });
    renderDeveloper();
    await waitFor(() => {
      expect(screen.getByText("My Key")).toBeInTheDocument();
    });
    expect(screen.getByText((content) => content.startsWith("ghk_abc123"))).toBeInTheDocument();
  });

  it("switches to Webhooks tab without crashing", async () => {
    renderDeveloper();
    await waitFor(() => {
      expect(screen.getAllByRole("tab").length).toBe(3);
    });
    fireEvent.click(screen.getAllByRole("tab")[1]);
    expect(screen.getAllByRole("tab")[1]).toBeInTheDocument();
  });

  it("switches to Sandbox tab and loads sandbox info", async () => {
    renderDeveloper();
    await waitFor(() => {
      expect(screen.getAllByRole("tab").length).toBe(3);
    });
    fireEvent.click(screen.getAllByRole("tab")[2]);
    await waitFor(() => {
      expect(mockGetSandboxInfo).toHaveBeenCalled();
    });
  });

  it("renders gracefully when no org", () => {
    mockUseAuthStore.mockImplementation((selector) =>
      selector({ currentOrganization: null }),
    );
    render(
      <MemoryRouter>
        <Developer />
      </MemoryRouter>,
    );
    expect(screen.queryByText("My Key")).not.toBeInTheDocument();
  });
});
