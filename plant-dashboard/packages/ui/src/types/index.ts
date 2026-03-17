import type { ReactNode } from 'react';

export type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'success' | 'warning';
export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ButtonProps {
  children?: ReactNode;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onAction?: () => void | Promise<void>;
  type?: 'button' | 'submit' | 'reset';
  className?: string;
}

export interface InputProps {
  label?: string;
  placeholder?: string;
  value?: string;
  defaultValue?: string;
  type?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  required?: boolean;
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
  onChangeValue?: (value: string) => void;
  onBlur?: () => void;
  name?: string;
  autoComplete?: string;
  className?: string;
}

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  showClose?: boolean;
  className?: string;
}

export interface CardProps {
  children?: ReactNode;
  className?: string;
  glow?: boolean;
  glowColor?: string;
  glassmorphism?: boolean;
  onClick?: () => void;
  hoverable?: boolean;
}

export interface BadgeProps {
  children?: ReactNode;
  variant?: Variant | 'neutral';
  size?: Size;
  dot?: boolean;
  className?: string;
}

export interface AvatarProps {
  src?: string;
  alt?: string;
  name?: string;
  size?: Size;
  className?: string;
}

export interface SpinnerProps {
  size?: Size;
  variant?: Variant;
  className?: string;
}

export interface ToastProps {
  id: string;
  message: string;
  variant: ToastVariant;
  onDismiss: (id: string) => void;
}
