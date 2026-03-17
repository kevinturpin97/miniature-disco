import { getService } from '../di/container';
import { HttpClientToken } from '../di/container';
import type { Plant, PlantCreate, PlantUpdate, PaginatedResponse } from '../types';
import type { PlantFilter } from '../types';

export class PlantService {
  async getAll(filter?: PlantFilter): Promise<Plant[]> {
    const http = getService(HttpClientToken);
    const params: Record<string, unknown> = {};
    if (filter?.search) params.search = filter.search;
    if (filter?.roomId) params.room = filter.roomId;
    if (filter?.healthStatus) params.health_status = filter.healthStatus;
    if (filter?.sortBy) params.ordering = filter.sortOrder === 'desc' ? `-${filter.sortBy}` : filter.sortBy;
    const response = await http.get<PaginatedResponse<Plant>>('/api/plants/', { params });
    return response.results;
  }

  async getById(id: string): Promise<Plant> {
    const http = getService(HttpClientToken);
    return http.get<Plant>(`/api/plants/${id}/`);
  }

  async create(data: PlantCreate): Promise<Plant> {
    const http = getService(HttpClientToken);
    return http.post<Plant>('/api/plants/', data);
  }

  async update(data: PlantUpdate): Promise<Plant> {
    const http = getService(HttpClientToken);
    const { id, ...rest } = data;
    return http.patch<Plant>(`/api/plants/${id}/`, rest);
  }

  async delete(id: string): Promise<void> {
    const http = getService(HttpClientToken);
    await http.delete(`/api/plants/${id}/`);
  }

  async search(query: string): Promise<Plant[]> {
    const http = getService(HttpClientToken);
    const response = await http.get<PaginatedResponse<Plant>>('/api/plants/', { params: { search: query } });
    return response.results;
  }
}

export const plantService = new PlantService();
