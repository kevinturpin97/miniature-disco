import { BrowserRouter, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { setWebNavigator } from './router/WebRouter';
import { useSettingsStore } from '@core/stores/useSettingsStore';
import { applyTheme } from './theme/transformer';
import { AppRoutes } from './routes';
import { ToastContainer } from './components/ui/ToastContainer';
import { ErrorBoundary } from './components/ErrorBoundary';

function RouterSyncer() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    setWebNavigator(navigate, () => location.pathname);
  }, [navigate, location]);

  return null;
}

function ThemeApplier() {
  const theme = useSettingsStore((s) => s.theme);
  useEffect(() => {
    applyTheme((theme === 'system' ? 'dark' : theme) as 'dark' | 'light');
  }, [theme]);
  return null;
}

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter>
        <RouterSyncer />
        <ThemeApplier />
        <AppRoutes />
        <ToastContainer />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
