import { getService } from '../di/container';
import { HttpClientToken } from '../di/container';
import type { WateringEvent, WateringSchedule } from '../types';

export class WateringService {
  async getSchedule(): Promise<WateringSchedule[]> {
    const http = getService(HttpClientToken);
    return http.get<WateringSchedule[]>('/api/watering/schedule/');
  }

  async getUpcoming(days = 7): Promise<WateringSchedule[]> {
    const http = getService(HttpClientToken);
    return http.get<WateringSchedule[]>('/api/watering/upcoming/', { params: { days } });
  }

  async markAsDone(scheduleId: string, notes?: string, amount?: number): Promise<WateringEvent> {
    const http = getService(HttpClientToken);
    return http.post<WateringEvent>(`/api/watering/schedule/${scheduleId}/done/`, { notes, amount });
  }

  async getHistory(plantId?: string): Promise<WateringEvent[]> {
    const http = getService(HttpClientToken);
    const params = plantId ? { plant: plantId } : {};
    return http.get<WateringEvent[]>('/api/watering/history/', { params });
  }

  async setReminder(plantId: string, intervalDays: number): Promise<WateringSchedule> {
    const http = getService(HttpClientToken);
    return http.post<WateringSchedule>('/api/watering/reminder/', { plant: plantId, interval_days: intervalDays });
  }
}

export const wateringService = new WateringService();
