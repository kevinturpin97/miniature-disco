import { useEffect, type ReactNode } from 'react';
import { useSettingsStore } from '@core/stores/useSettingsStore';
import { applyTheme } from '../theme/transformer';

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const theme = useSettingsStore((s: { theme: string }) => s.theme);

  useEffect(() => {
    applyTheme((theme === 'system' ? 'dark' : theme) as 'dark' | 'light');
  }, [theme]);

  return <>{children}</>;
}
