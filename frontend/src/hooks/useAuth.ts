/**
 * Auth convenience hook.
 *
 * Re-exports commonly used auth store selectors.
 */

import { useAuthStore } from "@/stores/authStore";

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const isLoading = useAuthStore((s) => s.isLoading);
  const logout = useAuthStore((s) => s.logout);

  return { user, isAuthenticated, isLoading, logout };
}
