/**
 * Sidebar navigation with 5 grouped sections.
 * Supports collapsible compact mode (icon-only).
 * Dynamic items based on app mode (Edge / Cloud).
 */

import { useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { cn } from "@/utils/cn";
import { useAppMode } from "@/hooks/useAppMode";
import { useAlerts } from "@/hooks/useAlerts";

interface NavItem {
  to: string;
  labelKey: string;
  icon: string;
  badge?: number;
}

interface NavGroup {
  groupKey: string;
  icon: string;
  items: NavItem[];
  featureGated?: boolean;
  show?: boolean;
}

// SVG paths for group icons
const ICONS = {
  overview: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
  supervision: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  control: "M13 10V3L4 14h7v7l9-11h-7z",
  data: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
  admin: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
};

const NAV_ITEM_ICONS: Record<string, string> = {
  dashboard: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
  quickActions: "M13 10V3L4 14h7v7l9-11h-7z",
  alerts: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  sites: "M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z M15 11a3 3 0 11-6 0 3 3 0 016 0z",
  commands: "M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  automations: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  scenarios: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  history: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  analytics: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  marketplace: "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z",
  cultureJournal: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  administration: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  settings: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  notifications: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0a3 3 0 11-6 0m6 0H9",
  billing: "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z",
  team: "M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z",
  developer: "M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4",
  crm: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4",
  sync: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  fleet: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18",
};

interface SidebarProps {
  onClose: () => void;
  compact?: boolean;
  onToggleCompact?: () => void;
}

function NavGroupSection({
  group,
  compact,
  unacknowledgedCount,
  onClose,
}: {
  group: NavGroup;
  compact: boolean;
  unacknowledgedCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const [expanded, setExpanded] = useState(true);

  const isGroupActive = group.items.some((item) =>
    item.to === "/" ? location.pathname === "/" : location.pathname.startsWith(item.to)
  );

  return (
    <li className="mb-1">
      {/* Group header (only shown in expanded mode) */}
      {!compact && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className={cn(
            "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors",
            isGroupActive ? "text-primary" : "text-sidebar-foreground/40 hover:text-sidebar-foreground/70"
          )}
        >
          <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={ICONS.overview} />
          </svg>
          <span className="flex-1 text-left">{t(group.groupKey)}</span>
          <svg
            className={cn("h-3 w-3 transition-transform", expanded ? "rotate-180" : "")}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Compact mode: just a divider */}
      {compact && <div className="mx-3 my-1 border-t border-sidebar-border/50" />}

      {/* Items */}
      {(expanded || compact) && (
        <ul className="space-y-0.5">
          {group.items.map((item) => {
            const isActive =
              item.to === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(item.to);
            const badge = item.to === "/alerts" ? unacknowledgedCount : (item.badge ?? 0);

            return (
              <li key={item.to} className="relative">
                {isActive && (
                  <motion.div
                    layoutId="sidebarActive"
                    className="absolute inset-0 rounded-lg bg-primary/10"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                {isActive && (
                  <motion.div
                    layoutId="sidebarDot"
                    className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <NavLink
                  to={item.to}
                  end={item.to === "/"}
                  onClick={onClose}
                  title={compact ? t(item.labelKey) : undefined}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    compact && "justify-center px-2",
                    isActive
                      ? "text-primary"
                      : "text-sidebar-foreground/70 hover:bg-accent hover:text-sidebar-foreground"
                  )}
                >
                  <div className="relative shrink-0">
                    <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
                    </svg>
                    {badge > 0 && (
                      <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </div>
                  {!compact && <span className="flex-1">{t(item.labelKey)}</span>}
                </NavLink>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export function Sidebar({ onClose, compact = false, onToggleCompact }: SidebarProps) {
  const { t } = useTranslation();
  const { features } = useAppMode();
  const { unacknowledgedCount } = useAlerts();

  const NAV_GROUPS: NavGroup[] = [
    {
      groupKey: "nav.groups.overview",
      icon: ICONS.overview,
      items: [
        { to: "/", labelKey: "nav.dashboard", icon: NAV_ITEM_ICONS.dashboard },
        { to: "/quick-actions", labelKey: "nav.quickActions", icon: NAV_ITEM_ICONS.quickActions },
      ],
    },
    {
      groupKey: "nav.groups.supervision",
      icon: ICONS.supervision,
      items: [
        { to: "/alerts", labelKey: "nav.alerts", icon: NAV_ITEM_ICONS.alerts },
        { to: "/sites", labelKey: "nav.sites", icon: NAV_ITEM_ICONS.sites },
        ...(features.loraBridge
          ? [{ to: "/mqtt", labelKey: "nav.mqtt", icon: NAV_ITEM_ICONS.notifications }]
          : []),
      ],
    },
    {
      groupKey: "nav.groups.control",
      icon: ICONS.control,
      items: [
        { to: "/commands", labelKey: "nav.commands", icon: NAV_ITEM_ICONS.commands },
        { to: "/automations", labelKey: "nav.automations", icon: NAV_ITEM_ICONS.automations },
        { to: "/scenarios", labelKey: "nav.scenarios", icon: NAV_ITEM_ICONS.scenarios },
      ],
    },
    {
      groupKey: "nav.groups.data",
      icon: ICONS.data,
      items: [
        { to: "/history", labelKey: "nav.history", icon: NAV_ITEM_ICONS.history },
        { to: "/analytics", labelKey: "nav.analytics", icon: NAV_ITEM_ICONS.analytics },
        { to: "/culture-journal", labelKey: "nav.cultureJournal", icon: NAV_ITEM_ICONS.cultureJournal },
        { to: "/marketplace", labelKey: "nav.marketplace", icon: NAV_ITEM_ICONS.marketplace },
      ],
    },
    {
      groupKey: "nav.groups.administration",
      icon: ICONS.admin,
      items: [
        { to: "/administration", labelKey: "nav.administration", icon: NAV_ITEM_ICONS.administration },
        { to: "/settings", labelKey: "nav.settings", icon: NAV_ITEM_ICONS.settings },
        ...(features.crm
          ? [{ to: "/crm", labelKey: "nav.crm", icon: NAV_ITEM_ICONS.crm }]
          : []),
        ...(features.cloudSync
          ? [{ to: "/sync", labelKey: "nav.sync", icon: NAV_ITEM_ICONS.sync }]
          : []),
        ...(features.fleet
          ? [{ to: "/fleet", labelKey: "nav.fleet", icon: NAV_ITEM_ICONS.fleet }]
          : []),
      ],
    },
  ];

  return (
    <div
      className={cn(
        "flex h-full flex-col bg-sidebar border-r border-sidebar-border transition-all duration-200",
        compact ? "w-14" : "w-55"
      )}
    >
      {/* Logo */}
      <div className={cn("flex h-14 items-center border-b border-sidebar-border/50", compact ? "justify-center px-2" : "justify-between px-4")}>
        {!compact && (
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
              G
            </div>
            <span className="text-base font-semibold text-sidebar-foreground">Greenhouse</span>
          </div>
        )}
        {compact && (
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
            G
          </div>
        )}

        {/* Close button (mobile) or toggle compact (desktop) */}
        {!compact && (
          <div className="flex items-center gap-1">
            {onToggleCompact && (
              <button
                onClick={onToggleCompact}
                className="hidden rounded-md p-1 text-sidebar-foreground/60 hover:bg-accent hover:text-sidebar-foreground lg:block"
                title={t("nav.collapse")}
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="rounded-md p-1 text-sidebar-foreground/60 hover:bg-accent hover:text-sidebar-foreground lg:hidden"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        {compact && onToggleCompact && (
          <button
            onClick={onToggleCompact}
            className="absolute top-3 right-1 hidden rounded-md p-1 text-sidebar-foreground/60 hover:bg-accent hover:text-sidebar-foreground lg:block"
            title={t("nav.expand")}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul>
          {NAV_GROUPS.map((group) => (
            <NavGroupSection
              key={group.groupKey}
              group={group}
              compact={compact}
              unacknowledgedCount={unacknowledgedCount}
              onClose={onClose}
            />
          ))}
        </ul>
      </nav>

      {/* Bottom toggle expand/collapse */}
      {onToggleCompact && (
        <div className={cn("border-t border-sidebar-border/50 p-2", compact && "flex justify-center")}>
          <button
            onClick={onToggleCompact}
            className="hidden w-full items-center gap-2 rounded-lg px-3 py-2 text-xs text-sidebar-foreground/50 hover:bg-accent hover:text-sidebar-foreground transition-colors lg:flex"
          >
            {compact ? (
              <svg className="h-4 w-4 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            ) : (
              <>
                <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
                <span>{t("nav.collapse")}</span>
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
