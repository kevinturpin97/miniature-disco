import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { ReactNode } from 'react';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface Option {
  value: string;
  label: string;
  icon?: ReactNode;
}

interface SelectProps {
  options: Option[];
  value?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  label?: string;
  error?: string;
  disabled?: boolean;
  className?: string;
}

export function Select({
  options,
  value,
  placeholder = 'Select...',
  onChange,
  label,
  error,
  disabled,
  className,
}: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={cn('relative flex flex-col gap-1.5', className)} ref={ref}>
      {label && (
        <label className="text-sm font-medium text-white/70">{label}</label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className={cn(
          'w-full h-10 px-3 flex items-center justify-between text-sm rounded-xl transition-all duration-200',
          'bg-white/5 border border-white/10 text-left',
          isOpen ? 'border-neon-cyan/50 bg-white/[0.08]' : 'hover:border-white/20',
          error && 'border-red-500/50',
          disabled && 'opacity-40 cursor-not-allowed'
        )}
      >
        <span className={selected ? 'text-white' : 'text-white/30'}>
          {selected ? (
            <span className="flex items-center gap-2">
              {selected.icon}
              {selected.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          size={16}
          className={cn(
            'text-white/40 transition-transform duration-200',
            isOpen && 'rotate-180'
          )}
        />
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="absolute z-50 mt-12 w-full bg-dark-surface border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange?.(opt.value);
                  setIsOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 text-sm text-left transition-colors',
                  opt.value === value
                    ? 'bg-neon-cyan/10 text-neon-cyan'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <span className="flex items-center gap-2">
                  {opt.icon}
                  {opt.label}
                </span>
                {opt.value === value && <Check size={14} />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
