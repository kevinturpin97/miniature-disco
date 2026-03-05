/**
 * Top header bar with hamburger menu, org switcher,
 * alert badge, dark mode toggle, and user dropdown.
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuthStore } from "@/stores/authStore";
import { useAppMode } from "@/hooks/useAppMode";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";
import { cn } from "@/utils/cn";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const { unacknowledgedCount } = useAlerts();
  const { t } = useTranslation();
  const { isEdgeMode, modeBadge } = useAppMode();
  const organizations = useAuthStore((s) => s.organizations);
  const currentOrganization = useAuthStore((s) => s.currentOrganization);
  const switchOrganization = useAuthStore((s) => s.switchOrganization);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [orgDropdownOpen, setOrgDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const orgDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
      if (orgDropdownRef.current && !orgDropdownRef.current.contains(e.target as Node)) {
        setOrgDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="flex h-14 items-center justify-between border-b border-border bg-card px-4">
      {/* Left: hamburger + org switcher */}
      <div className="flex items-center gap-2">
        <button
          onClick={onMenuClick}
          className="rounded-md p-2 text-foreground/60 hover:bg-accent hover:text-foreground lg:hidden"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Organization switcher (desktop) */}
        <div className="hidden lg:block" ref={orgDropdownRef}>
          {organizations.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
              >
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="max-w-50 truncate">
                  {currentOrganization?.name ?? t("team.noOrg")}
                </span>
                {currentOrganization?.my_role && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {currentOrganization.my_role}
                  </span>
                )}
                <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {orgDropdownOpen && (
                <div className="absolute left-0 z-50 mt-2 w-64 rounded-xl border border-border bg-popover p-2 shadow-lg">
                  <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    {t("team.organizations")}
                  </p>
                  {organizations.map((org) => (
                    <button
                      key={org.slug}
                      onClick={() => {
                        switchOrganization(org.slug);
                        setOrgDropdownOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors",
                        currentOrganization?.slug === org.slug
                          ? "bg-primary/10 text-primary"
                          : "text-foreground hover:bg-accent"
                      )}
                    >
                      <span className="flex-1 truncate text-left">{org.name}</span>
                      <span className="text-xs text-muted-foreground">{org.my_role}</span>
                      {currentOrganization?.slug === org.slug && (
                        <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: mode badge, lang switcher, dark mode, alerts, user dropdown */}
      <div className="flex items-center gap-1.5">
        {/* Edge / Cloud mode badge */}
        <span
          className={cn(
            "hidden items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium sm:flex",
            isEdgeMode
              ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
              : "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400"
          )}
          title={isEdgeMode ? t("header.edgeMode") : t("header.cloudMode")}
        >
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            {isEdgeMode ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
            )}
          </svg>
          {modeBadge}
        </span>
        <LanguageSwitcher />
        <DarkModeToggle />

        {/* Alert notification badge */}
        <Link
          to="/alerts"
          className="relative rounded-lg p-2 text-foreground/60 hover:bg-accent hover:text-foreground transition-colors"
          aria-label="Alerts"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          {unacknowledgedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {unacknowledgedCount > 99 ? "99+" : unacknowledgedCount}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
          >
            <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-primary">
              <span className="text-xs font-semibold">
                {user?.username?.charAt(0).toUpperCase() ?? "U"}
              </span>
            </div>
            <span className="hidden md:block">{user?.username ?? "User"}</span>
            <svg className="h-4 w-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 z-50 mt-2 w-48 rounded-xl border border-border bg-popover p-2 shadow-lg">
              <p className="px-2 py-1 text-xs text-muted-foreground truncate">
                {user?.email}
              </p>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="mt-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                {t("actions.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
