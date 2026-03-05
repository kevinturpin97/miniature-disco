/**
 * Tests for the AcceptInvitation page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AcceptInvitation from "../AcceptInvitation";

vi.mock("@/api/organizations", () => ({
  acceptInvitation: vi.fn(),
}));

vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn(),
}));

vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <svg data-testid="spinner" className={className} />
  ),
}));

import * as orgApi from "@/api/organizations";
import { useAuthStore } from "@/stores/authStore";

const mockAcceptInvitation = vi.mocked(orgApi.acceptInvitation);
const mockUseAuthStore = vi.mocked(useAuthStore);

const mockFetchOrganizations = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useParams: () => ({ token: "test-token-123" }),
  };
});

function renderAcceptInvitation(authenticated = true) {
  mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({
      isAuthenticated: authenticated,
      fetchOrganizations: mockFetchOrganizations,
    }),
  );
  return render(
    <MemoryRouter initialEntries={["/invite/test-token-123"]}>
      <Routes>
        <Route path="/invite/:token" element={<AcceptInvitation />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AcceptInvitation page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFetchOrganizations.mockResolvedValue(undefined);
  });

  it("shows login prompt when not authenticated", () => {
    renderAcceptInvitation(false);
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("shows loading spinner while processing", () => {
    mockAcceptInvitation.mockReturnValue(new Promise(() => {}));
    renderAcceptInvitation(true);
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows success state after accepting invitation", async () => {
    mockAcceptInvitation.mockResolvedValue({ detail: "You have joined Acme Farm." });
    renderAcceptInvitation(true);

    await waitFor(() => {
      expect(screen.getByText("You have joined Acme Farm.")).toBeInTheDocument();
    });
    expect(mockFetchOrganizations).toHaveBeenCalled();
  });

  it("shows error state on API failure", async () => {
    mockAcceptInvitation.mockRejectedValue(new Error("Token expired"));
    renderAcceptInvitation(true);

    await waitFor(() => {
      // Error message rendered (from i18n key team.inviteError)
      expect(screen.getByRole("button")).toBeInTheDocument();
    });
  });

  it("navigates to login when login button is clicked while unauthenticated", async () => {
    renderAcceptInvitation(false);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    expect(mockNavigate).toHaveBeenCalledWith("/login");
  });
});
