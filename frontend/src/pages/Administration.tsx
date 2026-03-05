/**
 * Administration hub page — cards linking to each admin section
 * with a plan usage summary at the top.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { useAppMode } from "@/hooks/useAppMode";
import { FeatureGate } from "@/components/ui/FeatureGate";
import { cn } from "@/utils/cn";

interface AdminCard {
  to: string;
  titleKey: string;
  descKey: string;
  icon: string;
  colorClass: string;
}

const BASE_CARDS: AdminCard[] = [
  {
    to: "/settings",
    titleKey: "admin.cards.settings.title",
    descKey: "admin.cards.settings.desc",
    icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
    colorClass: "bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400",
  },
  {
    to: "/team",
    titleKey: "admin.cards.team.title",
    descKey: "admin.cards.team.desc",
    icon: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
    colorClass: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
  },
  {
    to: "/notifications",
    titleKey: "admin.cards.notifications.title",
    descKey: "admin.cards.notifications.desc",
    icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9",
    colorClass: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400",
  },
  {
    to: "/developer",
    titleKey: "admin.cards.developer.title",
    descKey: "admin.cards.developer.desc",
    icon: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
    colorClass: "bg-orange-100 text-orange-600 dark:bg-orange-900/30 dark:text-orange-400",
  },
];

const BILLING_CARD: AdminCard = {
  to: "/billing",
  titleKey: "admin.cards.billing.title",
  descKey: "admin.cards.billing.desc",
  icon: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  colorClass: "bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400",
};

const CRM_CARD: AdminCard = {
  to: "/crm",
  titleKey: "admin.cards.crm.title",
  descKey: "admin.cards.crm.desc",
  icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  colorClass: "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
};

const SYNC_CARD: AdminCard = {
  to: "/sync",
  titleKey: "admin.cards.sync.title",
  descKey: "admin.cards.sync.desc",
  icon: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  colorClass: "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
};

function PlanUsageSummary() {
  const { t } = useTranslation("pages");
  const org = useAuthStore((s) => s.currentOrganization);

  if (!org) return null;

  const ghUsed = org.greenhouse_count ?? 0;
  const ghMax = org.max_greenhouses;
  const ghPct = ghMax > 0 ? Math.round((ghUsed / ghMax) * 100) : 0;

  const memberUsed = org.member_count ?? 0;

  const planColors: Record<string, string> = {
    FREE: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
    PRO: "bg-primary/10 text-primary",
    ENTERPRISE: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  };

  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-foreground">{org.name}</h2>
          <p className="text-sm text-muted-foreground">{t("admin.plan")}</p>
        </div>
        <span className={cn("rounded-full px-3 py-1 text-sm font-medium", planColors[org.plan] ?? planColors.FREE)}>
          {org.plan}
        </span>
      </div>

      {/* Usage bars */}
      <div className="space-y-3">
        <div>
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>{t("admin.greenhouses")}</span>
            <span>{ghUsed} / {ghMax}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-muted">
            <div
              className={cn(
                "h-2 rounded-full transition-all",
                ghPct >= 90 ? "bg-destructive" : ghPct >= 70 ? "bg-amber-500" : "bg-primary"
              )}
              style={{ width: `${Math.min(ghPct, 100)}%` }}
            />
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">{t("admin.members")}</span>
          <span className="font-medium text-foreground">{memberUsed}</span>
        </div>

        {org.is_on_trial && !org.trial_expired && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
            {t("admin.trialActive")}
          </p>
        )}
      </div>
    </div>
  );
}

function AdminCardItem({ card }: { card: AdminCard }) {
  const { t } = useTranslation("pages");
  return (
    <Link
      to={card.to}
      className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/30 hover:shadow-md"
    >
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", card.colorClass)}>
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={card.icon} />
        </svg>
      </div>
      <div>
        <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
          {t(card.titleKey)}
        </h3>
        <p className="mt-0.5 text-sm text-muted-foreground">{t(card.descKey)}</p>
      </div>
      <svg className="ml-auto h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default function Administration() {
  const { t } = useTranslation("pages");
  const { features } = useAppMode();

  const cards = [
    ...BASE_CARDS,
    ...(features.billing ? [BILLING_CARD] : []),
    ...(features.crm ? [CRM_CARD] : []),
    ...(features.cloudSync ? [SYNC_CARD] : []),
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("admin.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("admin.subtitle")}</p>
      </div>

      <PlanUsageSummary />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((card) => (
          <AdminCardItem key={card.to} card={card} />
        ))}
      </div>
    </div>
  );
}
