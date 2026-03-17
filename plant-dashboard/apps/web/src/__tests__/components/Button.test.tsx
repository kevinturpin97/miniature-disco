import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Button } from '../../components/ui/Button';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: {
      div: ({ children, ...p }: React.HTMLAttributes<HTMLDivElement>) =>
        React.createElement('div', p, children),
      button: ({ children, whileTap: _wt, transition: _tr, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileTap?: unknown; transition?: unknown }) =>
        React.createElement('button', p, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('Button', () => {
  it('renders children', () => {
    render(<Button onAction={vi.fn()}>Click me</Button>);
    expect(screen.getByText('Click me')).toBeInTheDocument();
  });

  it('calls onAction when clicked', async () => {
    const onAction = vi.fn();
    render(<Button onAction={onAction}>Click</Button>);
    fireEvent.click(screen.getByText('Click'));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('is disabled when disabled=true', () => {
    render(<Button onAction={vi.fn()} disabled>Disabled</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('shows spinner when loading=true', () => {
    const { container } = render(<Button onAction={vi.fn()} loading>Loading</Button>);
    // The Loader2 spinner replaces the leftIcon (not the children text)
    // The button should be disabled and contain the spinner svg
    expect(screen.getByRole('button')).toBeDisabled();
    const svg = container.querySelector('svg.animate-spin');
    expect(svg).toBeInTheDocument();
  });

  it('does not call onAction when disabled', () => {
    const onAction = vi.fn();
    render(<Button onAction={onAction} disabled>Disabled</Button>);
    fireEvent.click(screen.getByRole('button'));
    expect(onAction).not.toHaveBeenCalled();
  });

  it('renders with fullWidth class', () => {
    render(<Button onAction={vi.fn()} fullWidth>Full</Button>);
    expect(screen.getByRole('button')).toHaveClass('w-full');
  });
});
