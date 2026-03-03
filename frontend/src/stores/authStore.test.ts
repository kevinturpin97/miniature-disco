/**
 * Tests for the auth Zustand store.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "./authStore";

// Mock the auth API module
vi.mock("@/api/auth", () => ({
  login: vi.fn(),
  register: vi.fn(),
  logout: vi.fn(),
  getMe: vi.fn(),
}));

import * as authApi from "@/api/auth";

const mockedLogin = vi.mocked(authApi.login);
const mockedRegister = vi.mocked(authApi.register);
const mockedLogout = vi.mocked(authApi.logout);
const mockedGetMe = vi.mocked(authApi.getMe);

describe("authStore", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Reset store state
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: true,
    });
  });

  it("has correct initial state", () => {
    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(true);
  });

  describe("login", () => {
    it("stores tokens and fetches user on success", async () => {
      mockedLogin.mockResolvedValue({ access: "access-123", refresh: "refresh-456" });
      mockedGetMe.mockResolvedValue({
        id: 1,
        username: "testuser",
        email: "test@example.com",
        first_name: "",
        last_name: "",
      });

      await useAuthStore.getState().login("testuser", "password123");

      expect(mockedLogin).toHaveBeenCalledWith({ username: "testuser", password: "password123" });
      expect(localStorage.getItem("access_token")).toBe("access-123");
      expect(localStorage.getItem("refresh_token")).toBe("refresh-456");
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().user?.username).toBe("testuser");
    });

    it("propagates error on failure", async () => {
      mockedLogin.mockRejectedValue(new Error("Invalid credentials"));

      await expect(useAuthStore.getState().login("bad", "bad")).rejects.toThrow("Invalid credentials");
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(localStorage.getItem("access_token")).toBeNull();
    });
  });

  describe("register", () => {
    it("calls register API", async () => {
      mockedRegister.mockResolvedValue(undefined as never);

      await useAuthStore.getState().register("newuser", "new@example.com", "password123");

      expect(mockedRegister).toHaveBeenCalledWith({
        username: "newuser",
        email: "new@example.com",
        password: "password123",
      });
    });
  });

  describe("logout", () => {
    it("clears tokens and resets state", async () => {
      localStorage.setItem("access_token", "access-123");
      localStorage.setItem("refresh_token", "refresh-456");
      useAuthStore.setState({ user: { id: 1, username: "u", email: "e", first_name: "", last_name: "" }, isAuthenticated: true });

      mockedLogout.mockResolvedValue(undefined as never);

      await useAuthStore.getState().logout();

      expect(localStorage.getItem("access_token")).toBeNull();
      expect(localStorage.getItem("refresh_token")).toBeNull();
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("clears state even when API logout fails", async () => {
      localStorage.setItem("access_token", "access-123");
      localStorage.setItem("refresh_token", "refresh-456");
      useAuthStore.setState({ isAuthenticated: true });

      mockedLogout.mockRejectedValue(new Error("Network error"));

      await useAuthStore.getState().logout();

      expect(localStorage.getItem("access_token")).toBeNull();
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });
  });

  describe("initialize", () => {
    it("fetches user when token exists", async () => {
      localStorage.setItem("access_token", "stored-token");
      mockedGetMe.mockResolvedValue({
        id: 1,
        username: "testuser",
        email: "t@e.com",
        first_name: "",
        last_name: "",
      });

      await useAuthStore.getState().initialize();

      expect(mockedGetMe).toHaveBeenCalled();
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
      expect(useAuthStore.getState().isLoading).toBe(false);
    });

    it("sets isLoading false without fetching when no token", async () => {
      await useAuthStore.getState().initialize();

      expect(mockedGetMe).not.toHaveBeenCalled();
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    it("clears auth state when fetchUser fails", async () => {
      localStorage.setItem("access_token", "expired-token");
      mockedGetMe.mockRejectedValue(new Error("401"));

      await useAuthStore.getState().initialize();

      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().isLoading).toBe(false);
      expect(localStorage.getItem("access_token")).toBeNull();
    });
  });
});
