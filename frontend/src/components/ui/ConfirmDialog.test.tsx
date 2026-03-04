/**
 * Tests for the ConfirmDialog component.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ConfirmDialog } from "./ConfirmDialog";

const defaultProps = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  title: "Confirm Deletion",
  message: "Are you sure you want to delete this item?",
};

function renderDialog(overrides: Partial<typeof defaultProps & { loading: boolean }> = {}) {
  const props = { ...defaultProps, ...overrides };
  return render(<ConfirmDialog {...props} />);
}

describe("ConfirmDialog", () => {
  it("does not render when open is false", () => {
    const { container } = renderDialog({ open: false });
    expect(container.innerHTML).toBe("");
  });

  it("renders title, message, Cancel and Delete buttons when open", () => {
    renderDialog();
    expect(screen.getByText("Confirm Deletion")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to delete this item?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("calls onClose when Cancel is clicked", () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onConfirm when Delete is clicked", () => {
    const onConfirm = vi.fn();
    renderDialog({ onConfirm });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows '...' and disables buttons when loading is true", () => {
    renderDialog({ loading: true });

    const cancelButton = screen.getByRole("button", { name: "Cancel" });
    const loadingButton = screen.getByRole("button", { name: "..." });

    expect(cancelButton).toBeDisabled();
    expect(loadingButton).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
