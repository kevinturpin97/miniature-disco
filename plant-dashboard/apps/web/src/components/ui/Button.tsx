import { useButton } from '@ui/hooks/useButton';
import type { ButtonProps } from '@ui/types';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

const variantClasses: Record<string, string> = {
  primary:
    'bg-neon-cyan/10 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/20 hover:border-neon-cyan hover:shadow-neon-cyan focus:ring-2 focus:ring-neon-cyan/30',
  secondary:
    'bg-neon-pink/10 border border-neon-pink/40 text-neon-pink hover:bg-neon-pink/20 hover:border-neon-pink hover:shadow-neon-pink focus:ring-2 focus:ring-neon-pink/30',
  ghost:
    'bg-transparent border border-white/10 text-white/70 hover:bg-white/5 hover:border-white/20 hover:text-white',
  danger:
    'bg-red-500/10 border border-red-500/40 text-red-400 hover:bg-red-500/20 hover:border-red-500',
  success:
    'bg-neon-green/10 border border-neon-green/40 text-neon-green hover:bg-neon-green/20 hover:border-neon-green',
  warning:
    'bg-neon-yellow/10 border border-neon-yellow/40 text-neon-yellow hover:bg-neon-yellow/20 hover:border-neon-yellow',
};

const sizeClasses: Record<string, string> = {
  xs: 'h-7 px-3 text-xs rounded-lg gap-1.5',
  sm: 'h-8 px-4 text-sm rounded-lg gap-2',
  md: 'h-10 px-5 text-sm rounded-xl gap-2',
  lg: 'h-11 px-6 text-base rounded-xl gap-2.5',
  xl: 'h-12 px-8 text-base rounded-2xl gap-3',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  loading: externalLoading,
  disabled,
  fullWidth,
  leftIcon,
  rightIcon,
  onAction,
  type = 'button',
  className,
}: ButtonProps) {
  const { isLoading, isDisabled, handlePress } = useButton({
    onClick: onAction,
    disabled,
    loading: externalLoading,
  });

  return (
    <motion.button
      type={type}
      disabled={isDisabled}
      onClick={handlePress}
      whileTap={{ scale: isDisabled ? 1 : 0.97 }}
      transition={{ duration: 0.1 }}
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all duration-200',
        'focus:outline-none disabled:opacity-40 disabled:cursor-not-allowed',
        variantClasses[variant],
        sizeClasses[size],
        fullWidth && 'w-full',
        className
      )}
    >
      {isLoading ? (
        <Loader2
          className="animate-spin"
          size={size === 'xs' ? 12 : size === 'sm' ? 14 : 16}
        />
      ) : (
        leftIcon
      )}
      {children}
      {!isLoading && rightIcon}
    </motion.button>
  );
}
