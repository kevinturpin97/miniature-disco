import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricTile } from "../MetricTile";

describe("MetricTile", () => {
  it("renders value and label", () => {
    render(<MetricTile label="Temperature" value={23.4} unit="°C" />);
    expect(screen.getByText("Temperature")).toBeInTheDocument();
    expect(screen.getByText("23.4")).toBeInTheDocument();
    expect(screen.getByText("°C")).toBeInTheDocument();
  });

  it("renders string value", () => {
    render(<MetricTile label="Zones" value="3/5" />);
    expect(screen.getByText("3/5")).toBeInTheDocument();
  });

  it("renders trend up icon", () => {
    const { container } = render(<MetricTile label="Humidity" value={65} trend="up" trendPercent={5.2} />);
    // trendPercent should be visible
    expect(container.textContent).toContain("5.2%");
  });

  it("renders trend percent without decimals clipping", () => {
    render(<MetricTile label="CO2" value={400} trend="down" trendPercent={12.567} />);
    expect(screen.getByText("12.6%")).toBeInTheDocument();
  });

  it("renders sparkline when enough data", () => {
    const sparkline = [{ value: 10 }, { value: 20 }, { value: 15 }];
    const { container } = render(<MetricTile label="Temp" value={15} sparkline={sparkline} />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("does not render sparkline for less than 2 points", () => {
    const { container } = render(<MetricTile label="Temp" value={15} sparkline={[{ value: 10 }]} />);
    // The sparkline SVG has opacity-70 class; lucide icons have no such class
    const sparklineSvg = container.querySelector("svg.opacity-70");
    expect(sparklineSvg).toBeNull();
  });

  it("renders without unit", () => {
    render(<MetricTile label="Count" value={42} />);
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
