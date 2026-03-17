import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useInput } from '@ui/hooks/useInput';

describe('useInput', () => {
  it('returns default value', () => {
    const { result } = renderHook(() => useInput({ defaultValue: 'hello' }));
    expect(result.current.value).toBe('hello');
  });

  it('updates value on handleChange', () => {
    const { result } = renderHook(() => useInput());
    act(() => result.current.handleChange('new value'));
    expect(result.current.value).toBe('new value');
  });

  it('calls onChange callback', () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useInput({ onChange }));
    act(() => result.current.handleChange('test'));
    expect(onChange).toHaveBeenCalledWith('test');
  });

  it('sets isFocused on handleFocus', () => {
    const { result } = renderHook(() => useInput());
    act(() => result.current.handleFocus());
    expect(result.current.isFocused).toBe(true);
  });

  it('clears isFocused on handleBlur', () => {
    const { result } = renderHook(() => useInput());
    act(() => result.current.handleFocus());
    act(() => result.current.handleBlur());
    expect(result.current.isFocused).toBe(false);
  });

  it('runs validation on blur', () => {
    const validate = vi.fn(() => 'Error message');
    const { result } = renderHook(() => useInput({ validate }));
    act(() => result.current.handleChange('value'));
    act(() => result.current.handleBlur());
    expect(result.current.error).toBe('Error message');
  });

  it('clears value on clear()', () => {
    const { result } = renderHook(() => useInput({ defaultValue: 'abc' }));
    act(() => result.current.clear());
    expect(result.current.value).toBe('');
  });
});
