import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useButton } from '@ui/hooks/useButton';

describe('useButton', () => {
  it('calls onClick handler', async () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useButton({ onClick }));
    act(() => result.current.handlePress());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('does not call onClick when disabled', () => {
    const onClick = vi.fn();
    const { result } = renderHook(() => useButton({ onClick, disabled: true }));
    act(() => result.current.handlePress());
    expect(onClick).not.toHaveBeenCalled();
  });

  it('sets isDisabled true when disabled=true', () => {
    const { result } = renderHook(() => useButton({ disabled: true }));
    expect(result.current.isDisabled).toBe(true);
  });

  it('sets isLoading when loading=true', () => {
    const { result } = renderHook(() => useButton({ loading: true }));
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isDisabled).toBe(true);
  });

  it('shows internal loading state for async onClick', async () => {
    let resolve!: () => void;
    const asyncFn = vi.fn(() => new Promise<void>(r => { resolve = r; }));
    const { result } = renderHook(() => useButton({ onClick: asyncFn }));
    act(() => result.current.handlePress());
    expect(result.current.isLoading).toBe(true);
    await act(async () => resolve());
    expect(result.current.isLoading).toBe(false);
  });
});
