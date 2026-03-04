/**
 * Top header bar with hamburger menu, org switcher, alert badge, dark mode toggle, and user dropdown.
 */

import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/hooks/useAuth";
import { useAlerts } from "@/hooks/useAlerts";
import { useAuthStore } from "@/stores/authStore";
import { LanguageSwitcher } from "@/components/ui/LanguageSwitcher";
import { DarkModeToggle } from "@/components/ui/DarkModeToggle";

interface HeaderProps {
  onMenuClick: () => void;
}

export function Header({ onMenuClick }: HeaderProps) {
  const { user, logout } = useAuth();
  const { unacknowledgedCount } = useAlerts();
  const { t } = useTranslation();
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
    <header className="flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Hamburger (mobile) */}
      <button
        onClick={onMenuClick}
        className="rounded-md p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 lg:hidden"
      >
        <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      {/* Organization switcher */}
      <div className="hidden lg:block" ref={orgDropdownRef}>
        {organizations.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
              className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-700"
            >
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="max-w-[200px] truncate">
                {currentOrganization?.name ?? t("team.noOrg")}
              </span>
              {currentOrganization?.my_role && (
                <span className="rounded bg-primary-100 px-1.5 py-0.5 text-xs text-primary-700 dark:bg-primary-900 dark:text-primary-300">
                  {currentOrganization.my_role}
                </span>
              )}
              <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {orgDropdownOpen && (
              <div className="absolute left-0 z-10 mt-2 w-64 rounded-lg border bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
                <div className="border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-gray-400 dark:border-gray-700">
                  {t("team.organizations")}
                </div>
                {organizations.map((org) => (
                  <button
                    key={org.slug}
                    onClick={() => {
                      switchOrganization(org.slug);
                      setOrgDropdownOpen(false);
                    }}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 ${
                      currentOrganization?.slug === org.slug
                        ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                        : "text-gray-700 dark:text-gray-200"
                    }`}
                  >
                    <span className="flex-1 truncate text-left">{org.name}</span>
                    <span className="text-xs text-gray-400">{org.my_role}</span>
                    {currentOrganization?.slug === org.slug && (
                      <svg className="h-4 w-4 text-primary-600 dark:text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Right side: lang switcher + dark mode + alert badge + user dropdown */}
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <DarkModeToggle />

        {/* Alert notification badge */}
        <Link
          to="/alerts"
          className="relative rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200"
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
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-red-500 px-1 text-xs font-bold text-white">
              {unacknowledgedCount > 99 ? "99+" : unacknowledgedCount}
            </span>
          )}
        </Link>

        {/* User dropdown */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-700"
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-primary-700 text-sm font-semibold dark:bg-primary-900 dark:text-primary-300">
              {user?.username?.charAt(0).toUpperCase() ?? "U"}
            </div>
            <span className="hidden md:block">{user?.username ?? "User"}</span>
            <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border bg-white py-1 shadow-lg dark:border-gray-600 dark:bg-gray-800">
              <div className="border-b px-4 py-2 text-sm text-gray-500 dark:border-gray-700 dark:text-gray-400">
                {user?.email}
              </div>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  logout();
                }}
                className="flex w-full items-center px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
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
