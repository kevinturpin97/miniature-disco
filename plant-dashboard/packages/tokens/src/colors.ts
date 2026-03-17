/** Design tokens – Dark palette */
export const darkColors = {
  background: { base: '#1A1A2E', surface: '#16213E', overlay: '#0F3460', card: '#1E2A45' },
  primary: { neon: '#00F0FF', neonDim: 'rgba(0,240,255,0.15)', neonGlow: 'rgba(0,240,255,0.3)' },
  secondary: { neon: '#FF2E97', neonDim: 'rgba(255,46,151,0.15)', neonGlow: 'rgba(255,46,151,0.3)' },
  accent: { purple: '#7B2FBE', green: '#39FF14', yellow: '#FFD600', orange: '#FF6B35' },
  text: { primary: '#E8F4F8', secondary: 'rgba(232,244,248,0.7)', muted: 'rgba(232,244,248,0.4)', disabled: 'rgba(232,244,248,0.2)' },
  border: { default: 'rgba(255,255,255,0.08)', subtle: 'rgba(255,255,255,0.04)', active: 'rgba(0,240,255,0.5)' },
  status: { success: '#39FF14', warning: '#FFD600', error: '#FF4757', info: '#00F0FF' },
  chart: { line1: '#00F0FF', line2: '#FF2E97', line3: '#7B2FBE', line4: '#39FF14', grid: 'rgba(255,255,255,0.06)' },
};

/** Design tokens – Light palette */
export const lightColors = {
  background: { base: '#F8F9FE', surface: '#FFFFFF', overlay: '#EEF2FF', card: '#FFFFFF' },
  primary: { neon: '#4F46E5', neonDim: 'rgba(79,70,229,0.1)', neonGlow: 'rgba(79,70,229,0.2)' },
  secondary: { neon: '#EC4899', neonDim: 'rgba(236,72,153,0.1)', neonGlow: 'rgba(236,72,153,0.2)' },
  accent: { purple: '#7C3AED', green: '#16A34A', yellow: '#CA8A04', orange: '#EA580C' },
  text: { primary: '#0F172A', secondary: 'rgba(15,23,42,0.7)', muted: 'rgba(15,23,42,0.4)', disabled: 'rgba(15,23,42,0.2)' },
  border: { default: 'rgba(0,0,0,0.08)', subtle: 'rgba(0,0,0,0.04)', active: 'rgba(79,70,229,0.5)' },
  status: { success: '#16A34A', warning: '#CA8A04', error: '#DC2626', info: '#4F46E5' },
  chart: { line1: '#4F46E5', line2: '#EC4899', line3: '#7C3AED', line4: '#16A34A', grid: 'rgba(0,0,0,0.06)' },
};

export type ColorPalette = typeof darkColors;
