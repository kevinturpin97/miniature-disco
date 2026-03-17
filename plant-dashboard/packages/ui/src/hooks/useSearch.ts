import { useState, useCallback, useRef } from 'react';

export function useSearch<T>(
  items: T[],
  searchFn: (item: T, query: string) => boolean,
  debounceMs = 300
) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(value), debounceMs);
  }, [debounceMs]);

  const clear = useCallback(() => {
    setQuery('');
    setDebouncedQuery('');
  }, []);

  const highlight = useCallback((text: string, q = debouncedQuery): string => {
    if (!q) return text;
    return text.replace(new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '**$1**');
  }, [debouncedQuery]);

  const results = debouncedQuery ? items.filter(item => searchFn(item, debouncedQuery)) : items;

  return { query, results, handleSearch, clear, highlight, isSearching: !!debouncedQuery };
}
