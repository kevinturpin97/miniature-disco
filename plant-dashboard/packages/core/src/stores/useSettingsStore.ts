import { create } from 'zustand';
import type { AppSettings, ThemeMode, Language } from '../types';

interface SettingsState {
  settings: AppSettings | null;
  theme: ThemeMode;
  language: Language;
  isLoading: boolean;
  setSettings: (settings: AppSettings) => void;
  setTheme: (theme: ThemeMode) => void;
  setLanguage: (language: Language) => void;
  setLoading: (loading: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  theme: 'dark',
  language: 'fr',
  isLoading: false,
  setSettings: (settings) => set({ settings, theme: settings.theme, language: settings.language }),
  setTheme: (theme) => set({ theme }),
  setLanguage: (language) => set({ language }),
  setLoading: (isLoading) => set({ isLoading }),
}));
