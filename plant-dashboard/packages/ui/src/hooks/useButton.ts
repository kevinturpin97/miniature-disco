import { useCallback, useState } from 'react';

export interface UseButtonOptions {
  onClick?: () => void | Promise<void>;
  disabled?: boolean;
  loading?: boolean;
}

export interface UseButtonResult {
  isLoading: boolean;
  isDisabled: boolean;
  handlePress: () => void;
}

export function useButton({ onClick, disabled = false, loading = false }: UseButtonOptions = {}): UseButtonResult {
  const [isInternalLoading, setIsInternalLoading] = useState(false);
  const isLoading = loading || isInternalLoading;
  const isDisabled = disabled || isLoading;

  const handlePress = useCallback(() => {
    if (isDisabled || !onClick) return;
    const result = onClick();
    if (result instanceof Promise) {
      setIsInternalLoading(true);
      result.finally(() => setIsInternalLoading(false));
    }
  }, [onClick, isDisabled]);

  return { isLoading, isDisabled, handlePress };
}
