/**
 * Alerts page — lists all alerts with severity/zone/acknowledged filters
 * and inline acknowledge action.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { motion, AnimatePresence } from "framer-motion";
import { BellRing, CheckCircle, Filter } from "lucide-react";
import { listAlerts, acknowledgeAlert } from "@/api/alerts";
import { useAlertStore } from "@/stores/alertStore";
import { GlowCard } from "@/components/ui/GlowCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { formatDate, formatRelativeTime } from "@/utils/formatters";
import { cn } from "@/utils/cn";
import type { Alert, Severity } from "@/types";

const SEVERITY_STYLES: Record<Severity, { bg: string; text: string; dot: string; glow: "danger" | "warning" | "none" }> = {
  CRITICAL: { bg: "bg-gh-danger/10", text: "text-gh-danger", dot: "bg-gh-danger", glow: "danger" },
  WARNING: { bg: "bg-gh-warning/10", text: "text-gh-warning", dot: "bg-gh-warning", glow: "warning" },
  INFO: { bg: "bg-info/10", text: "text-info", dot: "bg-info", glow: "none" },
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
      // Global interceptor shows toast.error automatically
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
        toast.success(t("success.acknowledged"));
      } catch {
        // Silently fail — user can retry
      } finally {
        setAcknowledging(null);
      }
    },
    [decrementUnacknowledgedCount, t],
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="flex gap-3">
          <Skeleton className="h-8 w-36 rounded-lg" />
          <Skeleton className="h-8 w-56 rounded-lg" />
        </div>
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  return (
    <div className="space-y-6 relative gradient-blur-primary gradient-blur-secondary">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BellRing className="size-6 text-gh-danger" aria-hidden="true" />
            {tp("alerts.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tp("alerts.subtitle")}</p>
        </div>
        {alerts.filter((a) => !a.is_acknowledged).length > 0 && (
          <span className="rounded-full bg-gh-danger/10 px-3 py-1 text-xs font-bold text-gh-danger">
            {alerts.filter((a) => !a.is_acknowledged).length} active
          </span>
        )}
      </div>

      {/* Filters */}
      <GlowCard variant="none" glass className="flex flex-wrap items-center gap-3 px-4 py-3">
        <Filter className="size-3.5 text-muted-foreground" aria-hidden="true" />
        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
          className="rounded-lg border border-input bg-background px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          aria-label={t("filters.filterBySeverity")}
        >
          <option value="">{t("filters.allSeverities")}</option>
          <option value="CRITICAL">{t("filters.critical")}</option>
          <option value="WARNING">{t("filters.warning")}</option>
          <option value="INFO">{t("filters.info")}</option>
        </select>
        <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
          {(["all", "unacknowledged", "acknowledged"] as AcknowledgedFilter[]).map((val) => (
            <button
              key={val}
              onClick={() => setAckFilter(val)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                ackFilter === val
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent"
              )}
            >
              {t(ACK_FILTER_KEYS[val])}
            </button>
          ))}
        </div>
      </GlowCard>

      {/* Alert List */}
      {alerts.length === 0 ? (
        <EmptyState
          icon="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"
          title={tp("alerts.noAlerts")}
          description=""
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {alerts.map((alert, index) => {
              const style = SEVERITY_STYLES[alert.severity];
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: alert.is_acknowledged ? 0.5 : 1, y: 0 }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, delay: index * 0.04 }}
                >
                  <GlowCard variant={alert.is_acknowledged ? "none" : style.glow} glass className="p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold", style.bg, style.text)}>
                            <span className={cn("inline-block h-1.5 w-1.5 rounded-full", style.dot)} />
                            {alert.severity}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                            {tp(`alerts.types.${alert.alert_type}`) ?? alert.alert_type}
                          </span>
                          {alert.is_acknowledged && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-xs font-medium text-success">
                              <CheckCircle className="size-3" />
                              {t("status.acknowledged")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm font-medium text-foreground">{alert.message}</p>
                        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                          <span title={formatDate(alert.created_at)}>{formatRelativeTime(alert.created_at)}</span>
                          {alert.value !== null && <span>{t("labels.value")}: {alert.value}</span>}
                          {alert.acknowledged_at && (
                            <span>{t("status.acknowledged")}: {formatRelativeTime(alert.acknowledged_at)}</span>
                          )}
                        </div>
                      </div>
                      {!alert.is_acknowledged && (
                        <button
                          onClick={() => handleAcknowledge(alert.id)}
                          disabled={acknowledging === alert.id}
                          className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle className="size-3" />
                          {acknowledging === alert.id ? "…" : t("actions.acknowledge")}
                        </button>
                      )}
                    </div>
                  </GlowCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
