import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '../../components/ui/Badge';

describe('Badge', () => {
  it('renders children', () => {
    render(<Badge>Active</Badge>);
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('renders dot when dot=true', () => {
    const { container } = render(<Badge dot variant="success">Online</Badge>);
    // The dot is a span with w-1.5 h-1.5 rounded-full
    const dot = container.querySelector('span span');
    expect(dot).toBeTruthy();
    expect(dot).toHaveClass('rounded-full');
  });

  it('applies success variant classes', () => {
    const { container } = render(<Badge variant="success">OK</Badge>);
    expect(container.firstChild).toHaveClass('text-neon-green');
  });

  it('applies danger variant classes', () => {
    const { container } = render(<Badge variant="danger">Error</Badge>);
    expect(container.firstChild).toHaveClass('text-red-400');
  });
});
