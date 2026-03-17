import { useState, useCallback, useRef } from 'react';

import type { ToastVariant } from '../types';

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timerRefs = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    const timer = timerRefs.current.get(id);
    if (timer) { clearTimeout(timer); timerRefs.current.delete(id); }
  }, []);

  const show = useCallback((message: string, variant: ToastVariant = 'info', duration = 4000) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const toast: Toast = { id, message, variant, duration };
    setToasts(prev => [...prev, toast]);
    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      timerRefs.current.set(id, timer);
    }
    return id;
  }, [dismiss]);

  return {
    toasts,
    show,
    dismiss,
    success: (msg: string, dur?: number) => show(msg, 'success', dur),
    error: (msg: string, dur?: number) => show(msg, 'error', dur),
    warning: (msg: string, dur?: number) => show(msg, 'warning', dur),
    info: (msg: string, dur?: number) => show(msg, 'info', dur),
  };
}
