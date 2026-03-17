import { useState, useMemo } from 'react';

export interface Column<T> {
  key: keyof T | string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => unknown;
}

export function useDataTable<T extends Record<string, unknown>>(data: T[], columns: Column<T>[]) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const sorted = useMemo(() => {
    if (!sortKey) return data;
    return [...data].sort((a, b) => {
      const av = a[sortKey as keyof T]; const bv = b[sortKey as keyof T];
      if (av == null) return 1; if (bv == null) return -1;
      const result = av < bv ? -1 : av > bv ? 1 : 0;
      return sortDir === 'asc' ? result : -result;
    });
  }, [data, sortKey, sortDir]);

  const paginated = useMemo(() => sorted.slice((page - 1) * pageSize, page * pageSize), [sorted, page, pageSize]);
  const totalPages = Math.ceil(data.length / pageSize);

  const sort = (key: string) => {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };

  return { rows: paginated, columns, sortKey, sortDir, sort, page, pageSize, totalPages, setPage, total: data.length };
}
