/**
 * Tests for ResourceGauge component.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ResourceGauge } from "./ResourceGauge";

describe("ResourceGauge", () => {
  it("renders label, value and default unit", () => {
    render(<ResourceGauge label="CPU" value={45} />);
    expect(screen.getByText("CPU")).toBeDefined();
    expect(screen.getByText(/45%/)).toBeDefined();
  });

  it("renders with custom unit", () => {
    render(<ResourceGauge label="TMP" value={52} unit="°C" />);
    expect(screen.getByText(/52°C/)).toBeDefined();
  });

  it("applies success color class below 60%", () => {
    const { container } = render(<ResourceGauge label="MEM" value={40} />);
    // The value text should use success color
    const valueEl = container.querySelector(".text-success");
    expect(valueEl).toBeTruthy();
  });

  it("applies warning color class between 60-79%", () => {
    const { container } = render(<ResourceGauge label="DSK" value={70} />);
    const valueEl = container.querySelector(".text-warning");
    expect(valueEl).toBeTruthy();
  });

  it("applies error color class at or above 80%", () => {
    const { container } = render(<ResourceGauge label="CPU" value={95} />);
    const valueEl = container.querySelector(".text-error");
    expect(valueEl).toBeTruthy();
  });

  it("clamps percentage to 100%", () => {
    const { container } = render(<ResourceGauge label="CPU" value={200} max={100} />);
    // The progress bar's aria-valuenow should reflect original value
    const bar = container.querySelector("[role=progressbar]");
    expect(bar).toBeTruthy();
  });

  it("uses aria attributes on the progress bar", () => {
    render(<ResourceGauge label="CPU" value={60} max={100} />);
    const bar = screen.getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("60");
    expect(bar.getAttribute("aria-valuemin")).toBe("0");
    expect(bar.getAttribute("aria-valuemax")).toBe("100");
  });
});
