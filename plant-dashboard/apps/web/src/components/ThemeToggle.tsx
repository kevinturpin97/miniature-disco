import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSettingsStore } from '@core/stores/useSettingsStore';
import { applyTheme } from '../theme/transformer';

export function ThemeToggle() {
  const { theme, setTheme } = useSettingsStore();
  const isDark = theme !== 'light';

  const toggle = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setTheme(newTheme);
    applyTheme(newTheme);
  };

  return (
    <button
      onClick={toggle}
      className="relative w-14 h-7 rounded-full bg-white/10 border border-white/15 p-1 transition-colors hover:bg-white/15"
      role="switch"
      aria-checked={!isDark}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
    >
      <motion.div
        animate={{ x: isDark ? 0 : 28 }}
        transition={{ type: 'spring', bounce: 0.3, duration: 0.4 }}
        className="w-5 h-5 rounded-full bg-neon-cyan flex items-center justify-center"
      >
        {isDark ? (
          <Moon size={10} className="text-dark-base" />
        ) : (
          <Sun size={10} className="text-dark-base" />
        )}
      </motion.div>
    </button>
  );
}
