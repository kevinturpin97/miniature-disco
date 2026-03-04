/**
 * Tests for the Settings page.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Settings from "./Settings";

// Mock API modules
vi.mock("@/api/auth", () => ({
  getMe: vi.fn(),
  updateMe: vi.fn(),
  changePassword: vi.fn(),
}));

vi.mock("@/api/greenhouses", () => ({
  listGreenhouses: vi.fn(),
  createGreenhouse: vi.fn(),
  deleteGreenhouse: vi.fn(),
}));

vi.mock("@/api/zones", () => ({
  listZones: vi.fn(),
  createZone: vi.fn(),
  deleteZone: vi.fn(),
}));

vi.mock("@/api/sensors", () => ({
  listSensors: vi.fn(),
  createSensor: vi.fn(),
  deleteSensor: vi.fn(),
}));

vi.mock("@/api/actuators", () => ({
  listActuators: vi.fn(),
  createActuator: vi.fn(),
  deleteActuator: vi.fn(),
}));

import { getMe } from "@/api/auth";
import { listGreenhouses } from "@/api/greenhouses";

const mockedGetMe = vi.mocked(getMe);
const mockedListGreenhouses = vi.mocked(listGreenhouses);

const fakeUser = {
  id: 1,
  username: "testuser",
  email: "test@example.com",
  first_name: "John",
  last_name: "Doe",
};

const fakeGreenhousesResponse = {
  count: 1,
  next: null,
  previous: null,
  results: [
    {
      id: 1,
      name: "GH1",
      location: "Roof",
      description: "",
      is_active: true,
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      zone_count: 0,
      organization: 1,
    },
  ],
};

function renderSettings() {
  return render(
    <MemoryRouter>
      <Settings />
    </MemoryRouter>,
  );
}

describe("Settings page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading spinner initially", () => {
    // Never resolve to keep loading state
    mockedGetMe.mockReturnValue(new Promise(() => {}));
    renderSettings();
    // The Spinner component renders an SVG with animate-spin class
    expect(document.querySelector("svg.animate-spin")).toBeInTheDocument();
  });

  it("renders user profile form after loading", async () => {
    mockedGetMe.mockResolvedValue(fakeUser);
    renderSettings();

    // Wait for the profile title to appear once data is loaded
    await waitFor(() => {
      expect(screen.getByText("User Profile")).toBeInTheDocument();
    });

    // Check that the username field is rendered and readonly
    const usernameInput = screen.getByDisplayValue("testuser");
    expect(usernameInput).toBeInTheDocument();
    expect(usernameInput).toHaveAttribute("readOnly");

    // Check email, first name, and last name fields
    expect(screen.getByDisplayValue("test@example.com")).toBeInTheDocument();
    expect(screen.getByDisplayValue("John")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Doe")).toBeInTheDocument();
  });

  it("shows error on profile API failure", async () => {
    mockedGetMe.mockRejectedValue(new Error("Network error"));
    renderSettings();

    await waitFor(() => {
      expect(screen.getByText("Failed to load data.")).toBeInTheDocument();
    });
  });

  it("renders Resources tab when clicked", async () => {
    // Profile tab needs to resolve so the page is interactive
    mockedGetMe.mockResolvedValue(fakeUser);
    mockedListGreenhouses.mockResolvedValue(fakeGreenhousesResponse);

    renderSettings();

    // Wait for profile to finish loading
    await waitFor(() => {
      expect(screen.getByText("User Profile")).toBeInTheDocument();
    });

    // Click on the Resources tab
    fireEvent.click(screen.getByText("Resources"));

    // Wait for the Resources tab content to appear
    await waitFor(() => {
      expect(screen.getByText("Resource Management")).toBeInTheDocument();
    });

    // Profile tab content should no longer be visible
    expect(screen.queryByText("User Profile")).not.toBeInTheDocument();
  });

  it("shows greenhouses in accordion on Resources tab", async () => {
    mockedGetMe.mockResolvedValue(fakeUser);
    mockedListGreenhouses.mockResolvedValue(fakeGreenhousesResponse);

    renderSettings();

    // Wait for profile to load then switch to Resources tab
    await waitFor(() => {
      expect(screen.getByText("User Profile")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Resources"));

    // Wait for greenhouses to load and display
    await waitFor(() => {
      expect(screen.getByText("GH1")).toBeInTheDocument();
    });

    // Verify greenhouse location is shown
    expect(screen.getByText("Roof")).toBeInTheDocument();

    // Verify listGreenhouses was called
    expect(mockedListGreenhouses).toHaveBeenCalledTimes(1);
  });
});
