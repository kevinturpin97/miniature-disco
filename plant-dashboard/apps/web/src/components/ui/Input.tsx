import { useInput } from '@ui/hooks/useInput';
import type { InputProps } from '@ui/types';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { AlertCircle } from 'lucide-react';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

export function Input({
  label,
  placeholder,
  value,
  defaultValue,
  type = 'text',
  error,
  hint,
  disabled,
  required,
  leftIcon,
  rightIcon,
  onChangeValue,
  onBlur,
  name,
  autoComplete,
  className,
}: InputProps) {
  const {
    value: controlled,
    error: internalError,
    isFocused,
    handleChange,
    handleFocus,
    handleBlur,
  } = useInput({
    value,
    defaultValue,
    onChange: onChangeValue,
    onBlur,
  });

  const displayError = error ?? internalError;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label className="text-sm font-medium text-white/70">
          {label}
          {required && <span className="text-neon-pink ml-1">*</span>}
        </label>
      )}
      <div className={cn('relative flex items-center', isFocused && 'z-10')}>
        {leftIcon && (
          <div className="absolute left-3 text-white/40 pointer-events-none">
            {leftIcon}
          </div>
        )}
        <input
          name={name}
          type={type}
          value={controlled}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          className={cn(
            'w-full h-10 px-3 text-sm rounded-xl transition-all duration-200',
            'bg-white/5 border border-white/10 text-white placeholder:text-white/30',
            'focus:outline-none focus:border-neon-cyan/60 focus:bg-white/[0.08] focus:ring-2 focus:ring-neon-cyan/20',
            'disabled:opacity-40 disabled:cursor-not-allowed',
            displayError &&
              'border-red-500/60 focus:border-red-500 focus:ring-red-500/20',
            leftIcon && 'pl-10',
            rightIcon && 'pr-10',
            className
          )}
        />
        {rightIcon && (
          <div className="absolute right-3 text-white/40">{rightIcon}</div>
        )}
      </div>
      {displayError && (
        <div className="flex items-center gap-1.5 text-xs text-red-400">
          <AlertCircle size={12} />
          {displayError}
        </div>
      )}
      {hint && !displayError && (
        <p className="text-xs text-white/40">{hint}</p>
      )}
    </div>
  );
}
