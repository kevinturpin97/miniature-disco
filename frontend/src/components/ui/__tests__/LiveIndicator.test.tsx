import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveIndicator } from "../LiveIndicator";

describe("LiveIndicator", () => {
  it("renders with live state by default", () => {
    render(<LiveIndicator />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("has aria-label reflecting live state", () => {
    render(<LiveIndicator state="live" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Connection live");
  });

  it("has aria-label reflecting offline state", () => {
    render(<LiveIndicator state="offline" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Connection offline");
  });

  it("has aria-label reflecting degraded state", () => {
    render(<LiveIndicator state="degraded" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "Connection degraded");
  });

  it("uses custom label when provided", () => {
    render(<LiveIndicator label="MQTT connected" />);
    expect(screen.getByRole("status")).toHaveAttribute("aria-label", "MQTT connected");
  });

  it("renders sm size", () => {
    const { container } = render(<LiveIndicator size="sm" />);
    // Just ensure it renders without errors
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders lg size", () => {
    const { container } = render(<LiveIndicator size="lg" />);
    expect(container.firstChild).toBeInTheDocument();
  });

  it("renders pulse ring only for live state", () => {
    const { container: liveContainer } = render(<LiveIndicator state="live" />);
    const { container: offlineContainer } = render(<LiveIndicator state="offline" />);
    // Live state should have animate-live-pulse class
    expect(liveContainer.querySelector(".animate-live-pulse")).toBeInTheDocument();
    expect(offlineContainer.querySelector(".animate-live-pulse")).toBeNull();
  });
});
