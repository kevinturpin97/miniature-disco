import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from '@core/stores/useAuthStore';
import { usePlantsStore } from '@core/stores/usePlantsStore';
import { useNotificationsStore } from '@core/stores/useNotificationsStore';
import { useSettingsStore } from '@core/stores/useSettingsStore';
import type { Plant, AppNotification } from '@core/types';

const mockPlant = (overrides: Partial<Plant> = {}): Plant => ({
  id: 'p1', name: 'Monstera', healthScore: 80, healthStatus: 'good',
  images: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  ...overrides,
});

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, tokens: null, isAuthenticated: false, isLoading: true, error: null });
  });

  it('sets user and isAuthenticated', () => {
    const user = { id: '1', email: 'test@test.com', name: 'Test', createdAt: '', updatedAt: '' };
    useAuthStore.getState().setUser(user);
    expect(useAuthStore.getState().user).toEqual(user);
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('clears state on logout', () => {
    useAuthStore.getState().setUser({ id: '1', email: 'test@test.com', name: 'Test', createdAt: '', updatedAt: '' });
    useAuthStore.getState().logout();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('sets error', () => {
    useAuthStore.getState().setError('Login failed');
    expect(useAuthStore.getState().error).toBe('Login failed');
  });
});

describe('usePlantsStore', () => {
  beforeEach(() => {
    usePlantsStore.setState({ plants: [], filteredPlants: [], filter: {}, isLoading: false, error: null, selectedPlant: null });
  });

  it('sets plants and filteredPlants', () => {
    const plants = [mockPlant({ id: 'p1' }), mockPlant({ id: 'p2' })];
    usePlantsStore.getState().setPlants(plants);
    expect(usePlantsStore.getState().plants).toHaveLength(2);
    expect(usePlantsStore.getState().filteredPlants).toHaveLength(2);
  });

  it('filters plants by search', () => {
    const plants = [mockPlant({ name: 'Monstera' }), mockPlant({ id: 'p2', name: 'Cactus' })];
    usePlantsStore.getState().setPlants(plants);
    usePlantsStore.getState().setFilter({ search: 'mons' });
    expect(usePlantsStore.getState().filteredPlants).toHaveLength(1);
    expect(usePlantsStore.getState().filteredPlants[0].name).toBe('Monstera');
  });

  it('sorts plants by name', () => {
    const plants = [mockPlant({ id: 'p1', name: 'Zebra' }), mockPlant({ id: 'p2', name: 'Apple' })];
    usePlantsStore.getState().setPlants(plants);
    usePlantsStore.getState().setFilter({ sortBy: 'name', sortOrder: 'asc' });
    expect(usePlantsStore.getState().filteredPlants[0].name).toBe('Apple');
  });

  it('adds a plant', () => {
    usePlantsStore.getState().addPlant(mockPlant());
    expect(usePlantsStore.getState().plants).toHaveLength(1);
  });

  it('removes a plant', () => {
    usePlantsStore.getState().setPlants([mockPlant({ id: 'p1' }), mockPlant({ id: 'p2' })]);
    usePlantsStore.getState().removePlant('p1');
    expect(usePlantsStore.getState().plants).toHaveLength(1);
    expect(usePlantsStore.getState().plants[0].id).toBe('p2');
  });

  it('updates a plant', () => {
    usePlantsStore.getState().setPlants([mockPlant({ id: 'p1', healthScore: 50 })]);
    usePlantsStore.getState().updatePlant(mockPlant({ id: 'p1', healthScore: 90 }));
    expect(usePlantsStore.getState().plants[0].healthScore).toBe(90);
  });
});

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.setState({ notifications: [], unreadCount: 0, isOpen: false });
  });

  const mockNotif = (overrides: Partial<AppNotification> = {}): AppNotification => ({
    id: 'n1', type: 'system', title: 'Test', message: 'Test msg', isRead: false, createdAt: new Date().toISOString(), ...overrides,
  });

  it('adds notification and increments unread count', () => {
    useNotificationsStore.getState().addNotification(mockNotif());
    expect(useNotificationsStore.getState().unreadCount).toBe(1);
  });

  it('marks single as read', () => {
    useNotificationsStore.getState().setNotifications([mockNotif({ id: 'n1', isRead: false })]);
    useNotificationsStore.getState().markAsRead('n1');
    expect(useNotificationsStore.getState().notifications[0].isRead).toBe(true);
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
  });

  it('marks all as read', () => {
    useNotificationsStore.getState().setNotifications([mockNotif({ id: 'n1' }), mockNotif({ id: 'n2' })]);
    useNotificationsStore.getState().markAllAsRead();
    expect(useNotificationsStore.getState().unreadCount).toBe(0);
    expect(useNotificationsStore.getState().notifications.every(n => n.isRead)).toBe(true);
  });
});

describe('useSettingsStore', () => {
  it('sets theme', () => {
    useSettingsStore.getState().setTheme('light');
    expect(useSettingsStore.getState().theme).toBe('light');
  });

  it('sets language', () => {
    useSettingsStore.getState().setLanguage('en');
    expect(useSettingsStore.getState().language).toBe('en');
  });
});
