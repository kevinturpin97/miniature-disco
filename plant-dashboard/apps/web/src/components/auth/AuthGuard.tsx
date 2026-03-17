import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@core/hooks/useAuth';
import { getService } from '@core/di/container';
import { RouterToken } from '@core/di/container';
import { Spinner } from '../ui/Spinner';
import type { ReactNode } from 'react';

interface AuthGuardProps {
  children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, initialize } = useAuth();
  const location = useLocation();

  useEffect(() => {
    initialize();
  }, [initialize]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-dark-base">
        <Spinner size="lg" variant="primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    const router = getService(RouterToken);
    router.navigate(`/login?redirect=${encodeURIComponent(location.pathname)}`);
    return null;
  }

  return <>{children}</>;
}
