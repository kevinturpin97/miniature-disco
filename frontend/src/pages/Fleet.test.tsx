/**
 * Tests for Fleet overview page.
 * Covers: loading state, loaded state with devices, empty state.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Fleet from "./Fleet";
import * as fleetApi from "@/api/fleet";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      if (key === "fleet.title") return "Fleet Management";
      if (key === "fleet.subtitleLoading") return "Loading fleet status...";
      if (key === "fleet.newRelease") return "New Release";
      if (key === "fleet.search") return "Search device...";
      if (key === "fleet.empty.title") return "No devices registered yet";
      if (key === "fleet.empty.subtitle")
        return "Register your first Raspberry Pi to start managing your fleet.";
      if (key === "fleet.filter.all") return "All";
      if (key === "fleet.filter.online") return "Online";
      if (key === "fleet.filter.outdated") return "Outdated";
      if (key === "fleet.filter.offline") return "Offline";
      if (key === "fleet.filter.updating") return "Updating";
      if (key === "fleet.stats.online") return "Online devices";
      if (key === "fleet.stats.outdated") return "Outdated firmware";
      if (key === "fleet.stats.offline") return "Offline > 1h";
      if (key === "fleet.stats.updating") return "OTA jobs active";
      if (key === "fleet.subtitle" && opts) {
        return `${opts.count} devices across ${opts.orgs} organizations`;
      }
      if (key === "fleet.neverSeen") return "Never seen";
      if (key === "fleet.update") return "Update";
      if (key === "fleet.actions") return "Device actions";
      if (key === "fleet.menu.viewDetails") return "View details";
      if (key === "fleet.menu.forceUpdate") return "Force update";
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

vi.mock("@/components/fleet/NewFirmwareModal", () => ({
  NewFirmwareModal: () => null,
}));

vi.mock("@/components/ui/FeatureGate", () => ({
  FeatureGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/ui/GlowCard", () => ({
  GlowCard: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

vi.mock("react-hot-toast", () => ({
  default: { error: vi.fn(), success: vi.fn() },
}));

const mockOverview: fleetApi.FleetOverview = {
  total_devices: 3,
  online_devices: 2,
  offline_devices: 1,
  outdated_devices: 1,
  active_ota_jobs: 0,
  organizations_count: 2,
};

const oneHourAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const mockDevices: fleetApi.FleetDevice[] = [
  {
    id: 1,
    device_id: "dev-001",
    name: "RPi-001",
    organization: 1,
    organization_name: "GreenFarm Bio",
    firmware_version: "3.2.1",
    last_sync_at: oneHourAgo,
    is_active: true,
    created_at: "2025-11-01T00:00:00Z",
    latest_metrics: null,
    active_ota_job: null,
  },
];

const mockRelease: fleetApi.FirmwareRelease = {
  id: 1,
  version: "3.2.1",
  channel: "STABLE",
  release_notes: "",
  binary_url: "https://example.com/fw.bin",
  checksum_sha256: "a".repeat(64),
  file_size_bytes: 524288,
  min_hardware_version: "",
  is_active: true,
  created_at: "2026-01-01T00:00:00Z",
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Fleet page", () => {
  beforeEach(() => {
    vi.spyOn(fleetApi, "getFleetOverview").mockResolvedValue(mockOverview);
    vi.spyOn(fleetApi, "listFleetDevices").mockResolvedValue(mockDevices);
    vi.spyOn(fleetApi, "listFirmwareReleases").mockResolvedValue([mockRelease]);
  });

  it("renders page title immediately", () => {
    render(<Fleet />);
    expect(screen.getByText("Fleet Management")).toBeDefined();
  });

  it("shows loading skeletons initially", () => {
    render(<Fleet />);
    // Subtitle shows loading text while data is fetching
    expect(screen.getByText("Loading fleet status...")).toBeDefined();
  });

  it("renders stat cards after load", async () => {
    render(<Fleet />);
    await waitFor(() => {
      expect(screen.getByText("Online devices")).toBeDefined();
      expect(screen.getByText("Outdated firmware")).toBeDefined();
      expect(screen.getByText("Offline > 1h")).toBeDefined();
      expect(screen.getByText("OTA jobs active")).toBeDefined();
    });
  });

  it("renders device rows after load", async () => {
    render(<Fleet />);
    await waitFor(() => {
      expect(screen.getByText("RPi-001")).toBeDefined();
      expect(screen.getByText("GreenFarm Bio")).toBeDefined();
    });
  });

  it("shows empty state when no devices", async () => {
    vi.spyOn(fleetApi, "listFleetDevices").mockResolvedValue([]);
    vi.spyOn(fleetApi, "getFleetOverview").mockResolvedValue({
      ...mockOverview,
      total_devices: 0,
      online_devices: 0,
    });
    render(<Fleet />);
    await waitFor(() => {
      expect(screen.getByText("No devices registered yet")).toBeDefined();
    });
  });

  it("renders filter buttons", async () => {
    render(<Fleet />);
    await waitFor(() => {
      expect(screen.getByText("All")).toBeDefined();
      expect(screen.getByText("Online")).toBeDefined();
      expect(screen.getByText("Outdated")).toBeDefined();
      expect(screen.getByText("Offline")).toBeDefined();
      expect(screen.getByText("Updating")).toBeDefined();
    });
  });

  it("renders New Release button", async () => {
    render(<Fleet />);
    await waitFor(() => {
      expect(screen.getByText("New Release")).toBeDefined();
    });
  });
});
