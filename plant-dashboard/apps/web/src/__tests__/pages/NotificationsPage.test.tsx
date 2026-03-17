import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import { NotificationsPage } from '../../pages/NotificationsPage';

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

describe('NotificationsPage', () => {
  it('shows empty state when no notifications', () => {
    useNotificationsStore.setState({ notifications: [], unreadCount: 0, isOpen: false });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('shows notifications when present', () => {
    useNotificationsStore.setState({
      notifications: [{
        id: 'n1', type: 'system', title: 'Test Alert', message: 'A test message',
        isRead: false, createdAt: new Date().toISOString(),
      }],
      unreadCount: 1, isOpen: false,
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(screen.getByText('Test Alert')).toBeInTheDocument();
  });

  it('shows mark all read button when unread > 0', () => {
    useNotificationsStore.setState({
      notifications: [{ id: 'n1', type: 'system', title: 'X', message: 'Y', isRead: false, createdAt: new Date().toISOString() }],
      unreadCount: 1, isOpen: false,
    });
    render(<MemoryRouter><NotificationsPage /></MemoryRouter>);
    expect(screen.getByText(/mark all/i)).toBeInTheDocument();
  });
});
