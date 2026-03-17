import { motion } from 'framer-motion';
import type { CardProps } from '@ui/types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

export function Card({
  children,
  className,
  glow = false,
  glowColor = 'rgba(0,240,255,0.3)',
  glassmorphism = true,
  onClick,
  hoverable,
}: CardProps) {
  const isClickable = !!onClick || hoverable;
  return (
    <motion.div
      onClick={onClick}
      whileHover={
        isClickable ? { scale: 1.01, borderColor: glowColor } : undefined
      }
      transition={{ duration: 0.2, ease: 'easeOut' }}
      style={glow ? { boxShadow: `0 0 24px ${glowColor}` } : undefined}
      className={cn(
        'rounded-2xl border',
        glassmorphism
          ? 'bg-white/[0.04] backdrop-blur-md border-white/[0.08]'
          : 'bg-dark-card border-white/[0.08]',
        isClickable &&
          'cursor-pointer hover:border-white/15 transition-all duration-200',
        className
      )}
    >
      {children}
    </motion.div>
  );
}
