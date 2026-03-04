/**
 * Mobile bottom navigation bar — visible only on small screens.
 */

import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";

const BOTTOM_ITEMS = [
  {
    to: "/",
    labelKey: "nav.dashboard",
    icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4",
  },
  {
    to: "/quick-actions",
    labelKey: "nav.quickActions",
    icon: "M13 10V3L4 14h7v7l9-11h-7z",
  },
  {
    to: "/alerts",
    labelKey: "nav.alerts",
    icon: "M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9",
  },
  {
    to: "/commands",
    labelKey: "nav.commands",
    icon: "M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z",
  },
  {
    to: "/settings",
    labelKey: "nav.settings",
    icon: "M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4",
  },
];

export function BottomNav() {
  const { t } = useTranslation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t bg-white pb-safe dark:border-gray-700 dark:bg-gray-800 lg:hidden">
      <div className="flex items-center justify-around">
        {BOTTOM_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-2 text-[10px] font-medium transition-colors ${
                isActive
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-gray-500 dark:text-gray-400"
              }`
            }
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
            </svg>
            <span>{t(item.labelKey)}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
