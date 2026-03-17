import type { SpinnerProps } from '@ui/types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const sizeClasses: Record<string, string> = {
  xs: 'w-3 h-3',
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
  xl: 'w-12 h-12',
};

const colorClasses: Record<string, string> = {
  primary: 'text-neon-cyan',
  secondary: 'text-neon-pink',
  success: 'text-neon-green',
  warning: 'text-neon-yellow',
  danger: 'text-red-400',
  ghost: 'text-white/50',
};

export function Spinner({
  size = 'md',
  variant = 'primary',
  className,
}: SpinnerProps) {
  return (
    <svg
      className={cn(
        'animate-spin',
        sizeClasses[size],
        colorClasses[variant],
        className
      )}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="Loading"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
