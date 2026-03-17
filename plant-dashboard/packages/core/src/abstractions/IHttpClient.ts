/** Platform-agnostic HTTP client interface */
export interface RequestConfig {
  headers?: Record<string, string>;
  params?: Record<string, unknown>;
  timeout?: number;
  signal?: AbortSignal;
}

export interface IHttpClient {
  get<T>(url: string, config?: RequestConfig): Promise<T>;
  post<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T>;
  put<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T>;
  patch<T>(url: string, data?: unknown, config?: RequestConfig): Promise<T>;
  delete<T>(url: string, config?: RequestConfig): Promise<T>;
  setAuthToken(token: string | null): void;
  addRequestInterceptor(fn: (config: RequestConfig) => RequestConfig): () => void;
  addResponseInterceptor(onSuccess: (data: unknown) => unknown, onError: (error: unknown) => unknown): () => void;
}
