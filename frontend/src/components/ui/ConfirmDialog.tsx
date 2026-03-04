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
      <p className="text-sm text-base-content/60">{message}</p>
      <div className="mt-6 flex justify-end gap-3">
        <button onClick={onClose} disabled={loading} className="btn btn-ghost">
          {t("actions.cancel")}
        </button>
        <button onClick={onConfirm} disabled={loading} className="btn btn-error">
          {loading ? "..." : t("actions.delete")}
        </button>
      </div>
    </Modal>
  );
}
