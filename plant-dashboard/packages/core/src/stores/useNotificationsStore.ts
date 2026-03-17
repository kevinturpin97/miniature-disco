import { create } from 'zustand';
import type { AppNotification } from '../types';

interface NotificationsState {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  setNotifications: (notifications: AppNotification[]) => void;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  addNotification: (notification: AppNotification) => void;
  setOpen: (open: boolean) => void;
}

export const useNotificationsStore = create<NotificationsState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  setNotifications: (notifications) => set({ notifications, unreadCount: notifications.filter(n => !n.isRead).length }),
  markAsRead: (id) => {
    const notifications = get().notifications.map(n => n.id === id ? { ...n, isRead: true } : n);
    set({ notifications, unreadCount: notifications.filter(n => !n.isRead).length });
  },
  markAllAsRead: () => {
    const notifications = get().notifications.map(n => ({ ...n, isRead: true }));
    set({ notifications, unreadCount: 0 });
  },
  addNotification: (notification) => {
    const notifications = [notification, ...get().notifications];
    set({ notifications, unreadCount: notifications.filter(n => !n.isRead).length });
  },
  setOpen: (isOpen) => set({ isOpen }),
}));
