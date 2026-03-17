import { getService } from '../di/container';
import { HttpClientToken, StorageToken } from '../di/container';
import type { AppSettings, User } from '../types';
import type { SettingsProfileInput, SettingsNotificationsInput } from '../schemas';

export class SettingsService {
  async getSettings(): Promise<AppSettings> {
    const http = getService(HttpClientToken);
    return http.get<AppSettings>('/api/settings/');
  }

  async updateProfile(data: SettingsProfileInput): Promise<User> {
    const http = getService(HttpClientToken);
    return http.patch<User>('/api/auth/me/', data);
  }

  async updateAppearance(theme: AppSettings['theme'], language: AppSettings['language']): Promise<void> {
    const storage = getService(StorageToken);
    await storage.set('app_theme', theme);
    await storage.set('app_language', language);
  }

  async updateNotifications(data: SettingsNotificationsInput): Promise<void> {
    const http = getService(HttpClientToken);
    await http.patch('/api/settings/notifications/', data);
  }

  async exportData(): Promise<Blob> {
    const http = getService(HttpClientToken);
    return http.get<Blob>('/api/settings/export/');
  }

  async importData(file: File): Promise<void> {
    const http = getService(HttpClientToken);
    const formData = new FormData();
    formData.append('file', file);
    await http.post('/api/settings/import/', formData);
  }

  async deleteAccount(password: string): Promise<void> {
    const http = getService(HttpClientToken);
    await http.post('/api/settings/delete-account/', { password });
  }
}

export const settingsService = new SettingsService();
