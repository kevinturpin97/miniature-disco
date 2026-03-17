import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTabs } from '@ui/hooks/useTabs';

const TABS = ['home', 'settings', 'about'] as const;

describe('useTabs', () => {
  it('starts at initial tab', () => {
    const { result } = renderHook(() => useTabs('home', [...TABS]));
    expect(result.current.activeTab).toBe('home');
  });

  it('selects a tab', () => {
    const { result } = renderHook(() => useTabs('home', [...TABS]));
    act(() => result.current.selectTab('settings'));
    expect(result.current.activeTab).toBe('settings');
  });

  it('does not select unknown tab', () => {
    const { result } = renderHook(() => useTabs('home', [...TABS]));
    // @ts-expect-error test invalid tab
    act(() => result.current.selectTab('unknown'));
    expect(result.current.activeTab).toBe('home');
  });

  it('nextTab advances', () => {
    const { result } = renderHook(() => useTabs('home', [...TABS]));
    act(() => result.current.nextTab());
    expect(result.current.activeTab).toBe('settings');
  });

  it('prevTab goes back', () => {
    const { result } = renderHook(() => useTabs('settings', [...TABS]));
    act(() => result.current.prevTab());
    expect(result.current.activeTab).toBe('home');
  });

  it('isFirst is true at first tab', () => {
    const { result } = renderHook(() => useTabs('home', [...TABS]));
    expect(result.current.isFirst).toBe(true);
  });

  it('isLast is true at last tab', () => {
    const { result } = renderHook(() => useTabs('about', [...TABS]));
    expect(result.current.isLast).toBe(true);
  });
});
