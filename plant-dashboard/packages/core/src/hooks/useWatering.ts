import { useState, useCallback } from 'react';
import { wateringService } from '../services/WateringService';
import type { WateringEvent, WateringSchedule } from '../types';

export function useWatering() {
  const [schedule, setSchedule] = useState<WateringSchedule[]>([]);
  const [history, setHistory] = useState<WateringEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSchedule = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await wateringService.getSchedule();
      setSchedule(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch schedule');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const markAsDone = useCallback(async (scheduleId: string, notes?: string, amount?: number) => {
    const event = await wateringService.markAsDone(scheduleId, notes, amount);
    setSchedule(prev => prev.map(s => s.id === scheduleId ? { ...s, isDone: true, doneAt: event.doneAt } : s));
    return event;
  }, []);

  const fetchHistory = useCallback(async (plantId?: string) => {
    const data = await wateringService.getHistory(plantId);
    setHistory(data);
  }, []);

  return { schedule, history, isLoading, error, fetchSchedule, markAsDone, fetchHistory };
}
