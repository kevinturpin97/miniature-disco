import { useStepper, type Step } from '@ui/hooks/useStepper';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface StepperProps {
  steps: Step[];
  currentStep?: number;
}

export function Stepper({ steps, currentStep = 0 }: StepperProps) {
  const { steps: stepsWithStatus, progressPercent } = useStepper(
    steps,
    currentStep
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="relative flex items-center justify-between">
        <div className="absolute left-0 right-0 h-0.5 bg-white/10 top-4 z-0" />
        <motion.div
          className="absolute left-0 h-0.5 bg-neon-cyan top-4 z-0"
          initial={{ width: 0 }}
          animate={{ width: `${progressPercent}%` }}
          transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
        />
        {stepsWithStatus.map((step) => (
          <div
            key={step.id}
            className="relative z-10 flex flex-col items-center gap-2"
          >
            <div
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold border-2 transition-all duration-300',
                step.status === 'completed' &&
                  'bg-neon-cyan border-neon-cyan text-dark-base',
                step.status === 'current' &&
                  'bg-neon-cyan/20 border-neon-cyan text-neon-cyan shadow-neon-cyan',
                step.status === 'upcoming' &&
                  'bg-dark-surface border-white/20 text-white/30'
              )}
            >
              {step.status === 'completed' ? (
                <Check size={14} />
              ) : (
                step.index + 1
              )}
            </div>
            <span
              className={cn(
                'text-xs font-medium',
                step.status === 'current'
                  ? 'text-neon-cyan'
                  : step.status === 'completed'
                    ? 'text-white/70'
                    : 'text-white/30'
              )}
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
