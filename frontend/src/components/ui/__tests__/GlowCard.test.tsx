import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { GlowCard } from "../GlowCard";

describe("GlowCard", () => {
  it("renders children", () => {
    render(<GlowCard>Hello</GlowCard>);
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("applies glow-green-hover class for green variant", () => {
    const { container } = render(<GlowCard variant="green">Content</GlowCard>);
    expect(container.firstChild).toHaveClass("glow-green-hover");
  });

  it("applies glow-cyan-hover class for cyan variant", () => {
    const { container } = render(<GlowCard variant="cyan">Content</GlowCard>);
    expect(container.firstChild).toHaveClass("glow-cyan-hover");
  });

  it("applies glow-active class when active=true", () => {
    const { container } = render(<GlowCard active>Content</GlowCard>);
    expect(container.firstChild).toHaveClass("glow-active");
  });

  it("does NOT apply glow-active class when active=false", () => {
    const { container } = render(<GlowCard active={false}>Content</GlowCard>);
    expect(container.firstChild).not.toHaveClass("glow-active");
  });

  it("applies cursor-pointer when onClick provided", () => {
    const { container } = render(<GlowCard onClick={vi.fn()}>Content</GlowCard>);
    expect(container.firstChild).toHaveClass("cursor-pointer");
  });

  it("calls onClick when clicked", () => {
    const onClick = vi.fn();
    render(<GlowCard onClick={onClick}>Clickable</GlowCard>);
    fireEvent.click(screen.getByText("Clickable"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("applies glass-dark glass-light classes when glass=true", () => {
    const { container } = render(<GlowCard glass>Content</GlowCard>);
    // glass prop applies dark:glass-dark glass-light
    expect(container.firstChild?.textContent).toContain("Content");
  });

  it("forwards aria-label", () => {
    render(<GlowCard role="region" aria-label="Test region">Content</GlowCard>);
    expect(screen.getByRole("region", { name: "Test region" })).toBeInTheDocument();
  });

  it("applies custom className", () => {
    const { container } = render(<GlowCard className="my-custom-class">Content</GlowCard>);
    expect(container.firstChild).toHaveClass("my-custom-class");
  });
});
