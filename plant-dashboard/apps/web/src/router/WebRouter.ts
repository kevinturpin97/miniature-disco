import type { IRouter, NavigateOptions } from '@core/abstractions/IRouter';

let _navigate: ((path: string, options?: { replace?: boolean; state?: unknown }) => void) | null = null;
let _getLocation: (() => string) | null = null;

export function setWebNavigator(
  navigate: (path: string, options?: { replace?: boolean; state?: unknown }) => void,
  getLocation: () => string
) {
  _navigate = navigate;
  _getLocation = getLocation;
}

export const WebRouter: IRouter = {
  navigate(path: string, options?: NavigateOptions) {
    if (!_navigate) throw new Error('WebRouter not initialized. Call setWebNavigator() first.');
    _navigate(path, options);
  },
  goBack() {
    if (typeof window !== 'undefined') window.history.back();
  },
  replace(path: string) {
    if (!_navigate) throw new Error('WebRouter not initialized.');
    _navigate(path, { replace: true });
  },
  getCurrentRoute() {
    if (_getLocation) return _getLocation();
    return typeof window !== 'undefined' ? window.location.pathname : '/';
  },
  getParams<T extends Record<string, string>>(): T {
    return {} as T; // actual params extracted via useParams in components
  },
};
