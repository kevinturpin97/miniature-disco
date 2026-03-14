/**
 * NewFirmwareModal — modal form to publish a new firmware release.
 *
 * Validates with Zod inline (real-time).
 * Submit disabled while validation errors exist.
 * Animations: overlay fade 200ms, modal scale+fade 300ms.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { z } from "zod";
import { publishFirmwareRelease, type FirmwareChannel } from "@/api/fleet";

const schema = z.object({
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+(-[\w.]+)?$/, "fleet.validation.versionFormat"),
  channel: z.enum(["STABLE", "BETA", "NIGHTLY"]),
  binary_url: z.string().url("fleet.validation.urlInvalid"),
  checksum_sha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/, "fleet.validation.checksumInvalid"),
  file_size_bytes: z.number().int().positive("fleet.validation.fileSizePositive"),
  release_notes: z.string().optional(),
  min_hardware_version: z.string().optional(),
});

type FormData = z.infer<typeof schema>;

interface FieldError {
  [key: string]: string | undefined;
}

interface NewFirmwareModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function NewFirmwareModal({ open, onClose, onSuccess }: NewFirmwareModalProps) {
  const { t } = useTranslation("pages");

  const [form, setForm] = useState<Partial<FormData>>({ channel: "STABLE" });
  const [errors, setErrors] = useState<FieldError>({});
  const [submitting, setSubmitting] = useState(false);

  function validate(data: Partial<FormData>): FieldError {
    const result = schema.safeParse({
      ...data,
      file_size_bytes: data.file_size_bytes,
    });
    if (result.success) return {};
    const errs: FieldError = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0]);
      errs[key] = t(issue.message as Parameters<typeof t>[0], { defaultValue: issue.message });
    }
    return errs;
  }

  function handleChange(field: keyof FormData, value: string | number) {
    const updated = { ...form, [field]: value };
    setForm(updated);
    setErrors(validate(updated));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate(form);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }
    setSubmitting(true);
    try {
      await publishFirmwareRelease(form as Parameters<typeof publishFirmwareRelease>[0]);
      toast.success(t("fleet.firmware.published"));
      onSuccess();
      onClose();
      setForm({ channel: "STABLE" });
      setErrors({});
    } catch {
      toast.error(t("fleet.firmware.publishError"));
    } finally {
      setSubmitting(false);
    }
  }

  const hasErrors = Object.keys(errors).length > 0;
  const isFormEmpty = !form.version || !form.binary_url || !form.checksum_sha256;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Overlay */}
          <motion.div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              className="w-full max-w-[480px] max-h-[90vh] overflow-y-auto rounded-2xl border border-white/5 bg-base-100 shadow-2xl shadow-black/40"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 pb-0">
                <h2 className="text-lg font-semibold text-base-content">
                  {t("fleet.firmware.newRelease")}
                </h2>
                <button
                  onClick={onClose}
                  className="btn btn-ghost btn-sm btn-circle"
                  aria-label={t("common.close", { defaultValue: "Close" })}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Body */}
              <form onSubmit={handleSubmit}>
                <div className="flex flex-col gap-4 p-6">
                  {/* Version + Channel */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-base-content">
                        {t("fleet.firmware.version")} <span className="text-error">*</span>
                      </label>
                      <input
                        type="text"
                        placeholder="3.2.2"
                        value={form.version ?? ""}
                        onChange={(e) => handleChange("version", e.target.value)}
                        className={`input input-bordered h-10 w-full bg-base-200/50 text-sm ${
                          errors.version ? "border-error/50" : "border-white/5 focus:border-primary/50"
                        }`}
                      />
                      {errors.version && (
                        <p className="mt-1 text-xs text-error">{errors.version}</p>
                      )}
                    </div>

                    <div>
                      <label className="mb-1 block text-sm font-medium text-base-content">
                        {t("fleet.firmware.channel")} <span className="text-error">*</span>
                      </label>
                      <select
                        value={form.channel ?? "STABLE"}
                        onChange={(e) => handleChange("channel", e.target.value as FirmwareChannel)}
                        className="select select-bordered h-10 min-h-0 w-full bg-base-200/50 text-sm border-white/5 focus:border-primary/50"
                      >
                        <option value="STABLE">Stable</option>
                        <option value="BETA">Beta</option>
                        <option value="NIGHTLY">Nightly</option>
                      </select>
                    </div>
                  </div>

                  {/* Binary URL */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-base-content">
                      {t("fleet.firmware.binaryUrl")} <span className="text-error">*</span>
                    </label>
                    <input
                      type="url"
                      placeholder="https://releases.example.com/v3.2.2.bin"
                      value={form.binary_url ?? ""}
                      onChange={(e) => handleChange("binary_url", e.target.value)}
                      className={`input input-bordered h-10 w-full bg-base-200/50 text-sm ${
                        errors.binary_url ? "border-error/50" : "border-white/5 focus:border-primary/50"
                      }`}
                    />
                    {errors.binary_url && (
                      <p className="mt-1 text-xs text-error">{errors.binary_url}</p>
                    )}
                  </div>

                  {/* SHA256 */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-base-content">
                      {t("fleet.firmware.checksum")} <span className="text-error">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="a7f3b2c..."
                      value={form.checksum_sha256 ?? ""}
                      onChange={(e) => handleChange("checksum_sha256", e.target.value.toLowerCase())}
                      className={`input input-bordered h-10 w-full bg-base-200/50 font-mono text-xs ${
                        errors.checksum_sha256 ? "border-error/50" : "border-white/5 focus:border-primary/50"
                      }`}
                    />
                    {errors.checksum_sha256 && (
                      <p className="mt-1 text-xs text-error">{errors.checksum_sha256}</p>
                    )}
                  </div>

                  {/* File size */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-base-content">
                      {t("fleet.firmware.fileSize")} (bytes) <span className="text-error">*</span>
                    </label>
                    <input
                      type="number"
                      min={1}
                      placeholder="524288"
                      value={form.file_size_bytes ?? ""}
                      onChange={(e) => handleChange("file_size_bytes", parseInt(e.target.value) || 0)}
                      className={`input input-bordered h-10 w-full bg-base-200/50 text-sm ${
                        errors.file_size_bytes ? "border-error/50" : "border-white/5 focus:border-primary/50"
                      }`}
                    />
                    {errors.file_size_bytes && (
                      <p className="mt-1 text-xs text-error">{errors.file_size_bytes}</p>
                    )}
                  </div>

                  {/* Release notes */}
                  <div>
                    <label className="mb-1 block text-sm font-medium text-base-content">
                      {t("fleet.firmware.releaseNotes")}
                    </label>
                    <textarea
                      value={form.release_notes ?? ""}
                      onChange={(e) => handleChange("release_notes", e.target.value)}
                      rows={3}
                      className="textarea textarea-bordered w-full resize-y bg-base-200/50 text-sm border-white/5 focus:border-primary/50"
                    />
                  </div>
                </div>

                {/* Footer */}
                <div className="flex justify-end gap-3 p-6 pt-0">
                  <button type="button" onClick={onClose} className="btn btn-ghost btn-sm">
                    {t("common.cancel", { defaultValue: "Cancel" })}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting || hasErrors || isFormEmpty}
                    className="btn btn-primary btn-sm disabled:opacity-50"
                  >
                    {submitting ? (
                      <span className="loading loading-spinner loading-xs" />
                    ) : (
                      t("fleet.firmware.publish")
                    )}
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
