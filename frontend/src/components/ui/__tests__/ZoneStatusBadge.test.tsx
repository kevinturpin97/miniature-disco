import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZoneStatusBadge } from "../ZoneStatusBadge";

describe("ZoneStatusBadge", () => {
  it("renders online state", () => {
    render(<ZoneStatusBadge state="online" />);
    expect(screen.getByText("Online")).toBeInTheDocument();
  });

  it("renders offline state", () => {
    render(<ZoneStatusBadge state="offline" />);
    expect(screen.getByText("Offline")).toBeInTheDocument();
  });

  it("renders alert state", () => {
    render(<ZoneStatusBadge state="alert" />);
    expect(screen.getByText("Alert")).toBeInTheDocument();
  });

  it("renders syncing state", () => {
    render(<ZoneStatusBadge state="syncing" />);
    expect(screen.getByText("Syncing")).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<ZoneStatusBadge state="online" label="Zone A — Live" />);
    expect(screen.getByText("Zone A — Live")).toBeInTheDocument();
  });

  it("has correct aria-label for online state", () => {
    render(<ZoneStatusBadge state="online" />);
    expect(screen.getByLabelText("Zone status: Online")).toBeInTheDocument();
  });

  it("applies correct color classes for online state", () => {
    const { container } = render(<ZoneStatusBadge state="online" />);
    expect(container.firstChild).toHaveClass("border-[#00ff9c]/30");
  });

  it("applies correct color classes for offline state", () => {
    const { container } = render(<ZoneStatusBadge state="offline" />);
    expect(container.firstChild).toHaveClass("border-[#ff4d4f]/30");
  });

  it("applies alert animation class for alert state", () => {
    const { container } = render(<ZoneStatusBadge state="alert" />);
    expect(container.firstChild).toHaveClass("animate-command-pulse");
  });

  it("applies custom className", () => {
    const { container } = render(<ZoneStatusBadge state="online" className="mt-2" />);
    expect(container.firstChild).toHaveClass("mt-2");
  });
});
