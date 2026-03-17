import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useStepper } from '@ui/hooks/useStepper';

const STEPS = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }];

describe('useStepper', () => {
  it('starts at step 0', () => {
    const { result } = renderHook(() => useStepper(STEPS));
    expect(result.current.currentIndex).toBe(0);
  });

  it('advances on next()', () => {
    const { result } = renderHook(() => useStepper(STEPS));
    act(() => result.current.next());
    expect(result.current.currentIndex).toBe(1);
  });

  it('goes back on prev()', () => {
    const { result } = renderHook(() => useStepper(STEPS, 2));
    act(() => result.current.prev());
    expect(result.current.currentIndex).toBe(1);
  });

  it('does not go below 0', () => {
    const { result } = renderHook(() => useStepper(STEPS));
    act(() => result.current.prev());
    expect(result.current.currentIndex).toBe(0);
  });

  it('does not exceed last step', () => {
    const { result } = renderHook(() => useStepper(STEPS, 2));
    act(() => result.current.next());
    expect(result.current.currentIndex).toBe(2);
  });

  it('isFirst is true at step 0', () => {
    const { result } = renderHook(() => useStepper(STEPS));
    expect(result.current.isFirst).toBe(true);
  });

  it('isLast is true at last step', () => {
    const { result } = renderHook(() => useStepper(STEPS, 2));
    expect(result.current.isLast).toBe(true);
  });

  it('marks completed steps', () => {
    const { result } = renderHook(() => useStepper(STEPS, 1));
    expect(result.current.steps[0].status).toBe('completed');
    expect(result.current.steps[1].status).toBe('current');
    expect(result.current.steps[2].status).toBe('upcoming');
  });

  it('calculates progressPercent', () => {
    const { result } = renderHook(() => useStepper(STEPS, 2));
    expect(result.current.progressPercent).toBe(100);
  });
});
