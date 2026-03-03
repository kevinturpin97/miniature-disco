/**
 * Authentication store (Zustand).
 *
 * Manages JWT tokens, user state, login/logout, and auto-refresh.
 */

import { create } from "zustand";
import type { User } from "@/types";
import * as authApi from "@/api/auth";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username, password) => {
    const tokens = await authApi.login({ username, password });
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    set({ isAuthenticated: true });
    await get().fetchUser();
  },

  register: async (username, email, password) => {
    await authApi.register({ username, email, password });
  },

  logout: async () => {
    const refresh = localStorage.getItem("refresh_token");
    try {
      if (refresh) {
        await authApi.logout(refresh);
      }
    } catch {
      // Ignore errors during logout — token may already be expired
    } finally {
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
      set({ user: null, isAuthenticated: false });
    }
  },

  fetchUser: async () => {
    try {
      const user = await authApi.getMe();
      set({ user, isAuthenticated: true });
    } catch {
      set({ user: null, isAuthenticated: false });
      localStorage.removeItem("access_token");
      localStorage.removeItem("refresh_token");
    }
  },

  initialize: async () => {
    const token = localStorage.getItem("access_token");
    if (token) {
      await get().fetchUser();
    }
    set({ isLoading: false });
  },
}));
