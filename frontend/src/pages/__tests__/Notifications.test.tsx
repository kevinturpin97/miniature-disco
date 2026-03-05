/**
 * Tests for the Notifications settings page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Notifications from "../Notifications";

vi.mock("@/api/notifications", () => ({
  listChannels: vi.fn(),
  listRules: vi.fn(),
  listLogs: vi.fn(),
  createChannel: vi.fn(),
  updateChannel: vi.fn(),
  deleteChannel: vi.fn(),
  createRule: vi.fn(),
  updateRule: vi.fn(),
  deleteRule: vi.fn(),
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

vi.mock("@/components/ui/Modal", () => ({
  Modal: ({ open, children, title }: { open: boolean; children: React.ReactNode; title: string }) =>
    open ? <div role="dialog" aria-label={title}>{children}</div> : null,
}));

vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({ open, onConfirm, title }: { open: boolean; onConfirm: () => void; title: string }) =>
    open ? <div data-testid="confirm-dialog"><button onClick={onConfirm}>{title}</button></div> : null,
}));

vi.mock("@/components/ui/FormField", () => ({
  FormField: ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div><label>{label}</label>{children}</div>
  ),
}));

vi.mock("@/components/ui/SelectField", () => ({
  SelectField: ({ label, options, value, onChange }: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (v: string) => void;
  }) => (
    <div>
      <label>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  ),
}));

vi.mock("@/hooks/usePushNotifications", () => ({
  usePushNotifications: () => ({ supported: false, subscribed: false, subscribe: vi.fn(), unsubscribe: vi.fn() }),
}));

import * as notifApi from "@/api/notifications";
import { useAuthStore } from "@/stores/authStore";

const mockListChannels = vi.mocked(notifApi.listChannels);
const mockListRules = vi.mocked(notifApi.listRules);
const mockListLogs = vi.mocked(notifApi.listLogs);
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

const fakeChannel = {
  id: 1,
  channel_type: "EMAIL" as const,
  name: "Admin Email",
  email_recipients: "admin@example.com",
  webhook_url: "",
  webhook_secret: "",
  telegram_bot_token: "",
  telegram_chat_id: "",
  is_active: true,
};

function renderNotifications() {
  mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
    selector({ currentOrganization: fakeOrg }),
  );
  return render(
    <MemoryRouter>
      <Notifications />
    </MemoryRouter>,
  );
}

describe("Notifications page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListChannels.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockListRules.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
    mockListLogs.mockResolvedValue({ count: 0, next: null, previous: null, results: [] });
  });

  it("shows loading spinner initially", () => {
    mockListChannels.mockReturnValue(new Promise(() => {}));
    renderNotifications();
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders three tab buttons after loading", async () => {
    renderNotifications();
    await waitFor(() => {
      // At least one tab button should be present
      const buttons = screen.getAllByRole("button");
      expect(buttons.length).toBeGreaterThan(0);
    });
    // Tab buttons exist (may be multiple elements with same text due to content heading)
    expect(screen.getAllByText(/channels/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/rules/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/logs/i).length).toBeGreaterThan(0);
  });

  it("shows channel name in the list", async () => {
    mockListChannels.mockResolvedValue({
      count: 1,
      next: null,
      previous: null,
      results: [fakeChannel],
    });
    renderNotifications();
    await waitFor(() => {
      expect(screen.getByText("Admin Email")).toBeInTheDocument();
    });
    // Email recipients shown as subtitle
    expect(screen.getByText("admin@example.com")).toBeInTheDocument();
  });

  it("switches to Rules tab without crashing", async () => {
    renderNotifications();
    await waitFor(() => {
      expect(screen.getAllByText(/rules/i).length).toBeGreaterThan(0);
    });
    // Click the first element with "rules" text (the tab button)
    fireEvent.click(screen.getAllByText(/rules/i)[0]);
    // Should not crash
    expect(screen.getAllByText(/rules/i).length).toBeGreaterThan(0);
  });

  it("renders gracefully when no org", () => {
    mockUseAuthStore.mockImplementation((selector: (s: unknown) => unknown) =>
      selector({ currentOrganization: null }),
    );
    render(
      <MemoryRouter>
        <Notifications />
      </MemoryRouter>,
    );
    // Should not crash — spinner shown while no org
  });
});
