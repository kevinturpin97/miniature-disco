/**
 * Dark mode toggle button with animated sun/moon icons.
 */

import { motion } from "framer-motion";
import { useThemeStore } from "@/stores/themeStore";

export function DarkModeToggle() {
  const { theme, toggle } = useThemeStore();
  const isDark = theme === "dark";

  return (
    <button
      onClick={toggle}
      className="relative rounded-lg p-2 text-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 180 : 0, scale: isDark ? 0 : 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="absolute inset-0 flex items-center justify-center"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      </motion.div>
      <motion.div
        initial={false}
        animate={{ rotate: isDark ? 0 : -180, scale: isDark ? 1 : 0 }}
        transition={{ type: "spring", stiffness: 200, damping: 15 }}
        className="flex items-center justify-center"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
        </svg>
      </motion.div>
    </button>
  );
}
