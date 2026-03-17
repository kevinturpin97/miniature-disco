import { useCallback } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { authService } from '../services/AuthService';
import { getService } from '../di/container';
import { HttpClientToken } from '../di/container';
import type { LoginInput, RegisterInput } from '../schemas';

export function useAuth() {
  const { user, tokens, isAuthenticated, isLoading, error, setUser, setTokens, setLoading, setError, logout: storeLogout } = useAuthStore();

  const initialize = useCallback(async () => {
    setLoading(true);
    try {
      const storedTokens = await authService.getStoredTokens();
      if (storedTokens && storedTokens.expiresAt > Date.now()) {
        const http = getService(HttpClientToken);
        http.setAuthToken(storedTokens.access);
        const user = await authService.getCurrentUser();
        setUser(user);
        setTokens(storedTokens);
      } else if (storedTokens?.refresh) {
        const newTokens = await authService.refreshToken(storedTokens.refresh);
        const http = getService(HttpClientToken);
        http.setAuthToken(newTokens.access);
        const user = await authService.getCurrentUser();
        setUser(user);
        setTokens(newTokens);
      }
    } catch {
      storeLogout();
    } finally {
      setLoading(false);
    }
  }, [setUser, setTokens, setLoading, storeLogout]);

  const login = useCallback(async (data: LoginInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.login(data);
      setUser(result.user);
      setTokens(result.tokens);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setUser, setTokens, setLoading, setError]);

  const register = useCallback(async (data: RegisterInput) => {
    setLoading(true);
    setError(null);
    try {
      const result = await authService.register({ email: data.email, password: data.password, name: data.name });
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Registration failed';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [setLoading, setError]);

  const logout = useCallback(async () => {
    setLoading(true);
    try {
      await authService.logout();
    } finally {
      storeLogout();
      setLoading(false);
    }
  }, [storeLogout, setLoading]);

  return { user, tokens, isAuthenticated, isLoading, error, login, register, logout, initialize };
}
