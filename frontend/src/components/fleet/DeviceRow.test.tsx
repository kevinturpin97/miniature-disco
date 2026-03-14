/**
 * Tests for DeviceRow component — covers all 5 device states.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeviceRow } from "./DeviceRow";
import type { FleetDevice } from "@/api/fleet";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "fleet.neverSeen") return "Never seen";
      if (key === "fleet.update") return "Update";
      if (key === "fleet.actions") return "Actions";
      if (key === "fleet.menu.viewDetails") return "View details";
      if (key === "fleet.menu.forceUpdate") return "Force update";
      if (opts?.name) return String(opts.name);
      return key;
    },
  }),
}));

vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
      <div {...props}>{children}</div>
    ),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const oneHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30min ago → online
const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(); // 2h ago → offline-recent
const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(); // 2d ago → offline-critical

const baseDevice: FleetDevice = {
  id: 1,
  device_id: "abc-123",
  name: "Raspberry-Pi-001",
  organization: 1,
  organization_name: "GreenFarm Bio",
  firmware_version: "3.2.1",
  last_sync_at: oneHourAgo,
  is_active: true,
  created_at: "2025-11-03T10:00:00Z",
  latest_metrics: {
    id: 1,
    edge_device: 1,
    cpu_percent: 23,
    memory_percent: 41,
    disk_percent: 67,
    cpu_temperature: 48,
    uptime_seconds: 1234567,
    network_latency_ms: 34,
    recorded_at: oneHourAgo,
  },
  active_ota_job: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeviceRow", () => {
  it("renders device name and org", () => {
    render(<DeviceRow device={baseDevice} index={0} latestVersion="3.2.1" />);
    expect(screen.getByText("Raspberry-Pi-001")).toBeDefined();
    expect(screen.getByText("GreenFarm Bio")).toBeDefined();
  });

  it("shows online-current state (no Update button)", () => {
    render(<DeviceRow device={baseDevice} index={0} latestVersion="3.2.1" />);
    const row = screen.getByTestId("device-row");
    expect(row.getAttribute("data-status")).toBe("online-current");
    expect(screen.queryByText("Update")).toBeNull();
  });

  it("shows Update button when firmware is outdated", () => {
    render(<DeviceRow device={baseDevice} index={0} latestVersion="3.3.0" />);
    const row = screen.getByTestId("device-row");
    expect(row.getAttribute("data-status")).toBe("online-outdated");
    expect(screen.getByText("Update")).toBeDefined();
  });

  it("calls onUpdate with device when Update clicked", () => {
    const onUpdate = vi.fn();
    render(
      <DeviceRow device={baseDevice} index={0} latestVersion="3.3.0" onUpdate={onUpdate} />
    );
    fireEvent.click(screen.getByText("Update"));
    expect(onUpdate).toHaveBeenCalledWith(baseDevice);
  });

  it("shows OTA progress bar when job is active", () => {
    const updating: FleetDevice = {
      ...baseDevice,
      active_ota_job: {
        id: 10,
        edge_device: 1,
        device_name: "Raspberry-Pi-001",
        firmware_release: 5,
        firmware_version: "3.3.0",
        status: "DOWNLOADING",
        progress_percent: 43,
        previous_version: "3.2.1",
        error_message: "",
        started_at: oneHourAgo,
        completed_at: null,
        created_at: oneHourAgo,
      },
    };
    render(<DeviceRow device={updating} index={0} />);
    const row = screen.getByTestId("device-row");
    expect(row.getAttribute("data-status")).toBe("updating");
    expect(screen.getByText(/43%/)).toBeDefined();
  });

  it("shows offline-recent status for device last seen < 24h ago", () => {
    const offlineRecent: FleetDevice = { ...baseDevice, last_sync_at: twoHoursAgo };
    render(<DeviceRow device={offlineRecent} index={0} latestVersion="3.2.1" />);
    const row = screen.getByTestId("device-row");
    expect(row.getAttribute("data-status")).toBe("offline-recent");
  });

  it("shows offline-critical status for device last seen > 24h ago", () => {
    const offlineCritical: FleetDevice = { ...baseDevice, last_sync_at: twoDaysAgo };
    render(<DeviceRow device={offlineCritical} index={0} latestVersion="3.2.1" />);
    const row = screen.getByTestId("device-row");
    expect(row.getAttribute("data-status")).toBe("offline-critical");
  });

  it("shows 'Never seen' when last_sync_at is null", () => {
    const newDevice: FleetDevice = { ...baseDevice, last_sync_at: null };
    render(<DeviceRow device={newDevice} index={0} />);
    expect(screen.getAllByText("Never seen").length).toBeGreaterThan(0);
  });

  it("renders inline metrics when available", () => {
    render(<DeviceRow device={baseDevice} index={0} />);
    // Metrics appear in both desktop and mobile rows, use getAllByText
    expect(screen.getAllByText(/CPU 23%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/MEM 41%/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/DISK 67%/).length).toBeGreaterThan(0);
  });

  it("renders 'No metrics' when latest_metrics is null", () => {
    const noMetrics: FleetDevice = { ...baseDevice, latest_metrics: null };
    render(<DeviceRow device={noMetrics} index={0} />);
    expect(screen.getAllByText("No metrics").length).toBeGreaterThan(0);
  });

  it("opens action menu on ⋮ click", () => {
    render(<DeviceRow device={baseDevice} index={0} />);
    fireEvent.click(screen.getByLabelText("Actions"));
    expect(screen.getByText("View details")).toBeDefined();
    expect(screen.getByText("Force update")).toBeDefined();
  });
});
