/**
 * OnboardingWizard — 3-step first-login wizard.
 *
 * Step 1: Create organization
 * Step 2: Create greenhouse
 * Step 3: Create zone
 *
 * Shown when the user has no organizations yet.
 * Dismissed on skip or completion; state persisted in localStorage.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";
import { createOrganization } from "@/api/organizations";
import { createGreenhouse } from "@/api/greenhouses";
import { createZone } from "@/api/zones";
import { useAuthStore } from "@/stores/authStore";
import { cn } from "@/utils/cn";

const ONBOARDING_DISMISSED_KEY = "onboarding_dismissed";

export function useOnboardingVisible(): { visible: boolean; dismiss: () => void } {
  const organizations = useAuthStore((s) => s.organizations);
  const dismissed = localStorage.getItem(ONBOARDING_DISMISSED_KEY) === "true";
  const visible = !dismissed && organizations.length === 0;
  return {
    visible,
    dismiss: () => localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true"),
  };
}

const step1Schema = z.object({ name: z.string().min(2, "Min 2 characters") });
const step2Schema = z.object({
  name: z.string().min(2, "Min 2 characters"),
  location: z.string().optional(),
});
const step3Schema = z.object({ name: z.string().min(2, "Min 2 characters") });

interface StepIndicatorProps {
  current: number;
  total: number;
}

function StepIndicator({ current, total }: StepIndicatorProps) {
  return (
    <div className="flex items-center justify-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-2 rounded-full transition-all",
            i === current ? "w-6 bg-primary" : i < current ? "w-2 bg-primary/40" : "w-2 bg-muted"
          )}
        />
      ))}
    </div>
  );
}

interface OnboardingWizardProps {
  onDismiss: () => void;
}

export function OnboardingWizard({ onDismiss }: OnboardingWizardProps) {
  const { t } = useTranslation("pages");
  const fetchOrganizations = useAuthStore((s) => s.fetchOrganizations);
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);

  // Form state per step
  const [orgName, setOrgName] = useState("");
  const [ghName, setGhName] = useState("");
  const [ghLocation, setGhLocation] = useState("");
  const [zoneName, setZoneName] = useState("");
  const [error, setError] = useState("");

  // IDs created in prior steps
  const [orgSlug, setOrgSlug] = useState("");
  const [ghId, setGhId] = useState<number | null>(null);

  async function handleStep1() {
    const result = step1Schema.safeParse({ name: orgName });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setError("");
    setLoading(true);
    try {
      const org = await createOrganization(orgName);
      setOrgSlug(org.slug);
      await fetchOrganizations();
      setStep(1);
    } catch {
      setError(t("onboarding.errorOrg"));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep2() {
    const result = step2Schema.safeParse({ name: ghName, location: ghLocation });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setError("");
    setLoading(true);
    try {
      const gh = await createGreenhouse({ name: ghName, location: ghLocation, description: "" });
      setGhId(gh.id);
      setStep(2);
    } catch {
      setError(t("onboarding.errorGh"));
    } finally {
      setLoading(false);
    }
  }

  async function handleStep3() {
    if (!ghId) return;
    const result = step3Schema.safeParse({ name: zoneName });
    if (!result.success) { setError(result.error.issues[0].message); return; }
    setError("");
    setLoading(true);
    try {
      await createZone(ghId, { name: zoneName, relay_id: 1, description: "" });
      toast.success(t("onboarding.successMessage"));
      onDismiss();
    } catch {
      setError(t("onboarding.errorZone"));
    } finally {
      setLoading(false);
    }
  }

  const steps = [
    {
      title: t("onboarding.step1Title"),
      desc: t("onboarding.step1Desc"),
      icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5",
      content: (
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">
            {t("onboarding.orgName")}
          </label>
          <input
            type="text"
            value={orgName}
            onChange={(e) => { setOrgName(e.target.value); setError(""); }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="My Farm"
            autoFocus
          />
        </div>
      ),
      onNext: handleStep1,
    },
    {
      title: t("onboarding.step2Title"),
      desc: t("onboarding.step2Desc"),
      icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
      content: (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">
              {t("onboarding.ghName")}
            </label>
            <input
              type="text"
              value={ghName}
              onChange={(e) => { setGhName(e.target.value); setError(""); }}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Greenhouse A"
              autoFocus
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-card-foreground">
              {t("onboarding.ghLocation")}
            </label>
            <input
              type="text"
              value={ghLocation}
              onChange={(e) => setGhLocation(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Paris, France"
            />
          </div>
        </div>
      ),
      onNext: handleStep2,
    },
    {
      title: t("onboarding.step3Title"),
      desc: t("onboarding.step3Desc"),
      icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
      content: (
        <div>
          <label className="mb-1 block text-sm font-medium text-card-foreground">
            {t("onboarding.zoneName")}
          </label>
          <input
            type="text"
            value={zoneName}
            onChange={(e) => { setZoneName(e.target.value); setError(""); }}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="Zone A"
            autoFocus
          />
        </div>
      ),
      onNext: handleStep3,
    },
  ];

  const current = steps[step];
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-2xl border border-border bg-card shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-border p-6">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <svg className="h-5 w-5 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={current.icon} />
              </svg>
            </div>
            <button
              onClick={onDismiss}
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <h2 className="mt-3 text-lg font-semibold text-card-foreground">{current.title}</h2>
          <p className="mt-1 text-sm text-muted-foreground">{current.desc}</p>
        </div>

        {/* Step content */}
        <div className="p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {current.content}
              {error && (
                <p className="mt-2 text-xs text-destructive">{error}</p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border px-6 py-4">
          <StepIndicator current={step} total={steps.length} />

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => { setStep((s) => s - 1); setError(""); }}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                {t("onboarding.back")}
              </button>
            )}
            {step === 0 && (
              <button
                onClick={onDismiss}
                className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent transition-colors"
              >
                {t("onboarding.skip")}
              </button>
            )}
            <button
              onClick={current.onNext}
              disabled={loading}
              className="rounded-lg bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? "…" : isLast ? t("onboarding.finish") : t("onboarding.next")}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
