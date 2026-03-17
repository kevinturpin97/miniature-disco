import { create } from 'zustand';
import type { Plant, PlantFilter } from '../types';

interface PlantsState {
  plants: Plant[];
  filteredPlants: Plant[];
  filter: PlantFilter;
  isLoading: boolean;
  error: string | null;
  selectedPlant: Plant | null;
  setPlants: (plants: Plant[]) => void;
  setFilter: (filter: Partial<PlantFilter>) => void;
  applyFilter: () => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setSelectedPlant: (plant: Plant | null) => void;
  addPlant: (plant: Plant) => void;
  updatePlant: (plant: Plant) => void;
  removePlant: (id: string) => void;
}

const applyFilterFn = (plants: Plant[], filter: PlantFilter): Plant[] => {
  let result = [...plants];
  if (filter.search) {
    const q = filter.search.toLowerCase();
    result = result.filter(p => p.name.toLowerCase().includes(q) || p.species?.commonName.toLowerCase().includes(q));
  }
  if (filter.roomId) result = result.filter(p => p.roomId === filter.roomId);
  if (filter.healthStatus) result = result.filter(p => p.healthStatus === filter.healthStatus);
  if (filter.sortBy) {
    result.sort((a, b) => {
      const order = filter.sortOrder === 'desc' ? -1 : 1;
      switch (filter.sortBy) {
        case 'name': return order * a.name.localeCompare(b.name);
        case 'health': return order * (a.healthScore - b.healthScore);
        case 'createdAt': return order * (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        case 'nextWatering': {
          const aDate = a.nextWateringAt ? new Date(a.nextWateringAt).getTime() : Infinity;
          const bDate = b.nextWateringAt ? new Date(b.nextWateringAt).getTime() : Infinity;
          return order * (aDate - bDate);
        }
        default: return 0;
      }
    });
  }
  return result;
};

export const usePlantsStore = create<PlantsState>((set, get) => ({
  plants: [],
  filteredPlants: [],
  filter: {},
  isLoading: false,
  error: null,
  selectedPlant: null,
  setPlants: (plants) => set({ plants, filteredPlants: applyFilterFn(plants, get().filter) }),
  setFilter: (filter) => {
    const newFilter = { ...get().filter, ...filter };
    set({ filter: newFilter, filteredPlants: applyFilterFn(get().plants, newFilter) });
  },
  applyFilter: () => set({ filteredPlants: applyFilterFn(get().plants, get().filter) }),
  setLoading: (isLoading) => set({ isLoading }),
  setError: (error) => set({ error }),
  setSelectedPlant: (selectedPlant) => set({ selectedPlant }),
  addPlant: (plant) => {
    const plants = [...get().plants, plant];
    set({ plants, filteredPlants: applyFilterFn(plants, get().filter) });
  },
  updatePlant: (plant) => {
    const plants = get().plants.map(p => p.id === plant.id ? plant : p);
    set({ plants, filteredPlants: applyFilterFn(plants, get().filter) });
  },
  removePlant: (id) => {
    const plants = get().plants.filter(p => p.id !== id);
    set({ plants, filteredPlants: applyFilterFn(plants, get().filter) });
  },
}));
