import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { SensorChart } from "../SensorChart";

// Recharts uses ResizeObserver internally — mock it
class MockResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;

// Mock IntersectionObserver to immediately trigger visibility
class MockIntersectionObserver {
  constructor(cb: IntersectionObserverCallback) {
    setTimeout(() => cb([{ isIntersecting: true } as IntersectionObserverEntry], this), 0);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.IntersectionObserver = MockIntersectionObserver as unknown as typeof IntersectionObserver;

const READINGS = [
  { received_at: "2024-01-01T10:00:00Z", value: 22.5 },
  { received_at: "2024-01-01T10:05:00Z", value: 23.1 },
  { received_at: "2024-01-01T10:10:00Z", value: 21.8 },
];

describe("SensorChart", () => {
  it("renders with aria-label", () => {
    render(<SensorChart data={READINGS} aria-label="Temperature chart" />);
    expect(screen.getByRole("img", { name: "Temperature chart" })).toBeInTheDocument();
  });

  it("uses sensorType as fallback label", () => {
    render(<SensorChart data={READINGS} sensorType="TEMP" />);
    expect(screen.getByRole("img", { name: "TEMP chart" })).toBeInTheDocument();
  });

  it("shows 'Not enough data' for 0 or 1 points after visible", async () => {
    render(<SensorChart data={[READINGS[0]!]} sensorType="TEMP" />);
    // Allow intersection observer to trigger
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.getByText("Not enough data")).toBeInTheDocument();
  });

  it("shows skeleton placeholder before becoming visible", () => {
    // With a non-triggering observer, the skeleton div is shown
    const { container } = render(<SensorChart data={READINGS} sensorType="HUM_AIR" />);
    // Initially shows skeleton
    const skeleton = container.querySelector(".animate-pulse");
    expect(skeleton).toBeInTheDocument();
  });

  it("applies custom height", () => {
    const { container } = render(<SensorChart data={READINGS} height={200} />);
    expect(container.firstChild).toHaveStyle({ height: "200px" });
  });
});
