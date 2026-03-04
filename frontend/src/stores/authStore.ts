/**
 * Authentication store (Zustand).
 *
 * Manages JWT tokens, user state, organization context, login/logout,
 * and auto-refresh.
 */

import { create } from "zustand";
import type { Organization, User } from "@/types";
import * as authApi from "@/api/auth";
import * as orgApi from "@/api/organizations";

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  /** All organizations the user belongs to. */
  organizations: Organization[];
  /** Currently active organization. */
  currentOrganization: Organization | null;

  login: (username: string, password: string) => Promise<void>;
  register: (
    username: string,
    email: string,
    password: string,
    password2: string,
  ) => Promise<void>;
  logout: () => Promise<void>;
  fetchUser: () => Promise<void>;
  fetchOrganizations: () => Promise<void>;
  switchOrganization: (slug: string) => void;
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  organizations: [],
  currentOrganization: null,

  login: async (username, password) => {
    const tokens = await authApi.login({ username, password });
    localStorage.setItem("access_token", tokens.access);
    localStorage.setItem("refresh_token", tokens.refresh);
    set({ isAuthenticated: true });
    await get().fetchUser();
    await get().fetchOrganizations();
  },

  register: async (username, email, password, password2) => {
    await authApi.register({ username, email, password, password2 });
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
      localStorage.removeItem("current_org_slug");
      set({
        user: null,
        isAuthenticated: false,
        organizations: [],
        currentOrganization: null,
      });
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

  fetchOrganizations: async () => {
    try {
      const orgs = await orgApi.listOrganizations();
      const savedSlug = localStorage.getItem("current_org_slug");
      const current =
        orgs.find((o) => o.slug === savedSlug) || orgs[0] || null;
      set({ organizations: orgs, currentOrganization: current });
      if (current) {
        localStorage.setItem("current_org_slug", current.slug);
      }
    } catch {
      set({ organizations: [], currentOrganization: null });
    }
  },

  switchOrganization: (slug: string) => {
    const orgs = get().organizations;
    const org = orgs.find((o) => o.slug === slug) || null;
    set({ currentOrganization: org });
    if (org) {
      localStorage.setItem("current_org_slug", slug);
    }
  },

  initialize: async () => {
    const token = localStorage.getItem("access_token");
    if (token) {
      await get().fetchUser();
      if (get().isAuthenticated) {
        await get().fetchOrganizations();
      }
    }
    set({ isLoading: false });
  },
}));
