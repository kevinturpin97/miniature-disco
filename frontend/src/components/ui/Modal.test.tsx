/**
 * Tests for the Modal component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Modal } from "./Modal";

describe("Modal", () => {
  it("does not render anything when open is false", () => {
    const { container } = render(
      <Modal open={false} onClose={vi.fn()} title="Test Modal">
        <p>Modal content</p>
      </Modal>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("renders title and children when open is true", () => {
    render(
      <Modal open={true} onClose={vi.fn()} title="My Title">
        <p>Hello from modal</p>
      </Modal>,
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("Hello from modal")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Closable">
        <p>Content</p>
      </Modal>,
    );

    const closeButton = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeButton);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Escape Test">
        <p>Content</p>
      </Modal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when clicking the overlay background", () => {
    const onClose = vi.fn();
    render(
      <Modal open={true} onClose={onClose} title="Overlay Test">
        <p>Content</p>
      </Modal>,
    );

    // The overlay is the outermost fixed div; click it directly
    const overlay = screen.getByText("Overlay Test").closest(".fixed");
    expect(overlay).not.toBeNull();
    fireEvent.click(overlay!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
