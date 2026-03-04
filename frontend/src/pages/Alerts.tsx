/**
 * Alerts page — lists all alerts with severity/zone/acknowledged filters
 * and inline acknowledge action.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listAlerts, acknowledgeAlert } from "@/api/alerts";
import { useAlertStore } from "@/stores/alertStore";
import { Spinner } from "@/components/ui/Spinner";
import { formatDate, formatRelativeTime } from "@/utils/formatters";
import type { Alert, Severity } from "@/types";

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; dot: string }> = {
  CRITICAL: { bg: "bg-red-100 dark:bg-red-900/30", text: "text-red-700 dark:text-red-300", dot: "bg-red-500" },
  WARNING: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300", dot: "bg-yellow-500" },
  INFO: { bg: "bg-blue-100 dark:bg-blue-900/30", text: "text-blue-700 dark:text-blue-300", dot: "bg-blue-500" },
};

type AcknowledgedFilter = "all" | "unacknowledged" | "acknowledged";

const ACK_FILTER_KEYS: Record<AcknowledgedFilter, string> = {
  all: "filters.all",
  unacknowledged: "filters.unacknowledged",
  acknowledged: "filters.acknowledged",
};

export default function Alerts() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [acknowledging, setAcknowledging] = useState<number | null>(null);

  // Filters
  const [severityFilter, setSeverityFilter] = useState<Severity | "">("");
  const [ackFilter, setAckFilter] = useState<AcknowledgedFilter>("all");

  const decrementUnacknowledgedCount = useAlertStore((s) => s.decrementUnacknowledgedCount);

  const fetchAlerts = useCallback(async () => {
    try {
      const params: Record<string, unknown> = {};
      if (severityFilter) params.severity = severityFilter;
      if (ackFilter === "unacknowledged") params.is_acknowledged = false;
      if (ackFilter === "acknowledged") params.is_acknowledged = true;
      params.ordering = "-created_at";

      const data = await listAlerts(params as Parameters<typeof listAlerts>[0]);
      setAlerts(data.results);
    } catch {
      setError(t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [severityFilter, ackFilter, t]);

  useEffect(() => {
    setLoading(true);
    fetchAlerts();
  }, [fetchAlerts]);

  const handleAcknowledge = useCallback(
    async (alertId: number) => {
      setAcknowledging(alertId);
      try {
        const updated = await acknowledgeAlert(alertId);
        setAlerts((prev) =>
          prev.map((a) => (a.id === alertId ? updated : a)),
        );
        decrementUnacknowledgedCount();
      } catch {
        // Silently fail — user can retry
      } finally {
        setAcknowledging(null);
      }
    },
    [decrementUnacknowledgedCount],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">{tp("alerts.title")}</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {tp("alerts.subtitle")}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Severity filter */}
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
          className="rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-700 dark:text-gray-100 shadow-sm"
          aria-label={t("filters.filterBySeverity")}
        >
          <option value="">{t("filters.allSeverities")}</option>
          <option value="CRITICAL">{t("filters.critical")}</option>
          <option value="WARNING">{t("filters.warning")}</option>
          <option value="INFO">{t("filters.info")}</option>
        </select>

        {/* Acknowledged filter */}
        <div className="flex gap-1 rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800 p-1">
          {(["all", "unacknowledged", "acknowledged"] as AcknowledgedFilter[]).map((val) => (
            <button
              key={val}
              onClick={() => setAckFilter(val)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                ackFilter === val
                  ? "bg-primary-600 text-white"
                  : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              {t(ACK_FILTER_KEYS[val])}
            </button>
          ))}
        </div>
      </div>

      {/* Alert List */}
      {alerts.length === 0 ? (
        <div className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300 dark:text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500 dark:text-gray-400">{tp("alerts.noAlerts")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const style = SEVERITY_STYLES[alert.severity];
            return (
              <div
                key={alert.id}
                className={`rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-4 shadow-sm transition-opacity ${
                  alert.is_acknowledged ? "opacity-60" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 space-y-1">
                    {/* Top row: badges */}
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${style.bg} ${style.text}`}
                      >
                        <span className={`inline-block h-1.5 w-1.5 rounded-full ${style.dot}`} />
                        {alert.severity}
                      </span>
                      <span className="rounded-full bg-gray-100 dark:bg-gray-700 px-2.5 py-0.5 text-xs font-medium text-gray-600 dark:text-gray-400">
                        {tp(`alerts.types.${alert.alert_type}`) ?? alert.alert_type}
                      </span>
                      {alert.is_acknowledged && (
                        <span className="rounded-full bg-green-100 dark:bg-green-900/30 px-2.5 py-0.5 text-xs font-medium text-green-700 dark:text-green-300">
                          {t("status.acknowledged")}
                        </span>
                      )}
                    </div>

                    {/* Message */}
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{alert.message}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                      <span title={formatDate(alert.created_at)}>
                        {formatRelativeTime(alert.created_at)}
                      </span>
                      {alert.value !== null && (
                        <span>{t("labels.value")}: {alert.value}</span>
                      )}
                      {alert.acknowledged_at && (
                        <span>
                          {t("status.acknowledged")}: {formatRelativeTime(alert.acknowledged_at)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Acknowledge action */}
                  {!alert.is_acknowledged && (
                    <button
                      onClick={() => handleAcknowledge(alert.id)}
                      disabled={acknowledging === alert.id}
                      className="flex-shrink-0 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50"
                    >
                      {acknowledging === alert.id ? "..." : t("actions.acknowledge")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
