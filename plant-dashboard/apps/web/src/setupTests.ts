import '@testing-library/jest-dom';
import { clearRegistry } from '@core/di/container';
import { afterEach, beforeEach } from 'vitest';

// Mock DI services for tests
import { WebStorage } from './storage/WebStorage';
import { WebRouter } from './router/WebRouter';
import { createAxiosHttpClient } from './http/AxiosHttpClient';
import { WebNotificationService } from './notifications/WebNotificationService';
import { WebImagePicker } from './images/WebImagePicker';
import { registerService, StorageToken, RouterToken, HttpClientToken, NotificationToken, ImagePickerToken } from '@core/di/container';

beforeEach(() => {
  clearRegistry();
  registerService(StorageToken, WebStorage);
  registerService(RouterToken, WebRouter);
  registerService(HttpClientToken, createAxiosHttpClient('http://localhost:8000'));
  registerService(NotificationToken, WebNotificationService);
  registerService(ImagePickerToken, WebImagePicker);
});

afterEach(() => {
  clearRegistry();
  localStorage.clear();
});
