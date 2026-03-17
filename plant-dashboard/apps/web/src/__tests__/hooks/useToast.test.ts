import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useToast } from '@ui/hooks/useToast';

describe('useToast', () => {
  afterEach(() => vi.useRealTimers());

  it('adds a toast', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.show('Test message', 'info', 0));
    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test message');
  });

  it('dismisses a toast', () => {
    const { result } = renderHook(() => useToast());
    let id!: string;
    act(() => { id = result.current.show('Test', 'info', 0); });
    act(() => result.current.dismiss(id));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('success helper sets variant', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.success('Success!', 0));
    expect(result.current.toasts[0].variant).toBe('success');
  });

  it('error helper sets variant', () => {
    const { result } = renderHook(() => useToast());
    act(() => result.current.error('Error!', 0));
    expect(result.current.toasts[0].variant).toBe('error');
  });

  it('auto-dismisses after duration', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useToast());
    act(() => result.current.show('Auto dismiss', 'info', 100));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(150));
    expect(result.current.toasts).toHaveLength(0);
  });
});
