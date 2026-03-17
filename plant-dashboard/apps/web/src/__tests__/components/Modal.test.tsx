import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Modal } from '../../components/ui/Modal';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: {
      div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...p }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) =>
        React.createElement('div', p, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('Modal', () => {
  it('renders when isOpen=true', () => {
    render(<Modal isOpen onClose={vi.fn()} title="Test Modal"><p>Content</p></Modal>);
    expect(screen.getByText('Test Modal')).toBeInTheDocument();
    expect(screen.getByText('Content')).toBeInTheDocument();
  });

  it('does not render when isOpen=false', () => {
    render(<Modal isOpen={false} onClose={vi.fn()} title="Hidden"><p>Hidden content</p></Modal>);
    expect(screen.queryByText('Hidden')).not.toBeInTheDocument();
  });

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn();
    render(<Modal isOpen onClose={onClose} title="Modal" showClose />);
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal isOpen onClose={onClose}><p>Content</p></Modal>);
    // Click the backdrop (first fixed div with bg-black class)
    const backdrop = container.querySelector('.fixed.inset-0.z-50.bg-black\\/60');
    if (backdrop) fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});
