/**
 * Top header bar (DaisyUI navbar) with hamburger menu, org switcher,
 * alert badge, dark mode toggle, and user dropdown.
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
    <div className="navbar bg-base-100 shadow-xs border-b border-base-300 px-4">
      {/* Navbar start: hamburger + org switcher */}
      <div className="navbar-start">
        {/* Hamburger (mobile) */}
        <button
          onClick={onMenuClick}
          className="btn btn-ghost btn-circle lg:hidden"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        {/* Organization switcher (desktop) */}
        <div className="hidden lg:block" ref={orgDropdownRef}>
          {organizations.length > 0 && (
            <div className="relative">
              <button
                onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
                className="btn btn-ghost btn-sm gap-2"
              >
                <svg className="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                </svg>
                <span className="max-w-[200px] truncate">
                  {currentOrganization?.name ?? t("team.noOrg")}
                </span>
                {currentOrganization?.my_role && (
                  <span className="badge badge-primary badge-sm">
                    {currentOrganization.my_role}
                  </span>
                )}
                <svg className="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {orgDropdownOpen && (
                <ul className="menu bg-base-100 rounded-box absolute left-0 z-10 mt-2 w-64 p-2 shadow-lg border border-base-300">
                  <li className="menu-title text-base-content/40">
                    {t("team.organizations")}
                  </li>
                  {organizations.map((org) => (
                    <li key={org.slug}>
                      <button
                        onClick={() => {
                          switchOrganization(org.slug);
                          setOrgDropdownOpen(false);
                        }}
                        className={
                          currentOrganization?.slug === org.slug ? "active" : ""
                        }
                      >
                        <span className="flex-1 truncate text-left">{org.name}</span>
                        <span className="text-xs text-base-content/40">{org.my_role}</span>
                        {currentOrganization?.slug === org.slug && (
                          <svg className="h-4 w-4 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Navbar end: lang switcher, dark mode, alerts, user dropdown */}
      <div className="navbar-end gap-2">
        <LanguageSwitcher />
        <DarkModeToggle />

        {/* Alert notification badge */}
        <Link
          to="/alerts"
          className="btn btn-ghost btn-circle"
          aria-label="Alerts"
        >
          <div className="indicator">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
              />
            </svg>
            {unacknowledgedCount > 0 && (
              <span className="badge badge-error badge-xs indicator-item">
                {unacknowledgedCount > 99 ? "99+" : unacknowledgedCount}
              </span>
            )}
          </div>
        </Link>

        {/* User dropdown */}
        <div className="dropdown dropdown-end" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            tabIndex={0}
            className="btn btn-ghost gap-2"
          >
            <div className="avatar placeholder">
              <div className="bg-primary/20 text-primary rounded-full w-8">
                <span className="text-sm font-semibold">
                  {user?.username?.charAt(0).toUpperCase() ?? "U"}
                </span>
              </div>
            </div>
            <span className="hidden md:block">{user?.username ?? "User"}</span>
            <svg className="h-4 w-4 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {dropdownOpen && (
            <ul className="menu dropdown-content bg-base-100 rounded-box z-10 mt-2 w-48 p-2 shadow-lg border border-base-300">
              <li className="menu-title text-base-content/60">
                {user?.email}
              </li>
              <li>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout();
                  }}
                  className="text-error hover:bg-error/10"
                >
                  {t("actions.logout")}
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
