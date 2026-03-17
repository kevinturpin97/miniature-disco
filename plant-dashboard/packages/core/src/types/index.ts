// ─── User & Auth ──────────────────────────────────────────────────────────────
export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: string;
  updatedAt: string;
}

export interface AuthTokens {
  access: string;
  refresh: string;
  expiresAt: number;
}

// ─── Plants ───────────────────────────────────────────────────────────────────
export type PlantHealthStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'critical';
export type WaterNeedLevel = 'low' | 'medium' | 'high';
export type LightNeedLevel = 'low' | 'indirect' | 'bright' | 'full-sun';

export interface PlantSpecies {
  id: string;
  commonName: string;
  scientificName: string;
  family: string;
  waterNeed: WaterNeedLevel;
  lightNeed: LightNeedLevel;
  minTemp: number;
  maxTemp: number;
  humidityMin: number;
  description: string;
  imageUrl?: string;
}

export interface Plant {
  id: string;
  name: string;
  species?: PlantSpecies;
  speciesId?: string;
  roomId?: string;
  room?: Room;
  healthScore: number; // 0-100
  healthStatus: PlantHealthStatus;
  imageUrl?: string;
  images: string[];
  notes?: string;
  acquiredAt?: string;
  lastWateredAt?: string;
  nextWateringAt?: string;
  lastFertilizedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlantCreate {
  name: string;
  speciesId?: string;
  roomId?: string;
  imageUrl?: string;
  notes?: string;
  acquiredAt?: string;
}

export interface PlantUpdate extends Partial<PlantCreate> {
  id: string;
}

export interface PlantFilter {
  roomId?: string;
  healthStatus?: PlantHealthStatus;
  speciesId?: string;
  search?: string;
  sortBy?: 'name' | 'health' | 'createdAt' | 'nextWatering';
  sortOrder?: 'asc' | 'desc';
}

// ─── Rooms ────────────────────────────────────────────────────────────────────
export interface Room {
  id: string;
  name: string;
  icon?: string;
  plantCount: number;
  createdAt: string;
}

export interface RoomCreate { name: string; icon?: string; }

// ─── Watering ─────────────────────────────────────────────────────────────────
export interface WateringEvent {
  id: string;
  plantId: string;
  plant?: Plant;
  doneAt: string;
  amount?: number; // ml
  notes?: string;
}

export interface WateringSchedule {
  id: string;
  plantId: string;
  plant?: Plant;
  scheduledAt: string;
  isDone: boolean;
  doneAt?: string;
  intervalDays: number;
}

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotificationType = 'watering' | 'health_alert' | 'fertilizing' | 'system';

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  data?: Record<string, unknown>;
}

// ─── Settings ─────────────────────────────────────────────────────────────────
export type ThemeMode = 'dark' | 'light' | 'system';
export type Language = 'fr' | 'en';

export interface AppSettings {
  theme: ThemeMode;
  language: Language;
  notifications: NotificationSettings;
  profile: User;
}

export interface NotificationSettings {
  wateringReminders: boolean;
  healthAlerts: boolean;
  weeklyReport: boolean;
  reminderHour: number; // 0-23
}

// ─── API responses ────────────────────────────────────────────────────────────
export interface PaginatedResponse<T> {
  results: T[];
  count: number;
  next: string | null;
  previous: string | null;
}

export interface ApiError {
  message: string;
  code?: string;
  field?: string;
}
