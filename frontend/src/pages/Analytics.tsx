/**
 * Analytics page — zone-level stats, daily charts, correlation, and PDF export.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
} from "recharts";
import { BarChart2, Download, TrendingUp, TrendingDown, Minus, Activity } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useThemeStore } from "@/stores/themeStore";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import {
  getZoneAnalytics,
  getZoneReportPdf,
  getOrgAnalyticsSummary,
} from "@/api/analytics";
import { GlowCard } from "@/components/ui/GlowCard";
import { MetricTile } from "@/components/ui/MetricTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/utils/cn";
import type {
  Greenhouse,
  Zone,
  ZoneAnalytics,
  SensorStat,
  OrgAnalyticsSummary,
  SensorType,
} from "@/types";

/* ---------- constants ---------- */

const SENSOR_COLORS: Record<string, string> = {
  TEMP: "#ff4d4f",
  HUM_AIR: "#00d9ff",
  HUM_SOIL: "#a78bfa",
  PH: "#ffb300",
  LIGHT: "#00ff9c",
  CO2: "#6b7280",
};

const SENSOR_LABELS: Record<SensorType, string> = {
  TEMP: "Temperature",
  HUM_AIR: "Air Humidity",
  HUM_SOIL: "Soil Humidity",
  PH: "pH",
  LIGHT: "Light",
  CO2: "CO2",
};

/* ====================================================================== */
/*  Analytics                                                               */
/* ====================================================================== */

export default function Analytics() {
  const { t } = useTranslation(["pages", "common"]);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const theme = useThemeStore((s) => s.theme);

  /* Recharts dark theming */
  const gridStroke = theme === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.08)";
  const tickFill = theme === "dark" ? "#6b7280" : "#9ca3af";
  const tooltipStyle =
    theme === "dark"
      ? { backgroundColor: "#0f172a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#f1f5f9" }
      : { backgroundColor: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#0f172a" };

  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [days, setDays] = useState<number>(7);
  const [analytics, setAnalytics] = useState<ZoneAnalytics | null>(null);
  const [orgSummary, setOrgSummary] = useState<OrgAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStructure, setLoadingStructure] = useState(true);
  const [pdfLoading, setPdfLoading] = useState(false);

  /* Load greenhouses and zones */
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ghRes = await listGreenhouses();
        if (cancelled) return;
        setGreenhouses(ghRes.results);

        const allZones: Zone[] = [];
        for (const gh of ghRes.results) {
          const zRes = await listZones(gh.id);
          allZones.push(...zRes.results);
        }
        if (cancelled) return;
        setZones(allZones);
        if (allZones.length > 0 && !selectedZone) {
          setSelectedZone(allZones[0].id);
        }
      } catch {
        // Global interceptor shows toast.error automatically
      } finally {
        if (!cancelled) setLoadingStructure(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* Load org summary */
  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    getOrgAnalyticsSummary(currentOrg.slug)
      .then((data) => { if (!cancelled) setOrgSummary(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentOrg]);

  /* Load zone analytics */
  const loadAnalytics = useCallback(async () => {
    if (!selectedZone) return;
    setLoading(true);
    try {
      const data = await getZoneAnalytics(selectedZone, days);
      setAnalytics(data);
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setLoading(false);
    }
  }, [selectedZone, days]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  /* PDF download */
  const handleDownloadPdf = async () => {
    if (!selectedZone) return;
    setPdfLoading(true);
    try {
      const blob = await getZoneReportPdf(selectedZone, days);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zone-${selectedZone}-report-${days}d.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setPdfLoading(false);
    }
  };

  /* Build daily averages chart data */
  const dailyChartData = useMemo(() => {
    if (!analytics) return [];
    const dateMap = new Map<string, Record<string, number | string | null>>();

    for (const sensor of analytics.sensors) {
      for (const da of sensor.daily_averages) {
        const key = da.date.slice(0, 10);
        if (!dateMap.has(key)) dateMap.set(key, { date: key });
        const row = dateMap.get(key)!;
        row[sensor.sensor_type] = da.avg;
      }
    }

    return Array.from(dateMap.values()).sort((a, b) =>
      (a.date as string).localeCompare(b.date as string),
    );
  }, [analytics]);

  /* Build correlation data between first two sensor types */
  const correlationData = useMemo(() => {
    if (!analytics || analytics.sensors.length < 2) return null;

    const s1 = analytics.sensors[0];
    const s2 = analytics.sensors[1];

    const s1Map = new Map(s1.daily_averages.map((d) => [d.date.slice(0, 10), d.avg]));
    const points: { x: number; y: number }[] = [];

    for (const d of s2.daily_averages) {
      const key = d.date.slice(0, 10);
      const v1 = s1Map.get(key);
      if (v1 != null && d.avg != null) {
        points.push({ x: v1, y: d.avg });
      }
    }

    return {
      xLabel: `${SENSOR_LABELS[s1.sensor_type]} (${s1.unit})`,
      yLabel: `${SENSOR_LABELS[s2.sensor_type]} (${s2.unit})`,
      data: points,
    };
  }, [analytics]);

  /* Build heatmap data */
  const heatmapData = useMemo(() => {
    if (!analytics || analytics.sensors.length === 0) return null;
    const sensor = analytics.sensors[0];
    if (sensor.daily_averages.length === 0) return null;

    const values = sensor.daily_averages
      .filter((d) => d.avg != null)
      .map((d) => ({ date: d.date.slice(0, 10), value: d.avg as number }));

    if (values.length === 0) return null;

    const maxVal = Math.max(...values.map((v) => v.value));
    const minVal = Math.min(...values.map((v) => v.value));
    const range = maxVal - minVal || 1;

    return {
      sensor_type: sensor.sensor_type,
      unit: sensor.unit,
      cells: values.map((v) => ({
        ...v,
        intensity: (v.value - minVal) / range,
      })),
    };
  }, [analytics]);

  /* ---- render ---- */

  if (loadingStructure) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
        <Skeleton className="h-16 rounded-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative gradient-blur-primary gradient-blur-secondary">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="size-6 text-gh-secondary" aria-hidden="true" />
            {t("pages:analytics.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t("pages:analytics.subtitle")}</p>
        </div>
      </div>

      {/* Org Summary Cards */}
      {orgSummary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <GlowCard variant="none" glass className="p-4">
            <MetricTile
              label={t("pages:analytics.orgSummary.greenhouses")}
              value={orgSummary.greenhouse_count}
              color="green"
            />
          </GlowCard>
          <GlowCard variant="none" glass className="p-4">
            <MetricTile
              label={t("pages:analytics.orgSummary.zones")}
              value={orgSummary.zone_count}
              color="cyan"
            />
          </GlowCard>
          <GlowCard variant="none" glass className="p-4">
            <MetricTile
              label={t("pages:analytics.orgSummary.zonesOnline")}
              value={orgSummary.zones_online}
              color="green"
            />
          </GlowCard>
          <GlowCard variant="none" glass className="p-4">
            <MetricTile
              label={t("pages:analytics.orgSummary.readings7d")}
              value={orgSummary.total_readings_7d}
              color="neutral"
            />
          </GlowCard>
          <GlowCard variant={orgSummary.active_alerts > 0 ? "danger" : "none"} glass className="p-4">
            <MetricTile
              label={t("pages:analytics.orgSummary.activeAlerts")}
              value={orgSummary.active_alerts}
              color={orgSummary.active_alerts > 0 ? "danger" : "neutral"}
            />
          </GlowCard>
        </div>
      )}

      {/* Controls */}
      <GlowCard variant="none" glass className="flex flex-wrap items-center gap-4 px-4 py-3">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("common:labels.zone")}
          </label>
          <select
            value={selectedZone ?? ""}
            onChange={(e) => setSelectedZone(Number(e.target.value))}
            className="rounded-lg border border-input bg-background/60 text-foreground text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {greenhouses.map((gh) => (
              <optgroup key={gh.id} label={gh.name}>
                {zones
                  .filter((z) => z.greenhouse === gh.id)
                  .map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("pages:analytics.period")}
          </label>
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {[7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-medium transition-colors",
                  days === d
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent",
                )}
              >
                {d === 7 ? t("pages:analytics.periods.7d") : t("pages:analytics.periods.30d")}
              </button>
            ))}
          </div>
        </div>

        <div className="ml-auto">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading || !selectedZone}
            className="inline-flex items-center gap-2 rounded-lg border border-primary/30 px-4 py-2 text-sm font-medium text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <Download className={cn("size-4", pdfLoading && "animate-pulse")} />
            {t("pages:analytics.downloadPdf")}
          </button>
        </div>
      </GlowCard>

      {/* Analytics content */}
      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
          </div>
          <Skeleton className="h-72 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      ) : analytics ? (
        <div className="space-y-6">
          {analytics.sensors.length === 0 ? (
            <EmptyState
              icon="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              title={t("pages:analytics.noData")}
              description=""
            />
          ) : (
            <>
              {/* Sensor stat cards */}
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.sensors.map((s) => (
                  <SensorStatCard key={s.sensor_id} stat={s} t={t} />
                ))}
              </div>

              {/* Daily Averages Chart */}
              {dailyChartData.length > 0 && (
                <GlowCard variant="cyan" glass className="p-4">
                  <div className="flex items-center gap-2 mb-4">
                    <Activity className="size-4 text-gh-secondary" aria-hidden="true" />
                    <h3 className="text-sm font-semibold text-foreground">
                      {t("pages:analytics.dailyAverages")}
                    </h3>
                  </div>
                  <ResponsiveContainer width="100%" height={280}>
                    <LineChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis dataKey="date" tick={{ fontSize: 11, fill: tickFill }} />
                      <YAxis tick={{ fontSize: 11, fill: tickFill }} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      {analytics.sensors.map((s) => (
                        <Line
                          key={s.sensor_type}
                          type="monotone"
                          dataKey={s.sensor_type}
                          name={`${SENSOR_LABELS[s.sensor_type]} (${s.unit})`}
                          stroke={SENSOR_COLORS[s.sensor_type] ?? "#6b7280"}
                          strokeWidth={2}
                          dot={false}
                          connectNulls
                          isAnimationActive={false}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </GlowCard>
              )}

              {/* Heatmap Calendar */}
              {heatmapData && (
                <GlowCard variant="none" glass className="p-4">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    {t("pages:analytics.heatmap")} — {SENSOR_LABELS[heatmapData.sensor_type as SensorType]} ({heatmapData.unit})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {heatmapData.cells.map((cell) => (
                      <div
                        key={cell.date}
                        title={`${cell.date}: ${cell.value.toFixed(1)} ${heatmapData.unit}`}
                        className="h-8 w-8 rounded-sm cursor-default"
                        style={{
                          backgroundColor: `rgba(0, 255, 156, ${0.12 + cell.intensity * 0.88})`,
                        }}
                      >
                        <span className="flex h-full items-center justify-center text-[9px] text-black/70 dark:text-white/70 font-medium">
                          {cell.date.slice(8)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("pages:analytics.low")}</span>
                    <div className="flex gap-0.5">
                      {[0.12, 0.35, 0.55, 0.75, 1].map((i) => (
                        <div
                          key={i}
                          className="h-3 w-6 rounded-sm"
                          style={{ backgroundColor: `rgba(0, 255, 156, ${i})` }}
                        />
                      ))}
                    </div>
                    <span>{t("pages:analytics.high")}</span>
                  </div>
                </GlowCard>
              )}

              {/* Correlation Scatter */}
              {correlationData && correlationData.data.length >= 2 && (
                <GlowCard variant="none" glass className="p-4">
                  <h3 className="mb-4 text-sm font-semibold text-foreground">
                    {t("pages:analytics.correlation")}
                  </h3>
                  <ResponsiveContainer width="100%" height={280}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
                      <XAxis
                        dataKey="x"
                        name={correlationData.xLabel}
                        tick={{ fontSize: 11, fill: tickFill }}
                        label={{ value: correlationData.xLabel, position: "insideBottom", offset: -5, fontSize: 11, fill: tickFill }}
                      />
                      <YAxis
                        dataKey="y"
                        name={correlationData.yLabel}
                        tick={{ fontSize: 11, fill: tickFill }}
                        label={{ value: correlationData.yLabel, angle: -90, position: "insideLeft", fontSize: 11, fill: tickFill }}
                      />
                      <Tooltip contentStyle={tooltipStyle} cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={correlationData.data} fill="#00ff9c" opacity={0.7} />
                    </ScatterChart>
                  </ResponsiveContainer>
                </GlowCard>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/* ---------- sub-components ---------- */

function SensorStatCard({
  stat,
  t,
}: {
  stat: SensorStat;
  t: (key: string) => string;
}) {
  const color = SENSOR_COLORS[stat.sensor_type] ?? "#6b7280";

  const trendIcon =
    stat.trend === "rising" ? (
      <TrendingUp className="size-4 text-gh-warning" />
    ) : stat.trend === "falling" ? (
      <TrendingDown className="size-4 text-gh-secondary" />
    ) : (
      <Minus className="size-4 text-muted-foreground" />
    );

  if (stat.count === 0) {
    return (
      <GlowCard variant="none" glass className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-foreground/80">
            {SENSOR_LABELS[stat.sensor_type]} ({stat.unit})
          </span>
        </div>
        <p className="text-xs text-muted-foreground/60">{t("pages:analytics.noData")}</p>
      </GlowCard>
    );
  }

  return (
    <GlowCard variant="none" glass className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
          <span className="text-sm font-semibold text-foreground/80">
            {stat.label || SENSOR_LABELS[stat.sensor_type]} ({stat.unit})
          </span>
        </div>
        {stat.trend && (
          <span title={t(`pages:analytics.trends.${stat.trend}`)}>
            {trendIcon}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.min")}</span>
          <p className="font-semibold text-foreground mt-0.5">{stat.min}</p>
        </div>
        <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.max")}</span>
          <p className="font-semibold text-foreground mt-0.5">{stat.max}</p>
        </div>
        <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.avg")}</span>
          <p className="font-semibold text-foreground mt-0.5">{stat.avg}</p>
        </div>
        <div className="rounded-lg bg-black/5 dark:bg-white/5 px-3 py-2">
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.stddev")}</span>
          <p className="font-semibold text-foreground mt-0.5">{stat.stddev}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/60">
        {stat.count} {t("pages:analytics.readings")}
      </p>
    </GlowCard>
  );
}
