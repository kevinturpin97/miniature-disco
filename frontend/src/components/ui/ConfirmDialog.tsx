/**
 * Confirmation dialog built on Modal.
 */

import { useTranslation } from "react-i18next";
import { Modal } from "./Modal";

interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  loading?: boolean;
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, loading }: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <p className="text-sm text-muted-foreground">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button
          onClick={onClose}
          disabled={loading}
          className="rounded-lg px-4 py-2 text-sm font-medium text-foreground hover:bg-accent transition-colors disabled:opacity-50"
        >
          {t("actions.cancel")}
        </button>
        <button
          onClick={onConfirm}
          disabled={loading}
          className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 transition-colors disabled:opacity-50"
        >
          {loading ? "..." : t("actions.delete")}
        </button>
      </div>
    </Modal>
  );
}
