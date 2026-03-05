/**
 * Tests for the Billing page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Billing from "./Billing";
import type { BillingOverview } from "@/types";

// Mock API
vi.mock("@/api/billing", () => ({
  getBillingOverview: vi.fn(),
  createCheckoutSession: vi.fn(),
  createCustomerPortal: vi.fn(),
}));

// Mock auth store
vi.mock("@/stores/authStore", () => ({
  useAuthStore: vi.fn((selector) =>
    selector({
      currentOrganization: { slug: "test-org", plan: "FREE" },
      isAuthenticated: true,
      isLoading: false,
      user: { id: 1, username: "testuser" },
      organizations: [],
    }),
  ),
}));

import { getBillingOverview, createCheckoutSession, createCustomerPortal } from "@/api/billing";

const mockedGetOverview = vi.mocked(getBillingOverview);
const mockedCreateCheckout = vi.mocked(createCheckoutSession);
// createCustomerPortal is mocked via vi.mock above; direct reference only needed when tested
vi.mocked(createCustomerPortal);

const freeOverview: BillingOverview = {
  plan: "FREE",
  is_on_trial: false,
  trial_ends_at: null,
  trial_expired: false,
  subscription: null,
  usage: {
    greenhouses: 2,
    max_greenhouses: 3,
    zones: 3,
    max_zones: 5,
    members: 1,
    max_members: 3,
  },
  stripe_publishable_key: "pk_test_123",
};

const trialOverview: BillingOverview = {
  ...freeOverview,
  is_on_trial: true,
  trial_ends_at: new Date(Date.now() + 7 * 86400000).toISOString(),
};

const trialExpiredOverview: BillingOverview = {
  ...freeOverview,
  trial_expired: true,
};

const proOverview: BillingOverview = {
  plan: "PRO",
  is_on_trial: false,
  trial_ends_at: null,
  trial_expired: false,
  subscription: {
    id: 1,
    organization: 1,
    stripe_subscription_id: "sub_123",
    stripe_price_id: "price_pro",
    plan: "PRO",
    status: "ACTIVE",
    current_period_start: "2024-01-01T00:00:00Z",
    current_period_end: "2024-02-01T00:00:00Z",
    cancel_at_period_end: false,
    canceled_at: null,
    is_active: true,
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-01T00:00:00Z",
  },
  usage: {
    greenhouses: 5,
    max_greenhouses: 20,
    zones: 10,
    max_zones: 50,
    members: 5,
    max_members: 20,
  },
  stripe_publishable_key: "pk_test_123",
};

function renderBilling() {
  return render(
    <MemoryRouter>
      <Billing />
    </MemoryRouter>,
  );
}

describe("Billing page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockedGetOverview.mockReturnValue(new Promise(() => {}));
    renderBilling();
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders plan cards for FREE user", async () => {
    mockedGetOverview.mockResolvedValue({ data: freeOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText("FREE")).toBeInTheDocument();
    });

    expect(screen.getByText("PRO")).toBeInTheDocument();
    expect(screen.getByText("ENTERPRISE")).toBeInTheDocument();
  });

  it("shows usage bars with correct values", async () => {
    mockedGetOverview.mockResolvedValue({ data: freeOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
      expect(screen.getByText("3 / 5")).toBeInTheDocument();
      expect(screen.getByText("1 / 3")).toBeInTheDocument();
    });
  });

  it("shows trial active banner", async () => {
    mockedGetOverview.mockResolvedValue({ data: trialOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText(/free trial ends in/i)).toBeInTheDocument();
    });
  });

  it("shows trial expired banner", async () => {
    mockedGetOverview.mockResolvedValue({ data: trialExpiredOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText(/trial has expired/i)).toBeInTheDocument();
    });
  });

  it("shows subscription details for PRO user", async () => {
    mockedGetOverview.mockResolvedValue({ data: proOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText("ACTIVE")).toBeInTheDocument();
    });

    expect(screen.getByText(/Manage Billing/i)).toBeInTheDocument();
  });

  it("calls createCheckoutSession when clicking upgrade", async () => {
    mockedGetOverview.mockResolvedValue({ data: freeOverview } as any);
    mockedCreateCheckout.mockResolvedValue({ data: { checkout_url: "https://checkout.stripe.com/test" } } as any);

    // Mock window.location.href setter
    const hrefSetter = vi.fn();
    Object.defineProperty(window, "location", {
      value: { href: "" },
      writable: true,
    });
    Object.defineProperty(window.location, "href", {
      set: hrefSetter,
    });

    renderBilling();

    await waitFor(() => {
      expect(screen.getByText("FREE")).toBeInTheDocument();
    });

    // Find upgrade buttons (PRO and ENTERPRISE)
    const upgradeButtons = screen.getAllByText(/Upgrade/i);
    expect(upgradeButtons.length).toBeGreaterThanOrEqual(1);

    fireEvent.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(mockedCreateCheckout).toHaveBeenCalledWith("test-org", "PRO");
    });
  });

  it("handles load error", async () => {
    mockedGetOverview.mockRejectedValue(new Error("Network error"));
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText(/Failed to load billing/i)).toBeInTheDocument();
    });
  });

  it("marks current plan card with badge", async () => {
    mockedGetOverview.mockResolvedValue({ data: proOverview } as any);
    renderBilling();

    await waitFor(() => {
      expect(screen.getByText("Current")).toBeInTheDocument();
    });
  });
});
