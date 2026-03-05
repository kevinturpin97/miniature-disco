/**
 * 404 Not Found page — branded with CTA back to Dashboard.
 */

import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

export default function NotFound() {
  const { t } = useTranslation("pages");

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background px-4 text-center">
      {/* Illustration */}
      <div className="flex h-24 w-24 items-center justify-center rounded-full bg-primary/10">
        <svg className="h-12 w-12 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </div>

      <div>
        <p className="text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-semibold text-foreground">{t("notFound.title")}</h1>
        <p className="mt-2 text-muted-foreground">{t("notFound.subtitle")}</p>
      </div>

      <Link
        to="/"
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
        </svg>
        {t("notFound.backHome")}
      </Link>
    </div>
  );
}
