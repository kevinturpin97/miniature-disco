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
import { useAuthStore } from "@/stores/authStore";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import {
  getZoneAnalytics,
  getZoneReportPdf,
  getOrgAnalyticsSummary,
} from "@/api/analytics";
import type {
  Greenhouse,
  Zone,
  ZoneAnalytics,
  SensorStat,
  OrgAnalyticsSummary,
  SensorType,
} from "@/types";
import { Spinner } from "@/components/ui/Spinner";

const SENSOR_COLORS: Record<string, string> = {
  TEMP: "#ef4444",
  HUM_AIR: "#3b82f6",
  HUM_SOIL: "#8b5cf6",
  PH: "#f59e0b",
  LIGHT: "#eab308",
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

const TREND_ICONS: Record<string, string> = {
  rising: "\u2197",
  falling: "\u2198",
  stable: "\u2192",
};

export default function Analytics() {
  const { t } = useTranslation(["pages", "common"]);
  const currentOrg = useAuthStore((s) => s.currentOrganization);

  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [days, setDays] = useState<number>(7);
  const [analytics, setAnalytics] = useState<ZoneAnalytics | null>(null);
  const [orgSummary, setOrgSummary] = useState<OrgAnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Load greenhouses and zones
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
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Load org summary
  useEffect(() => {
    if (!currentOrg) return;
    let cancelled = false;
    getOrgAnalyticsSummary(currentOrg.slug)
      .then((data) => { if (!cancelled) setOrgSummary(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentOrg]);

  // Load zone analytics
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
  }, [selectedZone, days, t]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  // PDF download
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

  // Build daily averages chart data — merge all sensors into date-keyed rows
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

  // Build correlation data between first two sensor types
  const correlationData = useMemo(() => {
    if (!analytics || analytics.sensors.length < 2) return null;

    const s1 = analytics.sensors[0];
    const s2 = analytics.sensors[1];

    // Match by date
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

  // Build heatmap data (calendar-style grid)
  const heatmapData = useMemo(() => {
    if (!analytics || analytics.sensors.length === 0) return null;
    // Use first sensor for the heatmap
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("pages:analytics.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pages:analytics.subtitle")}
        </p>
      </div>

      {/* Org Summary Cards */}
      {orgSummary && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
          <SummaryCard
            label={t("pages:analytics.orgSummary.greenhouses")}
            value={orgSummary.greenhouse_count}
          />
          <SummaryCard
            label={t("pages:analytics.orgSummary.zones")}
            value={orgSummary.zone_count}
          />
          <SummaryCard
            label={t("pages:analytics.orgSummary.zonesOnline")}
            value={orgSummary.zones_online}
          />
          <SummaryCard
            label={t("pages:analytics.orgSummary.readings7d")}
            value={orgSummary.total_readings_7d}
          />
          <SummaryCard
            label={t("pages:analytics.orgSummary.activeAlerts")}
            value={orgSummary.active_alerts}
            highlight={orgSummary.active_alerts > 0}
          />
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-4 rounded-lg border border-border bg-card p-4">
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            {t("common:labels.zone")}
          </label>
          <select
            value={selectedZone ?? ""}
            onChange={(e) => setSelectedZone(Number(e.target.value))}
            className="rounded-lg border border-input bg-background text-foreground text-sm shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
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
          <div className="flex gap-1">
            {[7, 30].map((d) => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  days === d
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/80 hover:bg-accent"
                }`}
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
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {pdfLoading ? (
              <Spinner className="h-4 w-4" />
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            )}
            {t("pages:analytics.downloadPdf")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : analytics ? (
        <div className="space-y-6">
          {/* Sensor stat cards */}
          {analytics.sensors.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pages:analytics.noData")}</p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {analytics.sensors.map((s) => (
                  <SensorStatCard key={s.sensor_id} stat={s} t={t} />
                ))}
              </div>

              {/* Daily Averages Chart */}
              {dailyChartData.length > 0 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-4 text-sm font-semibold text-foreground/80">
                    {t("pages:analytics.dailyAverages")}
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={dailyChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Legend />
                      {analytics.sensors.map((s) => (
                        <Line
                          key={s.sensor_type}
                          type="monotone"
                          dataKey={s.sensor_type}
                          name={`${SENSOR_LABELS[s.sensor_type]} (${s.unit})`}
                          stroke={SENSOR_COLORS[s.sensor_type] ?? "#6b7280"}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Heatmap Calendar */}
              {heatmapData && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-4 text-sm font-semibold text-foreground/80">
                    {t("pages:analytics.heatmap")} — {SENSOR_LABELS[heatmapData.sensor_type as SensorType]} ({heatmapData.unit})
                  </h3>
                  <div className="flex flex-wrap gap-1">
                    {heatmapData.cells.map((cell) => (
                      <div
                        key={cell.date}
                        title={`${cell.date}: ${cell.value.toFixed(1)} ${heatmapData.unit}`}
                        className="h-8 w-8 rounded-sm border border-border cursor-default"
                        style={{
                          backgroundColor: `rgba(34, 139, 34, ${0.15 + cell.intensity * 0.85})`,
                        }}
                      >
                        <span className="flex h-full items-center justify-center text-[9px] text-white font-medium">
                          {cell.date.slice(8)}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{t("pages:analytics.low")}</span>
                    <div className="flex gap-0.5">
                      {[0.15, 0.35, 0.55, 0.75, 1].map((i) => (
                        <div
                          key={i}
                          className="h-3 w-6 rounded-sm"
                          style={{ backgroundColor: `rgba(34, 139, 34, ${i})` }}
                        />
                      ))}
                    </div>
                    <span>{t("pages:analytics.high")}</span>
                  </div>
                </div>
              )}

              {/* Correlation */}
              {correlationData && correlationData.data.length >= 2 && (
                <div className="rounded-lg border border-border bg-card p-4">
                  <h3 className="mb-4 text-sm font-semibold text-foreground/80">
                    {t("pages:analytics.correlation")}
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <ScatterChart>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="x"
                        name={correlationData.xLabel}
                        tick={{ fontSize: 12 }}
                        label={{ value: correlationData.xLabel, position: "insideBottom", offset: -5, fontSize: 12 }}
                      />
                      <YAxis
                        dataKey="y"
                        name={correlationData.yLabel}
                        tick={{ fontSize: 12 }}
                        label={{ value: correlationData.yLabel, angle: -90, position: "insideLeft", fontSize: 12 }}
                      />
                      <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                      <Scatter data={correlationData.data} fill="#228B22" />
                    </ScatterChart>
                  </ResponsiveContainer>
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: number;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-2xl font-bold ${
          highlight ? "text-destructive" : "text-foreground"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function SensorStatCard({
  stat,
  t,
}: {
  stat: SensorStat;
  t: (key: string) => string;
}) {
  if (stat.count === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: SENSOR_COLORS[stat.sensor_type] ?? "#6b7280" }}
          />
          <span className="text-sm font-semibold text-foreground/80">
            {SENSOR_LABELS[stat.sensor_type]} ({stat.unit})
          </span>
        </div>
        <p className="mt-2 text-xs text-muted-foreground/60">{t("pages:analytics.noData")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="h-3 w-3 rounded-full"
            style={{ backgroundColor: SENSOR_COLORS[stat.sensor_type] ?? "#6b7280" }}
          />
          <span className="text-sm font-semibold text-foreground/80">
            {stat.label || SENSOR_LABELS[stat.sensor_type]} ({stat.unit})
          </span>
        </div>
        {stat.trend && (
          <span
            className={`text-lg ${
              stat.trend === "rising"
                ? "text-destructive"
                : stat.trend === "falling"
                  ? "text-blue-500"
                  : "text-muted-foreground/60"
            }`}
            title={t(`pages:analytics.trends.${stat.trend}`)}
          >
            {TREND_ICONS[stat.trend]}
          </span>
        )}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div>
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.min")}</span>
          <p className="font-medium text-foreground/80">{stat.min}</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.max")}</span>
          <p className="font-medium text-foreground/80">{stat.max}</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.avg")}</span>
          <p className="font-medium text-foreground/80">{stat.avg}</p>
        </div>
        <div>
          <span className="text-muted-foreground/60">{t("pages:analytics.stats.stddev")}</span>
          <p className="font-medium text-foreground/80">{stat.stddev}</p>
        </div>
      </div>
      <p className="mt-2 text-[10px] text-muted-foreground/60">
        {stat.count} {t("pages:analytics.readings")}
      </p>
    </div>
  );
}
