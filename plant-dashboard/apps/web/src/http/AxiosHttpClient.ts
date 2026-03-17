import axios, { type AxiosInstance, type AxiosRequestConfig } from 'axios';
import type { IHttpClient, RequestConfig } from '@core/abstractions/IHttpClient';

export function createAxiosHttpClient(baseURL: string): IHttpClient {
  const instance: AxiosInstance = axios.create({
    baseURL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30_000,
  });

  let authToken: string | null = null;

  instance.interceptors.request.use((config) => {
    if (authToken) config.headers.Authorization = `Bearer ${authToken}`;
    return config;
  });

  const toAxiosConfig = (config?: RequestConfig): AxiosRequestConfig => ({
    headers: config?.headers,
    params: config?.params,
    timeout: config?.timeout,
    signal: config?.signal,
  });

  return {
    get: <T>(url: string, config?: RequestConfig) => instance.get<T>(url, toAxiosConfig(config)).then(r => r.data),
    post: <T>(url: string, data?: unknown, config?: RequestConfig) => instance.post<T>(url, data, toAxiosConfig(config)).then(r => r.data),
    put: <T>(url: string, data?: unknown, config?: RequestConfig) => instance.put<T>(url, data, toAxiosConfig(config)).then(r => r.data),
    patch: <T>(url: string, data?: unknown, config?: RequestConfig) => instance.patch<T>(url, data, toAxiosConfig(config)).then(r => r.data),
    delete: <T>(url: string, config?: RequestConfig) => instance.delete<T>(url, toAxiosConfig(config)).then(r => r.data),
    setAuthToken: (token) => { authToken = token; },
    addRequestInterceptor: (fn) => {
      const id = instance.interceptors.request.use((c) => {
        const updated = fn(c as RequestConfig);
        if (updated.headers) {
          Object.assign(c.headers, updated.headers);
        }
        return c;
      });
      return () => instance.interceptors.request.eject(id);
    },
    addResponseInterceptor: (onSuccess, onError) => {
      const id = instance.interceptors.response.use(r => { onSuccess(r.data); return r; }, (e) => { onError(e); return Promise.reject(e); });
      return () => instance.interceptors.response.eject(id);
    },
  };
}
