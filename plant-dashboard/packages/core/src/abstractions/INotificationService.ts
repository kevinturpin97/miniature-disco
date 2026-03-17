export type NotificationPermission = 'granted' | 'denied' | 'default';

export interface LocalNotification {
  id: string;
  title: string;
  body: string;
  scheduledAt?: Date;
  data?: Record<string, unknown>;
}

export interface INotificationService {
  getPermission(): Promise<NotificationPermission>;
  requestPermission(): Promise<NotificationPermission>;
  show(notification: LocalNotification): Promise<void>;
  schedule(notification: LocalNotification): Promise<void>;
  cancel(id: string): Promise<void>;
  cancelAll(): Promise<void>;
}
