import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CommandButton } from "../CommandButton";

describe("CommandButton", () => {
  it("renders ON state when isOn=true", () => {
    render(<CommandButton isOn name="Fan" onToggle={vi.fn()} />);
    expect(screen.getByText("ON")).toBeInTheDocument();
  });

  it("renders OFF state when isOn=false", () => {
    render(<CommandButton isOn={false} name="Fan" onToggle={vi.fn()} />);
    expect(screen.getByText("OFF")).toBeInTheDocument();
  });

  it("has correct aria-pressed for ON state", () => {
    render(<CommandButton isOn name="Fan" onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("has correct aria-pressed for OFF state", () => {
    render(<CommandButton isOn={false} name="Fan" onToggle={vi.fn()} />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "false");
  });

  it("calls onToggle when clicked", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<CommandButton isOn={false} name="Pump" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onToggle).toHaveBeenCalledTimes(1));
  });

  it("is disabled when disabled=true", () => {
    render(<CommandButton isOn name="Valve" onToggle={vi.fn()} disabled />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("shows pending state (aria-busy) while onToggle is pending", async () => {
    let resolve: () => void;
    const onToggle = vi.fn().mockReturnValue(new Promise<void>((r) => { resolve = r; }));
    render(<CommandButton isOn={false} name="Pump" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true"));
    resolve!();
  });

  it("shows ack state after successful toggle", async () => {
    const onToggle = vi.fn().mockResolvedValue(undefined);
    render(<CommandButton isOn={false} name="Pump" onToggle={onToggle} />);
    fireEvent.click(screen.getByRole("button"));
    // After resolve, button should not be aria-busy
    await waitFor(() => expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false"));
  });

  it("syncs external commandState", () => {
    const { rerender } = render(<CommandButton isOn name="Fan" onToggle={vi.fn()} commandState="pending" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    rerender(<CommandButton isOn name="Fan" onToggle={vi.fn()} commandState="ack" />);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "false");
  });
});
