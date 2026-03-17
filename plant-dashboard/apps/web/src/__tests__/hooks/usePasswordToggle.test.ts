import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePasswordToggle } from '@ui/hooks/usePasswordToggle';

describe('usePasswordToggle', () => {
  it('starts hidden', () => {
    const { result } = renderHook(() => usePasswordToggle());
    expect(result.current.isVisible).toBe(false);
    expect(result.current.inputType).toBe('password');
  });

  it('shows on toggle', () => {
    const { result } = renderHook(() => usePasswordToggle());
    act(() => result.current.toggle());
    expect(result.current.isVisible).toBe(true);
    expect(result.current.inputType).toBe('text');
  });

  it('hides again on second toggle', () => {
    const { result } = renderHook(() => usePasswordToggle());
    act(() => result.current.toggle());
    act(() => result.current.toggle());
    expect(result.current.isVisible).toBe(false);
  });
});
