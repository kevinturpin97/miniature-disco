import type { INotificationService, LocalNotification, NotificationPermission } from '@core/abstractions/INotificationService';

export const WebNotificationService: INotificationService = {
  async getPermission() {
    if (!('Notification' in window)) return 'denied';
    return Notification.permission as NotificationPermission;
  },
  async requestPermission() {
    if (!('Notification' in window)) return 'denied';
    return Notification.requestPermission() as Promise<NotificationPermission>;
  },
  async show(n: LocalNotification) {
    const perm = await this.getPermission();
    if (perm === 'granted') new Notification(n.title, { body: n.body });
  },
  async schedule(n: LocalNotification) {
    if (!n.scheduledAt) return this.show(n);
    const delay = n.scheduledAt.getTime() - Date.now();
    if (delay > 0) setTimeout(() => this.show(n), delay);
  },
  async cancel(_id: string) { /* browser notifications can't be cancelled by id */ },
  async cancelAll() { /* not supported in browser */ },
};
