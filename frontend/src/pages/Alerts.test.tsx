/**
 * Tests for the Alerts page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Alerts from "./Alerts";

// Mock API
vi.mock("@/api/alerts", () => ({
  listAlerts: vi.fn(),
  acknowledgeAlert: vi.fn(),
}));

// Mock alert store
const mockDecrementUnacknowledgedCount = vi.fn();
vi.mock("@/stores/alertStore", () => ({
  useAlertStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      decrementUnacknowledgedCount: mockDecrementUnacknowledgedCount,
    }),
}));

// Mock formatters (date-fns needs real dates)
vi.mock("@/utils/formatters", () => ({
  formatDate: (d: string) => d,
  formatRelativeTime: (d: string) => `relative(${d})`,
}));

// Mock Spinner
vi.mock("@/components/ui/Spinner", () => ({
  Spinner: ({ className }: { className?: string }) => (
    <div data-testid="spinner" className={className} />
  ),
}));

import { listAlerts, acknowledgeAlert } from "@/api/alerts";

const mockListAlerts = listAlerts as ReturnType<typeof vi.fn>;
const mockAcknowledgeAlert = acknowledgeAlert as ReturnType<typeof vi.fn>;

function renderAlerts() {
  return render(
    <MemoryRouter>
      <Alerts />
    </MemoryRouter>,
  );
}

describe("Alerts page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    mockListAlerts.mockReturnValue(new Promise(() => {})); // never resolves
    renderAlerts();
    expect(screen.getByTestId("spinner")).toBeInTheDocument();
  });

  it("shows empty state on fetch failure (errors handled via toast)", async () => {
    mockListAlerts.mockRejectedValueOnce(new Error("Network error"));
    renderAlerts();
    // After API failure, loading finishes and empty filter results are shown
    // (error toast is displayed by the global Axios interceptor)
    await waitFor(() => {
      expect(screen.getByText("No alerts match your filters.")).toBeInTheDocument();
    });
  });

  it("shows empty state when no alerts", async () => {
    mockListAlerts.mockResolvedValueOnce({ count: 0, results: [] });
    renderAlerts();
    await waitFor(() => {
      expect(screen.getByText("No alerts match your filters.")).toBeInTheDocument();
    });
  });

  it("renders alerts with severity badges", async () => {
    mockListAlerts.mockResolvedValueOnce({
      count: 2,
      results: [
        {
          id: 1,
          sensor: null,
          zone: 1,
          alert_type: "HIGH",
          severity: "CRITICAL",
          value: 42.0,
          message: "Temperature way too high",
          is_acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          created_at: "2024-06-01T10:00:00Z",
        },
        {
          id: 2,
          sensor: null,
          zone: 1,
          alert_type: "OFFLINE",
          severity: "WARNING",
          value: null,
          message: "Relay offline",
          is_acknowledged: true,
          acknowledged_by: 1,
          acknowledged_at: "2024-06-01T12:00:00Z",
          created_at: "2024-06-01T09:00:00Z",
        },
      ],
    });
    renderAlerts();

    await waitFor(() => {
      expect(screen.getByText("Temperature way too high")).toBeInTheDocument();
      expect(screen.getByText("Relay offline")).toBeInTheDocument();
    });

    // Severity badges
    expect(screen.getByText("CRITICAL")).toBeInTheDocument();
    expect(screen.getByText("WARNING")).toBeInTheDocument();

    // Alert type badges
    expect(screen.getByText("Threshold High")).toBeInTheDocument();
    expect(screen.getByText("Relay Offline")).toBeInTheDocument();

    // Acknowledged badge on second alert
    const ackBadges = screen.getAllByText("Acknowledged");
    expect(ackBadges.length).toBeGreaterThanOrEqual(1);

    // Acknowledge button only on unacknowledged alert
    const ackButtons = screen.getAllByRole("button", { name: "Acknowledge" });
    expect(ackButtons).toHaveLength(1);
  });

  it("acknowledges an alert on button click", async () => {
    mockListAlerts.mockResolvedValueOnce({
      count: 1,
      results: [
        {
          id: 5,
          sensor: null,
          zone: 1,
          alert_type: "LOW",
          severity: "INFO",
          value: 3.0,
          message: "pH too low",
          is_acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          created_at: "2024-06-01T10:00:00Z",
        },
      ],
    });
    mockAcknowledgeAlert.mockResolvedValueOnce({
      id: 5,
      sensor: null,
      zone: 1,
      alert_type: "LOW",
      severity: "INFO",
      value: 3.0,
      message: "pH too low",
      is_acknowledged: true,
      acknowledged_by: 1,
      acknowledged_at: "2024-06-01T10:05:00Z",
      created_at: "2024-06-01T10:00:00Z",
    });

    renderAlerts();
    await waitFor(() => {
      expect(screen.getByText("pH too low")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Acknowledge" }));

    await waitFor(() => {
      expect(mockAcknowledgeAlert).toHaveBeenCalledWith(5);
      expect(mockDecrementUnacknowledgedCount).toHaveBeenCalled();
    });
  });

  it("shows severity filter dropdown", async () => {
    mockListAlerts.mockResolvedValue({ count: 0, results: [] });
    renderAlerts();

    await waitFor(() => {
      expect(screen.getByText("No alerts match your filters.")).toBeInTheDocument();
    });

    const select = screen.getByLabelText("Filter by severity");
    expect(select).toBeInTheDocument();
    expect(select).toHaveValue("");
  });

  it("shows acknowledged filter buttons", async () => {
    mockListAlerts.mockResolvedValue({ count: 0, results: [] });
    renderAlerts();

    await waitFor(() => {
      expect(screen.getByText("No alerts match your filters.")).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: "All" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Unacknowledged" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Acknowledged" })).toBeInTheDocument();
  });

  it("calls listAlerts with filter params when filter changes", async () => {
    mockListAlerts.mockResolvedValue({ count: 0, results: [] });
    renderAlerts();

    await waitFor(() => {
      expect(mockListAlerts).toHaveBeenCalledTimes(1);
    });

    // Click "Unacknowledged" filter
    fireEvent.click(screen.getByRole("button", { name: "Unacknowledged" }));

    await waitFor(() => {
      expect(mockListAlerts).toHaveBeenCalledTimes(2);
      const lastCall = mockListAlerts.mock.calls[1][0];
      expect(lastCall.is_acknowledged).toBe(false);
    });
  });

  it("shows value when alert has value", async () => {
    mockListAlerts.mockResolvedValueOnce({
      count: 1,
      results: [
        {
          id: 1,
          sensor: null,
          zone: 1,
          alert_type: "HIGH",
          severity: "WARNING",
          value: 42.5,
          message: "High temperature",
          is_acknowledged: false,
          acknowledged_by: null,
          acknowledged_at: null,
          created_at: "2024-06-01T10:00:00Z",
        },
      ],
    });
    renderAlerts();

    await waitFor(() => {
      expect(screen.getByText("Value: 42.5")).toBeInTheDocument();
    });
  });
});
