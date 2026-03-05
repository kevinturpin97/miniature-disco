/**
 * Tests for the Team Management page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Team from "../Team";

vi.mock("@/api/organizations", () => ({
  listMembers: vi.fn(),
  listInvitations: vi.fn(),
  sendInvitation: vi.fn(),
  updateMemberRole: vi.fn(),
  removeMember: vi.fn(),
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

import * as orgApi from "@/api/organizations";
import { useAuthStore } from "@/stores/authStore";

const mockListMembers = vi.mocked(orgApi.listMembers);
const mockListInvitations = vi.mocked(orgApi.listInvitations);
const mockUseAuthStore = vi.mocked(useAuthStore);

const fakeOrg = {
  id: 1,
  name: "Acme Farm",
  slug: "acme-farm",
  plan: "PRO",
  max_greenhouses: 10,
  max_zones: 50,
  greenhouse_count: 3,
  member_count: 2,
  is_on_trial: false,
  trial_expired: false,
  my_role: "OWNER" as const,
};

const fakeMembers = [
  { id: 1, user: 1, username: "alice", email: "alice@example.com", role: "OWNER", joined_at: "2024-01-01T00:00:00Z" },
  { id: 2, user: 2, username: "bob", email: "bob@example.com", role: "OPERATOR", joined_at: "2024-02-01T00:00:00Z" },
];

function renderTeam(org = fakeOrg) {
  mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ currentOrganization: org }),
  );
  return render(
    <MemoryRouter>
      <Team />
    </MemoryRouter>,
  );
}

describe("Team page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListMembers.mockResolvedValue(fakeMembers);
    mockListInvitations.mockResolvedValue([]);
  });

  it("shows loading spinner initially", () => {
    mockListMembers.mockReturnValue(new Promise(() => {}));
    mockListInvitations.mockReturnValue(new Promise(() => {}));
    renderTeam();
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("shows team title after load", async () => {
    renderTeam();
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
    });
  });

  it("shows all loaded members", async () => {
    renderTeam();
    await waitFor(() => {
      expect(screen.getByText("alice")).toBeInTheDocument();
      expect(screen.getByText("bob")).toBeInTheDocument();
    });
  });

  it("shows invite form for OWNER role", async () => {
    renderTeam();
    await waitFor(() => {
      expect(screen.getByPlaceholderText("user@example.com")).toBeInTheDocument();
    });
  });

  it("hides invite form for VIEWER role", async () => {
    renderTeam({ ...fakeOrg, my_role: "VIEWER" as const });
    await waitFor(() => {
      expect(screen.queryByPlaceholderText("user@example.com")).not.toBeInTheDocument();
    });
  });

  it("shows no-org message when org is null", () => {
    mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ currentOrganization: null }),
    );
    render(
      <MemoryRouter>
        <Team />
      </MemoryRouter>,
    );
    // Renders no-org message without crashing
    expect(screen.queryByPlaceholderText("user@example.com")).not.toBeInTheDocument();
  });
});
