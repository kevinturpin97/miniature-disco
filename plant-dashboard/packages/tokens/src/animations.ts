/** Pure JS animation presets — consumed by Framer Motion (web) or Reanimated (RN) */
export const easings = {
  easeOutQuad: [0.25, 0.46, 0.45, 0.94] as const,
  easeOutQuart: [0.25, 1, 0.5, 1] as const,
  spring: [0.34, 1.56, 0.64, 1] as const,
  easeInOut: [0.4, 0, 0.2, 1] as const,
};

export const durations = { instant: 100, fast: 150, normal: 300, slow: 500, xslow: 800 };

export const animationPresets = {
  fadeIn:   { duration: durations.normal, ease: easings.easeOutQuad,  from: { opacity: 0 },                        to: { opacity: 1 } },
  fadeOut:  { duration: durations.fast,   ease: easings.easeInOut,    from: { opacity: 1 },                        to: { opacity: 0 } },
  slideUp:  { duration: durations.slow,   ease: easings.easeOutQuad,  from: { opacity: 0, y: 20 },                 to: { opacity: 1, y: 0 } },
  slideDown:{ duration: durations.normal, ease: easings.easeOutQuad,  from: { opacity: 0, y: -20 },                to: { opacity: 1, y: 0 } },
  scaleIn:  { duration: durations.normal, ease: easings.spring,       from: { opacity: 0, scale: 0.95 },           to: { opacity: 1, scale: 1 } },
  scaleOut: { duration: durations.fast,   ease: easings.easeInOut,    from: { opacity: 1, scale: 1 },              to: { opacity: 0, scale: 0.97 } },
  slideInLeft:  { duration: durations.slow, ease: easings.easeOutQuart, from: { opacity: 0, x: -30 },             to: { opacity: 1, x: 0 } },
  slideInRight: { duration: durations.slow, ease: easings.easeOutQuart, from: { opacity: 0, x: 30 },              to: { opacity: 1, x: 0 } },
  bounceIn: { duration: durations.slow,   ease: easings.spring,       from: { opacity: 0, scale: 0.3 },           to: { opacity: 1, scale: 1 } },
  shake:    { duration: durations.normal, ease: easings.easeInOut,    keyframes: [0, -4, 4, -2, 2, 0], property: 'x' },
  stagger:  { delayPerItem: 60 },
};

export type AnimationPresetKey = keyof typeof animationPresets;
