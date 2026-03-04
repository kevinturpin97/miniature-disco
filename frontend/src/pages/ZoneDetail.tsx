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
import { getZone, exportZoneCsv } from "@/api/zones";
import { listSensors, getSensorReadings, updateSensor } from "@/api/sensors";
import { listActuators } from "@/api/actuators";
import { useSensorData } from "@/hooks/useSensorData";
import { useSensorStore } from "@/stores/sensorStore";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS, ACTUATOR_TYPE_LABELS } from "@/utils/constants";
import { formatDate, formatRelativeTime, formatSensorValue } from "@/utils/formatters";
import type { Zone, Sensor, SensorReading, Actuator } from "@/types";

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
  const [error, setError] = useState("");

  const [period, setPeriod] = useState<Period>("24h");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [exporting, setExporting] = useState(false);

  // Threshold editing state
  const [editingThresholds, setEditingThresholds] = useState<number | null>(null);
  const [thresholdForm, setThresholdForm] = useState<{ min: string; max: string }>({ min: "", max: "" });
  const [savingThresholds, setSavingThresholds] = useState(false);

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
        setError("Failed to load zone data.");
      } finally {
        setLoading(false);
      }
    }
    fetchZoneData();
  }, [numericZoneId]);

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

  if (error || !zone) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error || "Zone not found."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Link to="/" className="hover:text-primary-600">{t("nav.dashboard")}</Link>
            <span>/</span>
            <span>{zone.name}</span>
          </div>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">{zone.name}</h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
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
            <p className="mt-0.5 text-xs text-gray-400">
              Last seen {formatRelativeTime(zone.last_seen)}
            </p>
          )}
        </div>
        <button
          onClick={handleExportCsv}
          disabled={exporting}
          className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          {exporting ? tp("zoneDetail.exporting") : tp("zoneDetail.exportCsv")}
        </button>
      </div>

      {/* Period Selector */}
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex gap-1 rounded-lg border bg-white p-1">
          {PERIOD_VALUES.map((val) => (
            <button
              key={val}
              onClick={() => setPeriod(val)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                period === val
                  ? "bg-primary-600 text-white"
                  : "text-gray-600 hover:bg-gray-100"
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
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
            <span className="text-sm text-gray-400">to</span>
            <input
              type="datetime-local"
              value={customTo ? customTo.slice(0, 16) : ""}
              onChange={(e) => setCustomTo(e.target.value ? new Date(e.target.value).toISOString() : "")}
              className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
            />
          </div>
        )}
      </div>

      {/* Combined Chart */}
      {sensors.length > 0 && chartData.length > 0 ? (
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">{tp("zoneDetail.sensorHistory")}</h2>
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
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
        <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
          {tp("zoneDetail.noReadings")}
        </div>
      ) : null}

      {/* Individual Sensor Charts */}
      {sensors.length > 1 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {sensors.map((sensor, i) => {
            const sensorLabel = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;
            const unit = SENSOR_TYPE_UNITS[sensor.sensor_type] ?? sensor.unit;
            const sensorChartData = chartData
              .filter((d) => d[sensorLabel] !== undefined)
              .map((d) => ({ time: d.time, value: d[sensorLabel] }));

            return (
              <div key={sensor.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="font-medium text-gray-900">{sensorLabel}</h3>
                  <span className="text-sm text-gray-500">{unit}</span>
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
                  <p className="py-8 text-center text-xs text-gray-400">No data</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Latest Readings Table */}
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">{tp("zoneDetail.latestReadings")}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-4 py-3">{t("labels.sensor")}</th>
                <th className="px-4 py-3">{t("labels.value")}</th>
                <th className="px-4 py-3">{t("labels.thresholds")}</th>
                <th className="px-4 py-3">{t("labels.lastUpdated")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
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
                  <tr key={sensor.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{label}</td>
                    <td className={`px-4 py-3 font-semibold ${isOutOfRange ? "text-red-600" : "text-gray-900"}`}>
                      {lastValue != null ? formatSensorValue(lastValue, unit) : "--"}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {sensor.min_threshold !== null || sensor.max_threshold !== null ? (
                        <>
                          {sensor.min_threshold !== null ? `${sensor.min_threshold}` : "--"}
                          {" — "}
                          {sensor.max_threshold !== null ? `${sensor.max_threshold}` : "--"}
                          {unit ? ` ${unit}` : ""}
                        </>
                      ) : (
                        <span className="text-gray-300">{tp("zoneDetail.notSet")}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {lastTime ? formatDate(lastTime) : "--"}
                    </td>
                  </tr>
                );
              })}
              {sensors.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
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
        <div className="rounded-xl border bg-white shadow-sm">
          <div className="border-b px-4 py-3">
            <h2 className="text-lg font-semibold text-gray-900">{tp("zoneDetail.alertThresholds")}</h2>
            <p className="text-xs text-gray-500">{tp("zoneDetail.alertThresholdsHint")}</p>
          </div>
          <div className="divide-y">
            {sensors.map((sensor) => {
              const label = SENSOR_TYPE_LABELS[sensor.sensor_type] ?? sensor.sensor_type;
              const unit = SENSOR_TYPE_UNITS[sensor.sensor_type] ?? sensor.unit;
              const isEditing = editingThresholds === sensor.id;

              return (
                <div key={sensor.id} className="flex flex-wrap items-center gap-4 px-4 py-3">
                  <div className="w-32 flex-shrink-0">
                    <p className="text-sm font-medium text-gray-900">{label}</p>
                    {unit && <p className="text-xs text-gray-500">{unit}</p>}
                  </div>

                  {isEditing ? (
                    <>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">{t("labels.minThreshold")}:</label>
                        <input
                          type="number"
                          step="any"
                          value={thresholdForm.min}
                          onChange={(e) => setThresholdForm((f) => ({ ...f, min: e.target.value }))}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          placeholder="--"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500">{t("labels.maxThreshold")}:</label>
                        <input
                          type="number"
                          step="any"
                          value={thresholdForm.max}
                          onChange={(e) => setThresholdForm((f) => ({ ...f, max: e.target.value }))}
                          className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                          placeholder="--"
                        />
                      </div>
                      <button
                        onClick={saveThresholds}
                        disabled={savingThresholds}
                        className="rounded-md bg-primary-600 px-3 py-1 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
                      >
                        {savingThresholds ? "..." : t("actions.save")}
                      </button>
                      <button
                        onClick={() => setEditingThresholds(null)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50"
                      >
                        {t("actions.cancel")}
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-gray-600">
                        {sensor.min_threshold !== null || sensor.max_threshold !== null ? (
                          <>
                            {sensor.min_threshold ?? "--"} — {sensor.max_threshold ?? "--"}
                            {unit ? ` ${unit}` : ""}
                          </>
                        ) : (
                          <span className="text-gray-400">{tp("zoneDetail.notConfigured")}</span>
                        )}
                      </span>
                      <button
                        onClick={() => startEditingThresholds(sensor)}
                        className="rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-gray-600 hover:bg-gray-50"
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
      <div className="rounded-xl border bg-white shadow-sm">
        <div className="border-b px-4 py-3">
          <h2 className="text-lg font-semibold text-gray-900">{tp("zoneDetail.actuators")}</h2>
        </div>
        {actuators.length > 0 ? (
          <div className="divide-y">
            {actuators.map((actuator) => {
              const label = ACTUATOR_TYPE_LABELS[actuator.actuator_type] ?? actuator.actuator_type;
              return (
                <div key={actuator.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">{actuator.name}</p>
                    <p className="text-xs text-gray-500">{label}</p>
                  </div>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      actuator.state
                        ? "bg-green-100 text-green-700"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    <span
                      className={`inline-block h-1.5 w-1.5 rounded-full ${
                        actuator.state ? "bg-green-500" : "bg-gray-400"
                      }`}
                    />
                    {actuator.state ? t("status.on") : t("status.off")}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="px-4 py-8 text-center text-sm text-gray-400">
            {tp("zoneDetail.noActuators")}
          </p>
        )}
      </div>
    </div>
  );
}
