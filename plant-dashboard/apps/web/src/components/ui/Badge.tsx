import type { BadgeProps } from '@ui/types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const variantClasses: Record<string, string> = {
  primary: 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/30',
  secondary: 'bg-neon-pink/15 text-neon-pink border-neon-pink/30',
  success: 'bg-neon-green/15 text-neon-green border-neon-green/30',
  warning: 'bg-neon-yellow/15 text-neon-yellow border-neon-yellow/30',
  danger: 'bg-red-500/15 text-red-400 border-red-500/30',
  ghost: 'bg-white/8 text-white/60 border-white/15',
  neutral: 'bg-white/[0.08] text-white/50 border-white/10',
};

const sizeClasses: Record<string, string> = {
  xs: 'text-xs px-1.5 py-0.5',
  sm: 'text-xs px-2 py-0.5',
  md: 'text-sm px-2.5 py-1',
  lg: 'text-sm px-3 py-1',
  xl: 'text-base px-4 py-1.5',
};

export function Badge({
  children,
  variant = 'neutral',
  size = 'sm',
  dot,
  className,
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border font-medium',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full',
            variant === 'success'
              ? 'bg-neon-green animate-pulse'
              : variant === 'danger'
                ? 'bg-red-400'
                : 'bg-current'
          )}
        />
      )}
      {children}
    </span>
  );
}
