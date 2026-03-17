/**
 * Tests for OTAProgressCard component — covers all 6 OTA job states.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OTAProgressCard } from "./OTAProgressCard";
import type { DeviceOTAJob } from "@/api/fleet";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      const map: Record<string, string> = {
        "fleetDetail.ota.preparing": "Preparing...",
        "fleetDetail.ota.downloading": "Downloading firmware...",
        "fleetDetail.ota.installing": "Installing — do not power off",
        "fleetDetail.ota.success": "Update completed successfully",
        "fleetDetail.ota.failed": "Update failed",
        "fleetDetail.ota.cancel": "Cancel",
        "fleetDetail.ota.retry": "Retry",
        "fleetDetail.ota.updatingTo": `Updating to v${opts?.version ?? ""}`,
        "fleetDetail.ota.updatedTo": `Updated to v${opts?.version ?? ""}`,
        "fleetDetail.ota.updateFailed": "Update failed",
        "fleetDetail.ota.rolledBack": `Rolled back to v${opts?.version ?? ""}`,
        "fleetDetail.ota.stepPrepare": "Prepare",
        "fleetDetail.ota.stepDownload": `Download (${opts?.pct ?? 0}%)`,
        "fleetDetail.ota.stepInstall": "Install",
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, animate, ...rest }: any) => <div {...rest}>{children}</div>,
    button: ({ children, ...rest }: any) => <button {...rest}>{children}</button>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const BASE_JOB: DeviceOTAJob = {
  id: 1,
  edge_device: 1,
  device_name: "RPi-001",
  firmware_release: 5,
  firmware_version: "3.2.2",
  status: "PENDING",
  progress_percent: 0,
  previous_version: "3.2.1",
  error_message: "",
  started_at: null,
  completed_at: null,
  created_at: "2026-03-14T08:00:00Z",
};

function job(overrides: Partial<DeviceOTAJob>): DeviceOTAJob {
  return { ...BASE_JOB, ...overrides };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("OTAProgressCard", () => {
  // ── PENDING ──────────────────────────────────────────────────────────────

  it("renders PENDING state — correct title and status text", () => {
    render(<OTAProgressCard job={job({ status: "PENDING" })} />);
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("PENDING");
    expect(screen.getByText("Updating to v3.2.2")).toBeDefined();
    expect(screen.getByText("Preparing...")).toBeDefined();
  });

  it("PENDING — no percent displayed", () => {
    render(<OTAProgressCard job={job({ status: "PENDING" })} />);
    // Percent is only shown in DOWNLOADING
    expect(screen.queryByText(/43%/)).toBeNull();
  });

  it("PENDING — shows Cancel button when onCancel provided", () => {
    const onCancel = vi.fn();
    render(<OTAProgressCard job={job({ status: "PENDING" })} onCancel={onCancel} />);
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  // ── DOWNLOADING ──────────────────────────────────────────────────────────

  it("renders DOWNLOADING state — shows percent and status", () => {
    render(<OTAProgressCard job={job({ status: "DOWNLOADING", progress_percent: 43 })} />);
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("DOWNLOADING");
    expect(screen.getByText("Updating to v3.2.2")).toBeDefined();
    expect(screen.getByText("43%")).toBeDefined();
    expect(screen.getByText("Downloading firmware...")).toBeDefined();
  });

  it("DOWNLOADING — Cancel button calls onCancel", () => {
    const onCancel = vi.fn();
    render(
      <OTAProgressCard
        job={job({ status: "DOWNLOADING", progress_percent: 43 })}
        onCancel={onCancel}
      />
    );
    fireEvent.click(screen.getByText("Cancel"));
    expect(onCancel).toHaveBeenCalledOnce();
  });

  it("DOWNLOADING — step indicators present", () => {
    render(<OTAProgressCard job={job({ status: "DOWNLOADING", progress_percent: 50 })} />);
    // Steps include emoji prefixes; "Download" also appears in the status label
    expect(screen.getAllByText(/Prepare/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Download/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Install/).length).toBeGreaterThan(0);
  });

  // ── INSTALLING ───────────────────────────────────────────────────────────

  it("renders INSTALLING state — status label shown", () => {
    render(<OTAProgressCard job={job({ status: "INSTALLING" })} />);
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("INSTALLING");
    expect(screen.getByText("Updating to v3.2.2")).toBeDefined();
    expect(screen.getByText("Installing — do not power off")).toBeDefined();
  });

  it("INSTALLING — no Cancel or Retry buttons", () => {
    render(<OTAProgressCard job={job({ status: "INSTALLING" })} />);
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
  });

  // ── SUCCESS ───────────────────────────────────────────────────────────────

  it("renders SUCCESS state — success title shown", () => {
    vi.useFakeTimers();
    render(<OTAProgressCard job={job({ status: "SUCCESS" })} />);
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("SUCCESS");
    expect(screen.getByText("Updated to v3.2.2")).toBeDefined();
    expect(screen.getByText("Update completed successfully")).toBeDefined();
    vi.useRealTimers();
  });

  it("SUCCESS — no Cancel or Retry buttons", () => {
    vi.useFakeTimers();
    render(<OTAProgressCard job={job({ status: "SUCCESS" })} />);
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    vi.useRealTimers();
  });

  it("SUCCESS — calls onDismiss after timers fire", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();
    render(<OTAProgressCard job={job({ status: "SUCCESS" })} onDismiss={onDismiss} />);
    // After 1000ms confetti ends, after 1200ms more dismiss fires
    act(() => { vi.advanceTimersByTime(2500); });
    expect(onDismiss).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  // ── FAILED ────────────────────────────────────────────────────────────────

  it("renders FAILED state — error title shown", () => {
    render(<OTAProgressCard job={job({ status: "FAILED" })} />);
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("FAILED");
    // "Update failed" appears in both the header and the status label
    expect(screen.getAllByText("Update failed").length).toBeGreaterThan(0);
  });

  it("FAILED — shows error message when present", () => {
    render(
      <OTAProgressCard
        job={job({ status: "FAILED", error_message: "Checksum mismatch" })}
      />
    );
    expect(screen.getByText("Checksum mismatch")).toBeDefined();
  });

  it("FAILED — Retry button calls onRetry", () => {
    const onRetry = vi.fn();
    render(<OTAProgressCard job={job({ status: "FAILED" })} onRetry={onRetry} />);
    fireEvent.click(screen.getByText("Retry"));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("FAILED — no Cancel button", () => {
    render(<OTAProgressCard job={job({ status: "FAILED" })} />);
    expect(screen.queryByText("Cancel")).toBeNull();
  });

  it("FAILED — no step indicators shown", () => {
    render(<OTAProgressCard job={job({ status: "FAILED" })} />);
    // Steps only appear for active (non-failed, non-success) jobs
    expect(screen.queryByText("Prepare")).toBeNull();
  });

  // ── ROLLED_BACK ───────────────────────────────────────────────────────────

  it("renders ROLLED_BACK state — rollback message with previous version", () => {
    render(
      <OTAProgressCard
        job={job({ status: "ROLLED_BACK", previous_version: "3.2.1" })}
      />
    );
    const card = screen.getByTestId("ota-progress-card");
    expect(card.getAttribute("data-status")).toBe("ROLLED_BACK");
    expect(screen.getByText("Rolled back to v3.2.1")).toBeDefined();
  });

  it("ROLLED_BACK — no Cancel, no Retry, no step indicators", () => {
    render(
      <OTAProgressCard
        job={job({ status: "ROLLED_BACK", previous_version: "3.2.1" })}
      />
    );
    expect(screen.queryByText("Cancel")).toBeNull();
    expect(screen.queryByText("Retry")).toBeNull();
    expect(screen.queryByText("Prepare")).toBeNull();
  });

  // ── Border classes ────────────────────────────────────────────────────────

  it("uses primary border class for active jobs", () => {
    const { container } = render(<OTAProgressCard job={job({ status: "DOWNLOADING" })} />);
    const card = container.querySelector("[data-testid='ota-progress-card']");
    expect(card?.className).toContain("border-primary");
  });

  it("uses error border class for FAILED", () => {
    const { container } = render(<OTAProgressCard job={job({ status: "FAILED" })} />);
    const card = container.querySelector("[data-testid='ota-progress-card']");
    expect(card?.className).toContain("border-error");
  });

  it("uses success border class for SUCCESS", () => {
    vi.useFakeTimers();
    const { container } = render(<OTAProgressCard job={job({ status: "SUCCESS" })} />);
    const card = container.querySelector("[data-testid='ota-progress-card']");
    expect(card?.className).toContain("border-success");
    vi.useRealTimers();
  });
});
