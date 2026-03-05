/**
 * Tests for EmptyState component.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders title and description", () => {
    render(<EmptyState title="No data" description="Nothing to show here." />);
    expect(screen.getByText("No data")).toBeDefined();
    expect(screen.getByText("Nothing to show here.")).toBeDefined();
  });

  it("renders action when provided", () => {
    render(
      <EmptyState
        title="Empty"
        action={<button>Create one</button>}
      />
    );
    expect(screen.getByRole("button", { name: "Create one" })).toBeDefined();
  });

  it("renders without description", () => {
    const { container } = render(<EmptyState title="No items" />);
    expect(container.querySelector("p.text-muted-foreground")).toBeNull();
  });
});
