import { motion } from 'framer-motion';
import { Button } from './ui/Button';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: { label: string; onAction: () => void };
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="flex flex-col items-center justify-center py-20 px-6 text-center"
    >
      {Icon && (
        <Icon
          className="w-16 h-16 text-white/20 mb-6"
          strokeWidth={1}
        />
      )}
      <h3 className="text-lg font-semibold text-white/70 mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-white/40 max-w-sm mb-6">{description}</p>
      )}
      {action && (
        <Button variant="primary" size="sm" onAction={action.onAction}>
          {action.label}
        </Button>
      )}
    </motion.div>
  );
}
