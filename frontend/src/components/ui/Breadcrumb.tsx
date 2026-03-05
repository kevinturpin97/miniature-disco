/**
 * Breadcrumb — contextual navigation for deep pages.
 * Builds segments from the current URL path automatically.
 */

import { Link, useLocation, useMatches } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { cn } from "@/utils/cn";

interface BreadcrumbHandle {
  breadcrumb?: string | ((params: Record<string, string>) => string);
}

interface BreadcrumbSegment {
  label: string;
  to: string;
  isCurrent: boolean;
}

/** Build breadcrumb segments from react-router matches (uses `handle.breadcrumb`). */
export function useBreadcrumbs(): BreadcrumbSegment[] {
  let matches: ReturnType<typeof useMatches> = [];
  try {
    // useMatches requires a data router; gracefully degrade for MemoryRouter contexts.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    matches = useMatches();
  } catch {
    return [];
  }

  return matches
    .filter((m) => {
      const handle = m.handle as BreadcrumbHandle | undefined;
      return handle?.breadcrumb !== undefined;
    })
    .map((m, idx, arr) => {
      const handle = m.handle as BreadcrumbHandle;
      const label =
        typeof handle.breadcrumb === "function"
          ? handle.breadcrumb(m.params as Record<string, string>)
          : (handle.breadcrumb as string);
      return {
        label,
        to: m.pathname,
        isCurrent: idx === arr.length - 1,
      };
    });
}

interface BreadcrumbProps {
  /** Override segments (for pages that don't use route handles). */
  segments?: BreadcrumbSegment[];
  className?: string;
}

export function Breadcrumb({ segments, className }: BreadcrumbProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const routeSegments = useBreadcrumbs();
  const items = segments ?? routeSegments;

  // Build simple segments from pathname when no handle-based segments exist
  const autoSegments = (() => {
    if (items.length > 0) return items;
    const parts = location.pathname.split("/").filter(Boolean);
    return parts.map((part, idx) => ({
      label: part.replace(/-/g, " "),
      to: "/" + parts.slice(0, idx + 1).join("/"),
      isCurrent: idx === parts.length - 1,
    }));
  })();

  if (autoSegments.length <= 1) return null;

  return (
    <nav aria-label="Breadcrumb" className={cn("flex items-center gap-1.5 text-sm", className)}>
      <Link
        to="/"
        className="text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t("nav.dashboard")}
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        </svg>
      </Link>

      {autoSegments.map((seg) => (
        <span key={seg.to} className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {seg.isCurrent ? (
            <span className="font-medium text-foreground capitalize">{seg.label}</span>
          ) : (
            <Link to={seg.to} className="capitalize text-muted-foreground hover:text-foreground transition-colors">
              {seg.label}
            </Link>
          )}
        </span>
      ))}
    </nav>
  );
}
