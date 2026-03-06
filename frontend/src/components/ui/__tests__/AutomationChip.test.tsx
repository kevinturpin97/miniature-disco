import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AutomationChip } from "../AutomationChip";

describe("AutomationChip", () => {
  it("renders rule name", () => {
    render(<AutomationChip name="High Temp Rule" />);
    expect(screen.getByText("High Temp Rule")).toBeInTheDocument();
  });

  it("renders trigger count when > 0", () => {
    render(<AutomationChip name="Rule A" triggerCount={5} />);
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("does not render trigger count when 0", () => {
    const { queryByText } = render(<AutomationChip name="Rule A" triggerCount={0} />);
    expect(queryByText("0")).toBeNull();
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<AutomationChip name="Rule A" onClick={onClick} />);
    fireEvent.click(screen.getByRole("button"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("has correct aria-label for active chip", () => {
    render(<AutomationChip name="Rule A" active />);
    expect(screen.getByLabelText("Automation: Rule A, active")).toBeInTheDocument();
  });

  it("has correct aria-label for inactive chip", () => {
    render(<AutomationChip name="Rule A" active={false} />);
    expect(screen.getByLabelText("Automation: Rule A, inactive")).toBeInTheDocument();
  });

  it("applies active styles when active=true", () => {
    const { container } = render(<AutomationChip name="Rule" active />);
    expect(container.firstChild).toHaveClass("border-[#00ff9c]/30");
  });

  it("applies muted styles when active=false", () => {
    const { container } = render(<AutomationChip name="Rule" active={false} />);
    expect(container.firstChild).toHaveClass("bg-muted");
  });

  it("triggers ripple animation on click", async () => {
    render(<AutomationChip name="Rule A" />);
    const btn = screen.getByRole("button");
    fireEvent.click(btn);
    // ripple element appears briefly — just ensure no crash
    await waitFor(() => {}, { timeout: 800 });
  });
});
