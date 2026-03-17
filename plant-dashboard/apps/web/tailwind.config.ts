import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['attribute', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        // Dark palette
        'dark-base': '#1A1A2E',
        'dark-surface': '#16213E',
        'dark-overlay': '#0F3460',
        'dark-card': '#1E2A45',
        // Neon colors
        'neon-cyan': '#00F0FF',
        'neon-pink': '#FF2E97',
        'neon-purple': '#7B2FBE',
        'neon-green': '#39FF14',
        'neon-yellow': '#FFD600',
        'neon-orange': '#FF6B35',
        // Light palette
        'light-base': '#F8F9FE',
        'light-surface': '#FFFFFF',
        'light-overlay': '#EEF2FF',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        display: ['Satoshi', 'Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      boxShadow: {
        'neon-cyan': '0 0 20px rgba(0,240,255,0.4)',
        'neon-pink': '0 0 20px rgba(255,46,151,0.4)',
        'neon-green': '0 0 16px rgba(57,255,20,0.3)',
        'neon-purple': '0 0 20px rgba(123,47,190,0.4)',
        'glow-card': '0 8px 32px rgba(0,0,0,0.3)',
      },
      backdropBlur: { xs: '2px' },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4,0,0.6,1) infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'glow': 'glow 2s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        glow: { '0%,100%': { boxShadow: '0 0 8px rgba(0,240,255,0.3)' }, '50%': { boxShadow: '0 0 24px rgba(0,240,255,0.6)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
      },
    },
  },
  plugins: [require('daisyui')],
  daisyui: {
    themes: [
      {
        'plant-dark': {
          primary: '#00F0FF',
          secondary: '#FF2E97',
          accent: '#7B2FBE',
          neutral: '#1E2A45',
          'base-100': '#1A1A2E',
          'base-200': '#16213E',
          'base-300': '#0F3460',
          info: '#00F0FF',
          success: '#39FF14',
          warning: '#FFD600',
          error: '#FF4757',
        },
        'plant-light': {
          primary: '#4F46E5',
          secondary: '#EC4899',
          accent: '#7C3AED',
          neutral: '#E8EAED',
          'base-100': '#F8F9FE',
          'base-200': '#FFFFFF',
          'base-300': '#EEF2FF',
          info: '#4F46E5',
          success: '#16A34A',
          warning: '#CA8A04',
          error: '#DC2626',
        },
      },
    ],
  },
} satisfies Config;
