import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSearch } from '@ui/hooks/useSearch';

const items = [
  { id: '1', name: 'Monstera' },
  { id: '2', name: 'Cactus' },
  { id: '3', name: 'Fern' },
];

describe('useSearch', () => {
  it('returns all items when no query', () => {
    const { result } = renderHook(() =>
      useSearch(items, (item, q) => item.name.toLowerCase().includes(q.toLowerCase()), 0)
    );
    expect(result.current.results).toHaveLength(3);
  });

  it('filters items by query after debounce', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useSearch(items, (item, q) => item.name.toLowerCase().includes(q.toLowerCase()), 100)
    );
    act(() => result.current.handleSearch('mon'));
    act(() => vi.advanceTimersByTime(150));
    expect(result.current.results).toHaveLength(1);
    expect(result.current.results[0].name).toBe('Monstera');
    vi.useRealTimers();
  });

  it('clears search', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() =>
      useSearch(items, (item, q) => item.name.toLowerCase().includes(q.toLowerCase()), 0)
    );
    act(() => result.current.handleSearch('mon'));
    act(() => vi.advanceTimersByTime(50));
    act(() => result.current.clear());
    expect(result.current.query).toBe('');
    vi.useRealTimers();
  });
});
