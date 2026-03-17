import { useState, useCallback } from 'react';
import { getService } from '../di/container';
import { HttpClientToken } from '../di/container';
import type { Room, RoomCreate } from '../types';

export function useRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRooms = useCallback(async () => {
    setIsLoading(true);
    try {
      const http = getService(HttpClientToken);
      const data = await http.get<Room[]>('/api/rooms/');
      setRooms(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms');
    } finally {
      setIsLoading(false);
    }
  }, []);

  const createRoom = useCallback(async (data: RoomCreate) => {
    const http = getService(HttpClientToken);
    const room = await http.post<Room>('/api/rooms/', data);
    setRooms(prev => [...prev, room]);
    return room;
  }, []);

  const deleteRoom = useCallback(async (id: string) => {
    const http = getService(HttpClientToken);
    await http.delete(`/api/rooms/${id}/`);
    setRooms(prev => prev.filter(r => r.id !== id));
  }, []);

  return { rooms, isLoading, error, fetchRooms, createRoom, deleteRoom };
}
