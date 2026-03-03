/**
 * Authentication API calls.
 */

import client from "./client";
import type { AuthTokens, User } from "@/types";

interface RegisterPayload {
  username: string;
  email: string;
  password: string;
  password2: string;
}

interface LoginPayload {
  username: string;
  password: string;
}

export async function register(payload: RegisterPayload): Promise<User> {
  const { data } = await client.post<User>("/auth/register/", payload);
  return data;
}

export async function login(payload: LoginPayload): Promise<AuthTokens> {
  const { data } = await client.post<AuthTokens>("/auth/login/", payload);
  return data;
}

export async function refreshToken(refresh: string): Promise<AuthTokens> {
  const { data } = await client.post<AuthTokens>("/auth/refresh/", {
    refresh,
  });
  return data;
}

export async function logout(refresh: string): Promise<void> {
  await client.post("/auth/logout/", { refresh });
}

export async function getMe(): Promise<User> {
  const { data } = await client.get<User>("/auth/me/");
  return data;
}

export async function updateMe(
  payload: Partial<Pick<User, "first_name" | "last_name" | "email">>,
): Promise<User> {
  const { data } = await client.patch<User>("/auth/me/", payload);
  return data;
}
