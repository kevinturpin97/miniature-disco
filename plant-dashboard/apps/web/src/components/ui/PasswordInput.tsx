import { usePasswordToggle } from '@ui/hooks/usePasswordToggle';
import { Input } from './Input';
import { Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  error?: string;
  onChangeValue?: (value: string) => void;
  name?: string;
  autoComplete?: string;
}

export function PasswordInput({
  label,
  placeholder = 'Enter password',
  value,
  error,
  onChangeValue,
  name,
  autoComplete = 'current-password',
}: PasswordInputProps) {
  const { isVisible, toggle, inputType } = usePasswordToggle();
  return (
    <Input
      label={label}
      placeholder={placeholder}
      value={value}
      type={inputType}
      error={error}
      onChangeValue={onChangeValue}
      name={name}
      autoComplete={autoComplete}
      rightIcon={
        <button
          type="button"
          onClick={toggle}
          className="p-0.5 text-white/40 hover:text-white/70 transition-colors"
          aria-label={isVisible ? 'Hide password' : 'Show password'}
        >
          {isVisible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      }
    />
  );
}
