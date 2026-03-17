import { AnimatePresence } from 'framer-motion';
import { Toast } from './Toast';
import { useToast } from '@ui/hooks/useToast';

export function ToastContainer() {
  const { toasts, dismiss } = useToast();
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <Toast
              id={t.id}
              message={t.message}
              variant={t.variant}
              onDismiss={dismiss}
            />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
