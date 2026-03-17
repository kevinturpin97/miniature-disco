import { motion } from 'framer-motion';
import type { ToastProps } from '@ui/types';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { LucideIcon } from 'lucide-react';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface VariantConfig {
  icon: LucideIcon;
  bg: string;
  text: string;
  iconColor: string;
}

const variantConfig: Record<string, VariantConfig> = {
  success: {
    icon: CheckCircle,
    bg: 'bg-neon-green/10 border-neon-green/30',
    text: 'text-neon-green',
    iconColor: 'text-neon-green',
  },
  error: {
    icon: XCircle,
    bg: 'bg-red-500/10 border-red-500/30',
    text: 'text-red-400',
    iconColor: 'text-red-400',
  },
  warning: {
    icon: AlertTriangle,
    bg: 'bg-neon-yellow/10 border-neon-yellow/30',
    text: 'text-neon-yellow',
    iconColor: 'text-neon-yellow',
  },
  info: {
    icon: Info,
    bg: 'bg-neon-cyan/10 border-neon-cyan/30',
    text: 'text-neon-cyan',
    iconColor: 'text-neon-cyan',
  },
};

export function Toast({ id, message, variant, onDismiss }: ToastProps) {
  const config = variantConfig[variant];
  const Icon = config.icon;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 60, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 60, scale: 0.9 }}
      transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border backdrop-blur-md min-w-[280px] max-w-[380px] shadow-lg',
        config.bg
      )}
    >
      <Icon
        size={18}
        className={cn('flex-shrink-0 mt-0.5', config.iconColor)}
      />
      <p className={cn('text-sm flex-1', config.text)}>{message}</p>
      <button
        onClick={() => onDismiss(id)}
        className="flex-shrink-0 p-0.5 rounded text-white/30 hover:text-white/70 transition-colors"
        aria-label="Dismiss notification"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}
