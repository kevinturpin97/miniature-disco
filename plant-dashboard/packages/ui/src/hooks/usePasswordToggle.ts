import { useState, useCallback } from 'react';

export function usePasswordToggle() {
  const [isVisible, setIsVisible] = useState(false);
  const toggle = useCallback(() => setIsVisible(v => !v), []);
  return { isVisible, toggle, inputType: isVisible ? 'text' : 'password' };
}
