/**
 * Mobile bottom navigation bar — visible only on small screens.
 * Shows 5 grouped items (icons only) with alert badge.
 */

import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";
import { useAlerts } from "@/hooks/useAlerts";

const BOTTOM_ITEMS = [
  {
    to: "/",
    labelKey: "nav.groups.overview",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
    matchPaths: ["/", "/quick-actions"],
  },
  {
    to: "/alerts",
    labelKey: "nav.groups.supervision",
    icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    matchPaths: ["/alerts", "/sites"],
    showAlertBadge: true,
  },
  {
    to: "/commands",
    labelKey: "nav.groups.control",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
    matchPaths: ["/commands", "/automations", "/scenarios"],
  },
  {
    to: "/analytics",
    labelKey: "nav.groups.data",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4",
    matchPaths: ["/history", "/analytics", "/culture-journal", "/marketplace"],
  },
  {
    to: "/administration",
    labelKey: "nav.groups.administration",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
    matchPaths: ["/administration", "/settings", "/team", "/billing", "/developer"],
  },
];

export function BottomNav() {
  const { t } = useTranslation();
  const { unacknowledgedCount } = useAlerts();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 flex items-center justify-around border-t border-border bg-card pb-safe lg:hidden">
      {BOTTOM_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/"}
          className={({ isActive: directActive }) => {
            // Also check if any matchPath starts with current location
            const isActive =
              directActive ||
              item.matchPaths.some((p) =>
                p === "/" ? false : window.location.pathname.startsWith(p)
              );
            return cn(
              "relative flex flex-col items-center gap-0.5 px-4 py-2.5 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
            );
          }}
          aria-label={t(item.labelKey)}
        >
          {({ isActive: directActive }) => {
            const isActive =
              directActive ||
              item.matchPaths.some((p) =>
                p === "/" ? false : window.location.pathname.startsWith(p)
              );
            return (
              <div className="relative">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={isActive ? 2 : 1.5} d={item.icon} />
                </svg>
                {item.showAlertBadge && unacknowledgedCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-0.5 text-[9px] font-bold text-destructive-foreground">
                    {unacknowledgedCount > 99 ? "99+" : unacknowledgedCount}
                  </span>
                )}
              </div>
            );
          }}
        </NavLink>
      ))}
    </nav>
  );
}
