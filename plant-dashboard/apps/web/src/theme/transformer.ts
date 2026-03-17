import { darkColors, lightColors } from '@tokens/colors';
import { typography } from '@tokens/typography';
import { spacing, radii } from '@tokens/spacing';
import type { ThemeMode } from '@core/types';

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, string> {
  return Object.entries(obj).reduce((acc, [key, value]) => {
    const cssKey = prefix ? `${prefix}-${key}` : key;
    if (typeof value === 'object' && value !== null) {
      Object.assign(acc, flattenObject(value as Record<string, unknown>, cssKey));
    } else {
      acc[cssKey] = String(value);
    }
    return acc;
  }, {} as Record<string, string>);
}

export function applyTheme(mode: ThemeMode | 'dark' | 'light') {
  const colors = mode === 'light' ? lightColors : darkColors;
  const root = document.documentElement;

  const colorVars = flattenObject(colors as unknown as Record<string, unknown>, 'color');
  Object.entries(colorVars).forEach(([k, v]) => root.style.setProperty(`--${k}`, v));

  // Typography
  Object.entries(typography.fontSize).forEach(([k, v]) => root.style.setProperty(`--font-size-${k}`, `${v}px`));

  // Spacing
  Object.entries(spacing).forEach(([k, v]) => root.style.setProperty(`--spacing-${k}`, `${v}px`));
  Object.entries(radii).forEach(([k, v]) => root.style.setProperty(`--radius-${k}`, `${v}px`));

  root.setAttribute('data-theme', mode === 'light' ? 'light' : 'dark');
}
