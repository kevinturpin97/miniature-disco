/** Lightweight DI container for platform-specific implementations */
type ServiceToken<T> = symbol & { __type: T };

const _registry = new Map<symbol, unknown>();

export function createToken<T>(name: string): ServiceToken<T> {
  return Symbol(name) as ServiceToken<T>;
}

export function registerService<T>(token: ServiceToken<T>, implementation: T): void {
  _registry.set(token, implementation);
}

export function getService<T>(token: ServiceToken<T>): T {
  const impl = _registry.get(token);
  if (!impl) throw new Error(`Service ${String(token)} not registered. Call registerService() in bootstrap.ts`);
  return impl as T;
}

export function hasService<T>(token: ServiceToken<T>): boolean {
  return _registry.has(token);
}

export function clearRegistry(): void {
  _registry.clear();
}

// Service tokens
import type { IStorage } from '../abstractions/IStorage';
import type { IRouter } from '../abstractions/IRouter';
import type { IHttpClient } from '../abstractions/IHttpClient';
import type { INotificationService } from '../abstractions/INotificationService';
import type { IImagePicker } from '../abstractions/IImagePicker';

export const StorageToken = createToken<IStorage>('IStorage');
export const RouterToken = createToken<IRouter>('IRouter');
export const HttpClientToken = createToken<IHttpClient>('IHttpClient');
export const NotificationToken = createToken<INotificationService>('INotificationService');
export const ImagePickerToken = createToken<IImagePicker>('IImagePicker');
