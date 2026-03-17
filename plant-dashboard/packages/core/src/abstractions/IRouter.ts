/** Platform-agnostic navigation interface */
export interface IRouter {
  navigate(path: string, options?: NavigateOptions): void;
  goBack(): void;
  replace(path: string): void;
  getCurrentRoute(): string;
  getParams<T extends Record<string, string>>(): T;
}

export interface NavigateOptions {
  replace?: boolean;
  state?: unknown;
}
