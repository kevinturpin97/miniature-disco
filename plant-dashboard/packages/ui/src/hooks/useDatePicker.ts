import { useState, useCallback } from 'react';

export interface DateRange { start: Date | null; end: Date | null; }

export function useDatePicker(initial?: Date | null, range = false) {
  const [selected, setSelected] = useState<Date | null>(initial ?? null);
  const [selectedRange, setSelectedRange] = useState<DateRange>({ start: null, end: null });
  const [viewDate, setViewDate] = useState(initial ?? new Date());
  const [isOpen, setIsOpen] = useState(false);

  const selectDate = useCallback((date: Date) => {
    if (range) {
      setSelectedRange(prev => {
        if (!prev.start || (prev.start && prev.end)) return { start: date, end: null };
        if (date < prev.start) return { start: date, end: prev.start };
        return { start: prev.start, end: date };
      });
    } else {
      setSelected(date);
      setIsOpen(false);
    }
  }, [range]);

  const prevMonth = useCallback(() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)), []);
  const nextMonth = useCallback(() => setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)), []);
  const today = useCallback(() => { selectDate(new Date()); setViewDate(new Date()); }, [selectDate]);

  return { selected, selectedRange, viewDate, isOpen, selectDate, prevMonth, nextMonth, today, open: () => setIsOpen(true), close: () => setIsOpen(false) };
}
