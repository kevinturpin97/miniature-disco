import { getService } from '../di/container';
import { StorageToken, HttpClientToken } from '../di/container';
import type { User, AuthTokens } from '../types';
import type { LoginInput, RegisterInput } from '../schemas';

const TOKEN_KEY = 'auth_tokens';
const USER_KEY = 'auth_user';

export class AuthService {
  async login(data: LoginInput): Promise<{ user: User; tokens: AuthTokens }> {
    const http = getService(HttpClientToken);
    const result = await http.post<{ user: User; tokens: AuthTokens }>('/api/auth/login/', {
      email: data.email,
      password: data.password,
    });
    await this.persistSession(result.tokens, result.user, data.rememberMe);
    return result;
  }

  async register(data: Omit<RegisterInput, 'confirmPassword'>): Promise<{ user: User; tokens: AuthTokens }> {
    const http = getService(HttpClientToken);
    return http.post<{ user: User; tokens: AuthTokens }>('/api/auth/register/', {
      email: data.email,
      password: data.password,
      name: data.name,
    });
  }

  async forgotPassword(email: string): Promise<void> {
    const http = getService(HttpClientToken);
    await http.post('/api/auth/forgot-password/', { email });
  }

  async resetPassword(token: string, password: string): Promise<void> {
    const http = getService(HttpClientToken);
    await http.post('/api/auth/reset-password/', { token, password });
  }

  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const http = getService(HttpClientToken);
    return http.post<AuthTokens>('/api/auth/refresh/', { refresh: refreshToken });
  }

  async logout(): Promise<void> {
    const http = getService(HttpClientToken);
    const storage = getService(StorageToken);
    try {
      const tokens = await this.getStoredTokens();
      if (tokens) await http.post('/api/auth/logout/', { refresh: tokens.refresh });
    } finally {
      await storage.remove(TOKEN_KEY);
      await storage.remove(USER_KEY);
      http.setAuthToken(null);
    }
  }

  async getStoredTokens(): Promise<AuthTokens | null> {
    const storage = getService(StorageToken);
    return storage.get<AuthTokens>(TOKEN_KEY);
  }

  async getStoredUser(): Promise<User | null> {
    const storage = getService(StorageToken);
    return storage.get<User>(USER_KEY);
  }

  async getCurrentUser(): Promise<User> {
    const http = getService(HttpClientToken);
    return http.get<User>('/api/auth/me/');
  }

  private async persistSession(tokens: AuthTokens, user: User, persistent = false): Promise<void> {
    const storage = getService(StorageToken);
    const http = getService(HttpClientToken);
    if (persistent) {
      await storage.set(TOKEN_KEY, tokens);
      await storage.set(USER_KEY, user);
    }
    http.setAuthToken(tokens.access);
  }
}

export const authService = new AuthService();
