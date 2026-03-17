import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SettingsPage } from '../../pages/SettingsPage';

vi.mock('framer-motion', async () => {
  const React = await import('react');
  return {
    motion: {
      div: ({ children, initial: _i, animate: _a, exit: _e, transition: _t, layout: _l, layoutId: _lid, ...p }: React.HTMLAttributes<HTMLDivElement> & { initial?: unknown; animate?: unknown; exit?: unknown; transition?: unknown; layout?: unknown; layoutId?: unknown }) =>
        React.createElement('div', p, children),
      button: ({ children, whileTap: _wt, transition: _tr, initial: _i, animate: _a, exit: _e, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & { whileTap?: unknown; transition?: unknown; initial?: unknown; animate?: unknown; exit?: unknown }) =>
        React.createElement('button', p, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
  };
});

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom');
  return { ...actual, useNavigate: () => vi.fn() };
});

describe('SettingsPage', () => {
  it('renders profile tab by default', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    // 'Profile' appears as both a tab label and a section heading
    const profileElements = screen.getAllByText('Profile');
    expect(profileElements.length).toBeGreaterThanOrEqual(1);
  });

  it('shows appearance tab on click', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Appearance'));
    expect(screen.getByText('Theme')).toBeInTheDocument();
  });

  it('shows notifications tab on click', () => {
    render(<MemoryRouter><SettingsPage /></MemoryRouter>);
    fireEvent.click(screen.getByText('Notifications'));
    expect(screen.getByText('Watering reminders')).toBeInTheDocument();
  });
});
