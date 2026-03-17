import { registerService, StorageToken, RouterToken, HttpClientToken, NotificationToken, ImagePickerToken } from '@core/di/container';
import { WebStorage } from './storage/WebStorage';
import { WebRouter } from './router/WebRouter';
import { createAxiosHttpClient } from './http/AxiosHttpClient';
import { WebNotificationService } from './notifications/WebNotificationService';
import { WebImagePicker } from './images/WebImagePicker';

export function bootstrapWeb() {
  const baseURL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000';
  registerService(StorageToken, WebStorage);
  registerService(RouterToken, WebRouter);
  registerService(HttpClientToken, createAxiosHttpClient(baseURL));
  registerService(NotificationToken, WebNotificationService);
  registerService(ImagePickerToken, WebImagePicker);
}
