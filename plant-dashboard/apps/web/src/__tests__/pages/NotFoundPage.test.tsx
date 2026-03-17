import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NotFoundPage } from '../../pages/NotFoundPage';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: {
      div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, ...p }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown }) =>
        React.createElement('div', p, children),
      button: ({ children, whileTap: _wt, transition: _tr, initial: _i, animate: _a, exit: _e, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileTap?: unknown; transition?: unknown; initial?: unknown; animate?: unknown; exit?: unknown }) =>
        React.createElement('button', p, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => mockNavigate };
});

describe('NotFoundPage', () => {
  it('renders 404 message', () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    expect(screen.getByText('404')).toBeInTheDocument();
    expect(screen.getByText('Page not found')).toBeInTheDocument();
  });

  it('has a back to dashboard button', () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    const btn = screen.getByText('Back to Dashboard');
    expect(btn).toBeInTheDocument();
  });

  it('navigates to /dashboard on button click', () => {
    render(<MemoryRouter><NotFoundPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Back to Dashboard'));
    expect(mockNavigate).toHaveBeenCalledWith('/dashboard');
  });
});
