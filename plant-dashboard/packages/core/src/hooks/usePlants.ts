import { useCallback } from 'react';
import { usePlantsStore } from '../stores/usePlantsStore';
import { plantService } from '../services/PlantService';
import type { PlantCreate, PlantUpdate, PlantFilter } from '../types';

export function usePlants() {
  const store = usePlantsStore();

  const fetchPlants = useCallback(async (filter?: PlantFilter) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const plants = await plantService.getAll(filter);
      store.setPlants(plants);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to fetch plants');
    } finally {
      store.setLoading(false);
    }
  }, [store]);

  const createPlant = useCallback(async (data: PlantCreate) => {
    const plant = await plantService.create(data);
    store.addPlant(plant);
    return plant;
  }, [store]);

  const updatePlant = useCallback(async (data: PlantUpdate) => {
    const plant = await plantService.update(data);
    store.updatePlant(plant);
    return plant;
  }, [store]);

  const deletePlant = useCallback(async (id: string) => {
    await plantService.delete(id);
    store.removePlant(id);
  }, [store]);

  const applyFilter = useCallback((f: Partial<PlantFilter>) => {
    store.setFilter(f);
  }, [store]);

  const sort = useCallback((sortBy: PlantFilter['sortBy'], sortOrder: PlantFilter['sortOrder'] = 'asc') => {
    store.setFilter({ sortBy, sortOrder });
  }, [store]);

  return {
    plants: store.filteredPlants,
    allPlants: store.plants,
    filter: store.filter,
    isLoading: store.isLoading,
    error: store.error,
    selectedPlant: store.selectedPlant,
    setSelectedPlant: store.setSelectedPlant,
    fetchPlants,
    createPlant,
    updatePlant,
    deletePlant,
    applyFilter,
    sort,
  };
}
