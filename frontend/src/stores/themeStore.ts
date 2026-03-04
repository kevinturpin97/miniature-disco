/**
 * Theme store (Zustand).
 *
 * Manages dark/light mode via DaisyUI data-theme attribute.
 * Persisted in localStorage.
 */

import { create } from "zustand";

type Theme = "light" | "dark";

interface ThemeState {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute(
    "data-theme",
    theme === "dark" ? "greenhouse-dark" : "greenhouse-light",
  );
  // Update PWA theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#111827" : "#16a34a");
  }
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("theme") as Theme | null;
  if (stored === "dark" || stored === "light") return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

const initialTheme = getInitialTheme();
applyTheme(initialTheme);

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initialTheme,

  toggle: () => {
    const next = get().theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", next);
    applyTheme(next);
    set({ theme: next });
  },

  setTheme: (t: Theme) => {
    localStorage.setItem("theme", t);
    applyTheme(t);
    set({ theme: t });
  },
}));
