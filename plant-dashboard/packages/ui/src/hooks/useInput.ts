import { useState, useCallback, useRef } from 'react';

export interface UseInputOptions {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  validate?: (value: string) => string | null;
  onBlur?: () => void;
}

export function useInput({ value: controlled, defaultValue = '', onChange, validate, onBlur }: UseInputOptions = {}) {
  const [internalValue, setInternalValue] = useState(defaultValue);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const ref = useRef<HTMLInputElement | null>(null);

  const isControlled = controlled !== undefined;
  const currentValue = isControlled ? controlled : internalValue;

  const handleChange = useCallback((newValue: string) => {
    if (!isControlled) setInternalValue(newValue);
    onChange?.(newValue);
    setIsDirty(true);
    if (validate) {
      const err = validate(newValue);
      setError(err);
    }
  }, [isControlled, onChange, validate]);

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => {
    setIsFocused(false);
    if (validate) setError(validate(currentValue));
    onBlur?.();
  }, [currentValue, validate, onBlur]);

  const clear = useCallback(() => {
    handleChange('');
    setError(null);
  }, [handleChange]);

  return { value: currentValue, error, isFocused, isDirty, ref, handleChange, handleFocus, handleBlur, clear };
}
