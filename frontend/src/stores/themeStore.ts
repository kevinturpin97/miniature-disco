/**
 * Theme store (Zustand).
 *
 * Manages dark/light mode via .dark class on documentElement.
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
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
  // Update PWA theme-color meta tag
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", theme === "dark" ? "#111827" : "#16a34a");
  }
}

function getInitialTheme(): Theme {
  const stored = localStorage.getItem("gp-theme") as Theme | null;
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
    localStorage.setItem("gp-theme", next);
    applyTheme(next);
    set({ theme: next });
  },

  setTheme: (t: Theme) => {
    localStorage.setItem("gp-theme", t);
    applyTheme(t);
    set({ theme: t });
  },
}));
