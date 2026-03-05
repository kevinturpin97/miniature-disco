/**
 * Billing page — plan overview, usage stats, upgrade CTA, subscription management.
 */

import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import toast from "react-hot-toast";
import { format, formatDistanceToNow } from "date-fns";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/Spinner";
import type { BillingOverview, OrgPlan } from "@/types";
import * as billingApi from "@/api/billing";

// ---------------------------------------------------------------------------
// Plan details
// ---------------------------------------------------------------------------

const PLAN_INFO: Record<
  OrgPlan,
  { greenhouses: number | string; zones: number | string; members: number | string }
> = {
  FREE: { greenhouses: 3, zones: 5, members: 3 },
  PRO: { greenhouses: 20, zones: 50, members: 20 },
  ENTERPRISE: { greenhouses: "Unlimited", zones: "Unlimited", members: "Unlimited" },
};

const PLAN_ORDER: OrgPlan[] = ["FREE", "PRO", "ENTERPRISE"];

// ---------------------------------------------------------------------------
// Usage bar component
// ---------------------------------------------------------------------------

function UsageBar({
  label,
  used,
  max,
}: {
  label: string;
  used: number;
  max: number;
}) {
  const pct = max === 0 ? 100 : Math.min(100, Math.round((used / max) * 100));
  const isNearLimit = pct >= 80;
  const isAtLimit = pct >= 100;

  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1">
        <span className="text-base-content/70">{label}</span>
        <span className={isAtLimit ? "text-error font-semibold" : "text-base-content"}>
          {used} / {max === 0 ? "\u221e" : max}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-base-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit ? "bg-error" : isNearLimit ? "bg-warning" : "bg-primary"
          }`}
          style={{ width: `${max === 0 ? 0 : pct}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan comparison card
// ---------------------------------------------------------------------------

function PlanCard({
  plan,
  isCurrent,
  isUpgrade,
  onUpgrade,
  loading,
  t,
}: {
  plan: OrgPlan;
  isCurrent: boolean;
  isUpgrade: boolean;
  onUpgrade: (plan: OrgPlan) => void;
  loading: boolean;
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  const info = PLAN_INFO[plan];

  return (
    <div
      className={`rounded-xl border p-6 flex flex-col ${
        isCurrent ? "border-primary bg-primary/5 ring-2 ring-primary/20" : "border-base-300 bg-base-100"
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold">{plan}</h3>
        {isCurrent && (
          <span className="badge badge-primary badge-sm">{t("billing.currentPlan")}</span>
        )}
      </div>

      <ul className="space-y-2 text-sm text-base-content/80 flex-1 mb-6">
        <li className="flex items-center gap-2">
          <svg className="h-4 w-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t("billing.planFeatureGreenhouses", { count: info.greenhouses })}
        </li>
        <li className="flex items-center gap-2">
          <svg className="h-4 w-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t("billing.planFeatureZones", { count: info.zones })}
        </li>
        <li className="flex items-center gap-2">
          <svg className="h-4 w-4 text-success shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {t("billing.planFeatureMembers", { count: info.members })}
        </li>
      </ul>

      {isUpgrade && (
        <button
          className="btn btn-primary btn-sm w-full"
          disabled={loading}
          onClick={() => onUpgrade(plan)}
        >
          {loading ? <Spinner className="h-4 w-4" /> : t("billing.upgrade")}
        </button>
      )}
      {isCurrent && plan === "FREE" && (
        <div className="text-center text-xs text-base-content/50">{t("billing.freePlan")}</div>
      )}
      {isCurrent && plan !== "FREE" && (
        <div className="text-center text-xs text-base-content/50">{t("billing.activeSubscription")}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Billing page
// ---------------------------------------------------------------------------

export default function Billing() {
  const { t } = useTranslation("pages");
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState(false);
  const [searchParams] = useSearchParams();

  const fetchBilling = useCallback(async () => {
    if (!currentOrg) return;
    try {
      const { data } = await billingApi.getBillingOverview(currentOrg.slug);
      setOverview(data);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    fetchBilling();
  }, [fetchBilling]);

  // Handle Stripe Checkout return
  useEffect(() => {
    if (searchParams.get("success") === "true") {
      toast.success(t("billing.upgradeSuccess"));
      fetchBilling();
    } else if (searchParams.get("canceled") === "true") {
      toast(t("billing.upgradeCanceled"));
    }
  }, [searchParams, t, fetchBilling]);

  const handleUpgrade = async (plan: OrgPlan) => {
    if (!currentOrg) return;
    setUpgrading(true);
    try {
      const { data } = await billingApi.createCheckoutSession(currentOrg.slug, plan);
      window.location.href = data.checkout_url;
    } catch {
      setUpgrading(false);
    }
  };

  const handleManageBilling = async () => {
    if (!currentOrg) return;
    try {
      const { data } = await billingApi.createCustomerPortal(currentOrg.slug);
      window.location.href = data.portal_url;
    } catch {
      // handled by interceptor
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="h-10 w-10" />
      </div>
    );
  }

  if (!overview) {
    return (
      <div className="text-center py-20 text-base-content/50">
        {t("billing.loadError")}
      </div>
    );
  }

  const { plan, is_on_trial, trial_ends_at, trial_expired, subscription, usage } = overview;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">{t("billing.title")}</h1>
        <p className="text-base-content/60 mt-1">{t("billing.subtitle")}</p>
      </div>

      {/* Trial banner */}
      {is_on_trial && !trial_expired && trial_ends_at && (
        <div className="alert alert-info shadow-sm">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>
            {t("billing.trialActive", {
              days: formatDistanceToNow(new Date(trial_ends_at), { addSuffix: false }),
            })}
          </span>
        </div>
      )}
      {trial_expired && plan === "FREE" && (
        <div className="alert alert-warning shadow-sm">
          <svg className="h-5 w-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>
          <span>{t("billing.trialExpired")}</span>
        </div>
      )}

      {/* Subscription status + Manage */}
      {subscription && (
        <div className="card bg-base-100 border border-base-300 shadow-sm">
          <div className="card-body">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="card-title text-lg">{t("billing.subscriptionTitle")}</h2>
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                  <span className={`badge ${subscription.status === "ACTIVE" ? "badge-success" : subscription.status === "PAST_DUE" ? "badge-error" : "badge-warning"}`}>
                    {subscription.status}
                  </span>
                  {subscription.current_period_end && (
                    <span className="text-base-content/60">
                      {t("billing.renewsOn", { date: format(new Date(subscription.current_period_end), "MMM d, yyyy") })}
                    </span>
                  )}
                  {subscription.cancel_at_period_end && (
                    <span className="badge badge-warning badge-outline">{t("billing.cancelsAtEnd")}</span>
                  )}
                </div>
              </div>
              <button className="btn btn-outline btn-sm" onClick={handleManageBilling}>
                {t("billing.manageBilling")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Usage */}
      <div className="card bg-base-100 border border-base-300 shadow-sm">
        <div className="card-body">
          <h2 className="card-title text-lg mb-4">{t("billing.usageTitle")}</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <UsageBar
              label={t("billing.greenhouses")}
              used={usage.greenhouses}
              max={usage.max_greenhouses}
            />
            <UsageBar
              label={t("billing.zones")}
              used={usage.zones}
              max={usage.max_zones}
            />
            <UsageBar
              label={t("billing.members")}
              used={usage.members}
              max={usage.max_members}
            />
          </div>
        </div>
      </div>

      {/* Plan comparison */}
      <div>
        <h2 className="text-lg font-bold mb-4">{t("billing.plansTitle")}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {PLAN_ORDER.map((p) => (
            <PlanCard
              key={p}
              plan={p}
              isCurrent={plan === p}
              isUpgrade={PLAN_ORDER.indexOf(p) > PLAN_ORDER.indexOf(plan)}
              onUpgrade={handleUpgrade}
              loading={upgrading}
              t={t}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
