/**
 * Axios HTTP client with JWT interceptors.
 *
 * - Attaches the access token to every request via Authorization header.
 * - On 401 responses, attempts a silent token refresh and retries the request.
 * - On 429 responses, retries with exponential backoff (up to 3 attempts).
 * - Redirects to /login when refresh fails.
 */

import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import type { AuthTokens } from "@/types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "/api";

const MAX_RETRY_429 = 3;
const BASE_DELAY_MS = 1000;

const client = axios.create({
  baseURL: API_BASE_URL,
  headers: { "Content-Type": "application/json" },
  timeout: 15_000,
});

// ── Request interceptor ─────────────────────────────────────────

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem("access_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor (refresh on 401, retry on 429) ─────────

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  failedQueue = [];
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

client.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
      _retryCount429?: number;
    };

    // ── 429 Too Many Requests — retry with exponential backoff ──
    if (error.response?.status === 429) {
      const retryCount = originalRequest._retryCount429 ?? 0;
      if (retryCount < MAX_RETRY_429) {
        originalRequest._retryCount429 = retryCount + 1;
        const retryAfter = error.response.headers["retry-after"];
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : BASE_DELAY_MS * Math.pow(2, retryCount);
        await delay(waitMs);
        return client(originalRequest);
      }
      return Promise.reject(error);
    }

    // ── 401 Unauthorized — attempt token refresh ────────────────
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    if (isRefreshing) {
      return new Promise<string>((resolve, reject) => {
        failedQueue.push({ resolve, reject });
      })
        .then((token) => {
          if (originalRequest.headers) {
            originalRequest.headers.Authorization = `Bearer ${token}`;
          }
          return client(originalRequest);
        })
        .catch((err) => Promise.reject(err));
    }

    originalRequest._retry = true;
    isRefreshing = true;

    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) {
      isRefreshing = false;
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
      return Promise.reject(error);
    }

    try {
      const { data } = await axios.post<AuthTokens>(
        `${API_BASE_URL}/auth/refresh/`,
        { refresh: refreshToken },
      );
      localStorage.setItem("access_token", data.access);
      localStorage.setItem("refresh_token", data.refresh);
      processQueue(null, data.access);

      if (originalRequest.headers) {
        originalRequest.headers.Authorization = `Bearer ${data.access}`;
      }
      return client(originalRequest);
    } catch (refreshError) {
      processQueue(refreshError, null);
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      window.location.href = "/login";
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

export default client;
