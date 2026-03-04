/**
 * Compact zone status widget — shows zone name, online/offline state,
 * and latest sensor readings at a glance. Designed for the PWA home screen.
 */

import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import type { Zone } from "@/types";

interface ZoneStatusWidgetProps {
  zone: Zone;
  latestReadings?: Record<string, number>;
}

export function ZoneStatusWidget({ zone, latestReadings }: ZoneStatusWidgetProps) {
  const { t } = useTranslation();
  const isOnline = zone.last_seen
    ? Date.now() - new Date(zone.last_seen).getTime() < (zone.transmission_interval ?? 300) * 2 * 1000
    : false;

  return (
    <Link
      to={`/zones/${zone.id}`}
      className="card card-border bg-base-100 p-3 flex-row items-center gap-3 transition-shadow hover:shadow-md"
    >
      {/* Status dot */}
      <div
        className={`h-3 w-3 flex-shrink-0 rounded-full ${isOnline ? "bg-success" : "bg-base-content/30"}`}
        title={isOnline ? t("common:status.online") : t("common:status.offline")}
      />

      {/* Zone info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-base-content">
          {zone.name}
        </p>
        {latestReadings && Object.keys(latestReadings).length > 0 ? (
          <div className="mt-0.5 flex flex-wrap gap-2">
            {Object.entries(latestReadings).map(([type, value]) => (
              <span key={type} className="text-xs text-base-content/60">
                {type}: <span className="font-medium">{value}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="mt-0.5 text-xs text-base-content/40">
            {isOnline ? t("common:status.online") : t("common:status.offline")}
          </p>
        )}
      </div>

      {/* Chevron */}
      <svg className="h-4 w-4 flex-shrink-0 text-base-content/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}
