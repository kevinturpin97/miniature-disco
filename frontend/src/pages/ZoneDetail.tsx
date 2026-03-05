/**
 * Zone Detail page with real-time charts, readings table,
 * period selector, CSV export, and actuator states.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link } from "react-router-dom";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { format, subHours, subDays } from "date-fns";
import toast from "react-hot-toast";
import { getZone, exportZoneCsv } from "@/api/zones";
import { listSensors, getSensorReadings, updateSensor } from "@/api/sensors";
import { listActuators } from "@/api/actuators";
import { getZonePredictions, getZoneAnomalies, getZoneSuggestions } from "@/api/analytics";
import { useSensorData } from "@/hooks/useSensorData";
import { useSensorStore } from "@/stores/sensorStore";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { AnomalyBadge } from "@/components/ui/AnomalyBadge";
import { SmartSuggestionCard } from "@/components/ui/SmartSuggestionCard";
import { PredictionChart } from "@/components/charts/PredictionChart";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS, ACTUATOR_TYPE_LABELS } from "@/utils/constants";
import { formatDate, formatRelativeTime, formatSensorValue } from "@/utils/formatters";
import { lttbDownsample, BIG_DATA_THRESHOLD, BIG_DATA_TARGET_POINTS } from "@/utils/downsample";
import type { Zone, Sensor, SensorReading, Actuator, ZonePredictions, ZoneAnomalies, ZoneSuggestions } from "@/types";

type Period = "1h" | "24h" | "7d" | "custom";

interface ChartDataPoint {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

const PERIOD_VALUES: Period[] = ["1h", "24h", "7d", "custom"];

const CHART_COLORS = ["#16a34a", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

export default function ZoneDetail() {
  const { zoneId } = useParams<{ zoneId: string }>();
  const numericZoneId = zoneId ? Number(zoneId) : null;
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  const [zone, setZone] = useState<Zone | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [actuators, setActuators] = useState<Actuator[]>([]);
  const [readings, setReadings] = useState<Record<number, SensorReading[]>>({});
  const [loading, setLoading] = useState(true);

  const [period, setPeriod] = useState<Period>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exporting, setExporting] = useState(false);
  const [bigDataMode, setBigDataMode] = useState(false);

  // Threshold editing state
  const [editingThresholds, setEditingThresholds] = useState<number | null>(null);
  const [thresholdForm, setThresholdForm] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [savingThresholds, setSavingThresholds] = useState(false);

  // AI & Predictions state (Sprint 20)
  const [predictions, setPredictions] = useState<ZonePredictions | null>(null);
  const [anomalies, setAnomalies] = useState<ZoneAnomalies | null>(null);
  const [suggestions, setSuggestions] = useState<ZoneSuggestions | null>(null);

  // Real-time WebSocket data
  const { isConnected } = useSensorData(numericZoneId);
  const latestReadings = useSensorStore((s) => s.latestReadings);

  // Compute time range from period
  const timeRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "1h":
        return { from: subHours(now, 1).toISOString(), to: now.toISOString(), interval: undefined };
      case "24h":
        return { from: subHours(now, 24).toISOString(), to: now.toISOString(), interval: "hour" as const };
      case "7d":
        return { from: subDays(now, 7).toISOString(), to: now.toISOString(), interval: "day" as const };
      case "custom":
        return {
          from: customFrom || subHours(now, 24).toISOString(),
          to: customTo || now.toISOString(),
          interval: "hour" as const,
        };
    }
  }, [period, customFrom, customTo]);

  // Fetch zone, sensors, actuators
  useEffect(() => {
    if (!numericZoneId) return;

    async function fetchZoneData() {
      try {
        const [zoneData, sensorData, actuatorData] = await Promise.all([
          getZone(numericZoneId!),
          listSensors(numericZoneId!),
          listActuators(numericZoneId!),
        ]);
        setZone(zoneData);
        setSensors(sensorData.results);
        setActuators(actuatorData.results);
      } catch {
        // Global interceptor shows toast.error automatically
      } finally {
        setLoading(false);
      }
    }
    fetchZoneData();
  }, [numericZoneId]);

  // Fetch AI predictions, anomalies, and suggestions
  const fetchAIData = useCallback(async () => {
    if (!numericZoneId) return;
    try {
      const [predData, anomData, sugData] = await Promise.all([
        getZonePredictions(numericZoneId).catch(() => null),
        getZoneAnomalies(numericZoneId).catch(() => null),
        getZoneSuggestions(numericZoneId).catch(() => null),
      ]);
      if (predData) setPredictions(predData);
      if (anomData) setAnomalies(anomData);
      if (sugData) setSuggestions(sugData);
    } catch {
      // Silently fail — AI features are optional
    }
  }, [numericZoneId]);

  useEffect(() => {
    if (sensors.length > 0) {
      fetchAIData();
    }
  }, [sensors, fetchAIData]);

  // Fetch readings when sensors or time range change
  useEffect(() => {
    if (sensors.length === 0) return;

    async function fetchReadings() {
      const result: Record<number, SensorReading[]> = {};
      await Promise.all(
        sensors.map(async (sensor) => {
          try {
            const response = await getSensorReadings(sensor.id, {
              from: timeRange.from,
              to: timeRange.to,
              interval: timeRange.interval,
            });
            result[sensor.id] = response.results;
          } catch {
            result[sensor.id] = [];
          }
        }),
      );
      setReadings(result);
    }
    fetchReadings();
  }, [sensors, timeRange]);

  // Build chart data: merge all sensor readings into one timeline
  const chartData = useMemo(() => {
    const timeMap = new Map<string, ChartDataPoint>();

    sensors.forEach((sensor) => {
      const sensorReadings = readings[sensor.id] ?? [];
      const label = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;

      sensorReadings.forEach((r) => {
        // Aggregated readings have "period" + "avg_value", raw have "received_at" + "value"
        const raw = r as unknown as Record<string, unknown>;
        const timeStr = (raw.period as string) ?? r.received_at;
        const val = (raw.avg_value as number) ?? r.value;

        const existing = timeMap.get(timeStr);
        if (existing) {
          existing[label] = Number(val.toFixed(2));
        } else {
          const ts = new Date(timeStr).getTime();
          timeMap.set(timeStr, {
            time: format(new Date(timeStr), period === "7d" ? "MM/dd" : "HH:mm"),
            timestamp: ts,
            [label]: Number(val.toFixed(2)),
          });
        }
      });
    });

    return Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);
  }, [sensors, readings, period]);

  // Unique sensor labels for chart lines
  const chartLabels = useMemo(
    () => sensors.map((s) => SENSOR_TYPE_LABELS[s.sensor_type] ?? s.sensor_type),
    [sensors],
  );

  // Apply client-side LTTB downsampling when big data mode is on
  const displayChartData = useMemo(() => {
    if (!bigDataMode || chartData.length <= BIG_DATA_THRESHOLD) return chartData;
    const firstLabel = chartLabels[0];
    if (!firstLabel) return chartData;
    const withValue = chartData.map((p) => ({
      ...p,
      value: (p[firstLabel] as number) ?? 0,
    }));
    return lttbDownsample(withValue, BIG_DATA_TARGET_POINTS);
  }, [chartData, bigDataMode, chartLabels]);

  const handleExportCsv = useCallback(async () => {
    if (!numericZoneId) return;
    setExporting(true);
    try {
      const blob = await exportZoneCsv(numericZoneId, {
        from: timeRange.from,
        to: timeRange.to,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `zone_${numericZoneId}_readings.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // Silent fail — could add toast notification later
    } finally {
      setExporting(false);
    }
  }, [numericZoneId, timeRange]);

  const startEditingThresholds = useCallback((sensor: Sensor) => {
    setEditingThresholds(sensor.id);
    setThresholdForm({
      min: sensor.min_threshold !== null ? String(sensor.min_threshold) : "",
      max: sensor.max_threshold !== null ? String(sensor.max_threshold) : "",
    });
  }, []);

  const saveThresholds = useCallback(async () => {
    if (editingThresholds === null) return;
    setSavingThresholds(true);
    try {
      const payload: { min_threshold: number | null; max_threshold: number | null } = {
        min_threshold: thresholdForm.min !== "" ? Number(thresholdForm.min) : null,
        max_threshold: thresholdForm.max !== "" ? Number(thresholdForm.max) : null,
      };
      const updated = await updateSensor(editingThresholds, payload);
      setSensors((prev) => prev.map((s) => (s.id === editingThresholds ? updated : s)));
      toast.success(t("success.saved"));
      setEditingThresholds(null);
    } catch {
      // Silently fail
    } finally {
      setSavingThresholds(false);
    }
  }, [editingThresholds, thresholdForm]);

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!zone) {
    return (
      <div className="rounded-lg bg-destructive/10 p-4 text-sm text-destructive">
        Zone not found.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Link to="/" className="hover:text-primary">{t("nav.dashboard")}</Link>
            <span>/</span>
            <span>{zone.name}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-foreground">{zone.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
            <span>Relay #{zone.relay_id}</span>
            <StatusBadge online={zone.is_online} />
            {isConnected && (
              <span className="flex items-center gap-1 text-xs text-green-600">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-green-500" />
                {t("status.live")}
              </span>
            )}
          </div>
          {zone.last_seen && (
            <p className="mt-0.5 text-xs text-muted-foreground/60">
              Last seen {formatRelativeTime(zone.last_seen)}
            </p>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground/80 shadow-sm transition-colors hover:bg-accent disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? tp("zoneDetail.exporting") : tp("zoneDetail.exportCsv")}
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
          {PERIOD_VALUES.map((val) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === val
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground"
              }`}
            >
              {tp(`zoneDetail.periods.${val}`)}
            </button>
          ))}
        </div>
        {period === "custom" && (
          <div className="flex items-center gap-2">
            <input
              type="datetime-local"
              value={customFrom ? customFrom.slice(0, 16) : ""}
              onChange={(e) => setCustomFrom(e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="rounded-lg border border-border bg-card text-foreground px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-muted-foreground/60">to</span>
            <input
              type="datetime-local"
              value={customTo ? customTo.slice(0, 16) : ""}
              onChange={(e) => setCustomTo(e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="rounded-lg border border-border bg-card text-foreground px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
        )}
      </div>

      {/* Big Data mode toggle */}
      <label className="flex cursor-pointer items-center gap-2" title={tp("history.bigDataModeHint")}>
        <input
          type="checkbox"
          checked={bigDataMode}
          onChange={(e) => setBigDataMode(e.target.checked)}
          className="h-4 w-4 rounded border-border text-primary accent-primary focus:ring-2 focus:ring-ring"
        />
        <span className="text-sm text-foreground/80">{tp("history.bigDataMode")}</span>
        {bigDataMode && displayChartData.length > 0 && (
          <span className="text-xs text-muted-foreground">
            ({tp("history.pointsDisplayed", { count: displayChartData.length })})
          </span>
        )}
      </label>

      {/* Combined Chart */}
      {sensors.length > 0 && displayChartData.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-foreground">{tp("zoneDetail.sensorHistory")}</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={displayChartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {chartLabels.map((label, i) => (
                <Line
                  key={label}
                  type="monotone"
                  dataKey={label}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : sensors.length > 0 ? (
        <div className="rounded-xl border border-border bg-card p-8 text-center text-sm text-muted-foreground/60">
          {tp("zoneDetail.noReadings")}
        </div>
      ) : null}

      {/* Individual Sensor Charts */}
      {sensors.length > 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sensors.map((sensor, i) => {
            const sensorLabel = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;
            const unit = SENSOR_TYPE_UNITS[sensor.sensor_type] ?? sensor.unit;
            const sensorChartData = displayChartData
              .filter((d) => (d as Record<string, unknown>)[sensorLabel] !== undefined)
              .map((d) => ({ time: d.time, value: (d as Record<string, unknown>)[sensorLabel] }));

            return (
              <div key={sensor.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium text-foreground">{sensorLabel}</h3>
                    {anomalies && anomalies.anomalies.length > 0 && (
                      <AnomalyBadge anomalies={anomalies.anomalies} sensorId={sensor.id} />
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground">{unit}</span>
                </div>
                {sensorChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={sensorChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke={CHART_COLORS[i % CHART_COLORS.length]}
                        strokeWidth={2}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground/60">No data</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* AI Smart Suggestions */}
      {suggestions && suggestions.suggestions.length > 0 && numericZoneId && (
        <SmartSuggestionCard
          suggestions={suggestions.suggestions}
          zoneId={numericZoneId}
          onApplied={fetchAIData}
        />
      )}

      {/* AI Prediction Charts */}
      {predictions && predictions.sensors.length > 0 && (
        <div>
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            {tp("predictions.title")}
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">AI</span>
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {predictions.sensors.map((sensorPred, i) => {
              const recentForSensor = (readings[sensorPred.sensor_id] ?? []).slice(0, 20);
              const drift = predictions.drift[sensorPred.sensor_id];
              return (
                <PredictionChart
                  key={sensorPred.sensor_id}
                  sensorPrediction={sensorPred}
                  drift={drift}
                  recentReadings={recentForSensor}
                  color={CHART_COLORS[i % CHART_COLORS.length]}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Latest Readings Table */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">{tp("zoneDetail.latestReadings")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">{t("labels.sensor")}</th>
                <th className="px-4 py-3">{t("labels.value")}</th>
                <th className="px-4 py-3">{t("labels.thresholds")}</th>
                <th className="px-4 py-3">{t("labels.lastUpdated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sensors.map((sensor) => {
                const live = latestReadings[sensor.id];
                const history = readings[sensor.id];
                const historyEntry = history && history.length > 0 ? history[0] : null;
                // Aggregated readings use "avg_value" + "period", raw use "value" + "received_at"
                const raw = historyEntry as unknown as Record<string, unknown> | null;
                const historyValue = historyEntry
                  ? ((raw?.avg_value as number) ?? historyEntry.value)
                  : undefined;
                const historyTime = historyEntry
                  ? ((raw?.period as string) ?? historyEntry.received_at)
                  : undefined;
                const lastValue = live?.value ?? historyValue;
                const lastTime = live?.received_at ?? historyTime;
                const label = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;
                const unit = SENSOR_TYPE_UNITS[sensor.sensor_type] ?? sensor.unit;

                const isOutOfRange =
                  lastValue != null &&
                  ((sensor.min_threshold !== null && lastValue < sensor.min_threshold) ||
                    (sensor.max_threshold !== null && lastValue > sensor.max_threshold));

                return (
                  <tr key={sensor.id} className="hover:bg-accent">
                    <td className="px-4 py-3 font-medium text-foreground">{label}</td>
                    <td className={`px-4 py-3 font-semibold ${isOutOfRange ? "text-destructive" : "text-foreground"}`}>
                      <div className="flex items-center gap-2">
                        <span>{lastValue != null ? formatSensorValue(lastValue, unit) : "--"}</span>
                        {anomalies && anomalies.anomalies.length > 0 && (
                          <AnomalyBadge anomalies={anomalies.anomalies} sensorId={sensor.id} />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {sensor.min_threshold !== null || sensor.max_threshold !== null ? (
                        <>
                          {sensor.min_threshold !== null ? `${sensor.min_threshold}` : "--"}
                          {" — "}
                          {sensor.max_threshold !== null ? `${sensor.max_threshold}` : "--"}
                          {unit ? ` ${unit}` : ""}
                        </>
                      ) : (
                        <span className="text-muted-foreground/60">{tp("zoneDetail.notSet")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {lastTime ? formatDate(lastTime) : "--"}
                    </td>
                  </tr>
                );
              })}
              {sensors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground/60">
                    {tp("zoneDetail.noSensorsConfigured")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Threshold Configuration */}
      {sensors.length > 0 && (
        <div className="rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-lg font-semibold text-foreground">{tp("zoneDetail.alertThresholds")}</h2>
            <p className="text-xs text-muted-foreground">{tp("zoneDetail.alertThresholdsHint")}</p>
          </div>
          <div className="divide-y divide-border">
            {sensors.map((sensor) => {
              const label = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;
              const unit = SENSOR_TYPE_UNITS[sensor.sensor_type] ?? sensor.unit;
              const isEditing = editingThresholds === sensor.id;

              return (
                <div key={sensor.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="w-32 flex-shrink-0">
                    <p className="text-sm font-medium text-foreground">{label}</p>
                    {unit && <p className="text-xs text-muted-foreground">{unit}</p>}
                  </div>

                  {isEditing ? (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">{t("labels.minThreshold")}:</label>
                        <input
                          type="number"
                          step="any"
                          value={thresholdForm.min}
                          onChange={(e) => setThresholdForm((f) => ({ ...f, min: e.target.value }))}
                          className="w-24 rounded-md border border-border bg-card text-foreground px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="--"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-muted-foreground">{t("labels.maxThreshold")}:</label>
                        <input
                          type="number"
                          step="any"
                          value={thresholdForm.max}
                          onChange={(e) => setThresholdForm((f) => ({ ...f, max: e.target.value }))}
                          className="w-24 rounded-md border border-border bg-card text-foreground px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          placeholder="--"
                        />
                      </div>
                      <button
                        onClick={saveThresholds}
                        disabled={savingThresholds}
                        className="rounded-md bg-primary px-3 py-1 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
                      >
                        {savingThresholds ? "..." : t("actions.save")}
                      </button>
                      <button
                        onClick={() => setEditingThresholds(null)}
                        className="rounded-md border border-border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                      >
                        {t("actions.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground">
                        {sensor.min_threshold !== null || sensor.max_threshold !== null ? (
                          <>
                            {sensor.min_threshold ?? "--"} — {sensor.max_threshold ?? "--"}
                            {unit ? ` ${unit}` : ""}
                          </>
                        ) : (
                          <span className="text-muted-foreground/60">{tp("zoneDetail.notConfigured")}</span>
                        )}
                      </span>
                      <button
                        onClick={() => startEditingThresholds(sensor)}
                        className="rounded-md border border-border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                      >
                        {t("actions.edit")}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Actuators */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-lg font-semibold text-foreground">{tp("zoneDetail.actuators")}</h2>
        </div>
        {actuators.length > 0 ? (
          <div className="divide-y divide-border">
            {actuators.map((actuator) => {
              const label = ACTUATOR_TYPE_LABELS[actuator.actuator_type] ?? actuator.actuator_type;
              return (
                <div key={actuator.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-foreground">{actuator.name}</p>
                    <p className="text-xs text-muted-foreground">{label}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      actuator.state
                        ? "bg-success/10 text-success"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        actuator.state ? "bg-success" : "bg-muted-foreground/30"
                      }`}
                    />
                    {actuator.state ? t("status.on") : t("status.off")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground/60">
            {tp("zoneDetail.noActuators")}
          </p>
        )}
      </div>
    </div>
  );
}
