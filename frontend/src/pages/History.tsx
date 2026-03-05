/**
 * History page — cross-zone comparison with multi-zone overlay charts.
 * Users can select multiple zones, a sensor type, and a period to
 * visualise historical readings on a single LineChart.
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
} from "recharts";
import { format, subHours, subDays } from "date-fns";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors, getSensorReadings } from "@/api/sensors";
import { Spinner } from "@/components/ui/Spinner";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS } from "@/utils/constants";
import { lttbDownsample, BIG_DATA_THRESHOLD, BIG_DATA_TARGET_POINTS } from "@/utils/downsample";
import type { Greenhouse, Zone, SensorType, SensorReading } from "@/types";

/* ---------- local types ---------- */

type Period = "1h" | "24h" | "7d" | "30d";

interface GreenhouseWithZones extends Greenhouse {
  zones: Zone[];
}

interface ChartDataPoint {
  time: string;
  timestamp: number;
  [key: string]: string | number;
}

/* ---------- constants ---------- */

const CHART_COLORS = ["#16a34a", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2"];

const ALL_SENSOR_TYPES: SensorType[] = ["TEMP", "HUM_AIR", "HUM_SOIL", "PH", "LIGHT", "CO2"];

const PERIODS: Period[] = ["1h", "24h", "7d", "30d"];

/* ====================================================================== */
/*  History                                                                */
/* ====================================================================== */

export default function History() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  /* ---- data state ---- */
  const [greenhouses, setGreenhouses] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- filter state ---- */
  const [selectedZoneIds, setSelectedZoneIds] = useState<Set<number>>(new Set());
  const [sensorType, setSensorType] = useState<SensorType>("TEMP");
  const [period, setPeriod] = useState<Period>("24h");
  const [bigDataMode, setBigDataMode] = useState(false);

  /* ---- chart data state ---- */
  const [chartReadings, setChartReadings] = useState<Record<number, SensorReading[]>>({});
  const [loadingReadings, setLoadingReadings] = useState(false);

  /* ---- zone id -> name lookup ---- */
  const zoneNameMap = useMemo(() => {
    const map = new Map<number, string>();
    greenhouses.forEach((gh) => {
      gh.zones.forEach((z) => map.set(z.id, z.name));
    });
    return map;
  }, [greenhouses]);

  /* ---- compute time range from period ---- */
  const timeRange = useMemo(() => {
    const now = new Date();
    switch (period) {
      case "1h":
        return { from: subHours(now, 1).toISOString(), to: now.toISOString(), interval: undefined };
      case "24h":
        return { from: subHours(now, 24).toISOString(), to: now.toISOString(), interval: "hour" as const };
      case "7d":
        return { from: subDays(now, 7).toISOString(), to: now.toISOString(), interval: "day" as const };
      case "30d":
        return { from: subDays(now, 30).toISOString(), to: now.toISOString(), interval: "day" as const };
    }
  }, [period]);

  /* ---- fetch greenhouses and zones on mount ---- */
  useEffect(() => {
    async function fetchStructure() {
      try {
        const ghResponse = await listGreenhouses();
        const withZones: GreenhouseWithZones[] = await Promise.all(
          ghResponse.results.map(async (gh) => {
            const zoneResponse = await listZones(gh.id);
            return { ...gh, zones: zoneResponse.results };
          }),
        );
        setGreenhouses(withZones);
      } catch {
        // Global interceptor shows toast.error automatically
      } finally {
        setLoading(false);
      }
    }
    fetchStructure();
  }, [t]);

  /* ---- fetch readings when selection changes ---- */
  const fetchReadings = useCallback(async () => {
    if (selectedZoneIds.size === 0) {
      setChartReadings({});
      return;
    }

    setLoadingReadings(true);
    const result: Record<number, SensorReading[]> = {};

    await Promise.all(
      Array.from(selectedZoneIds).map(async (zoneId) => {
        try {
          // Find the sensor matching the selected type in this zone
          const sensorsResponse = await listSensors(zoneId);
          const matchingSensor = sensorsResponse.results.find((s) => s.sensor_type === sensorType);
          if (!matchingSensor) {
            result[zoneId] = [];
            return;
          }
          const readingsResponse = await getSensorReadings(matchingSensor.id, {
            from: timeRange.from,
            to: timeRange.to,
            interval: timeRange.interval,
            ...(bigDataMode ? { max_points: BIG_DATA_TARGET_POINTS } : {}),
          });
          result[zoneId] = readingsResponse.results;
        } catch {
          result[zoneId] = [];
        }
      }),
    );

    setChartReadings(result);
    setLoadingReadings(false);
  }, [selectedZoneIds, sensorType, timeRange, bigDataMode]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  /* ---- zone names for legend lines ---- */
  const selectedZoneNames = useMemo(
    () => Array.from(selectedZoneIds).map((id) => zoneNameMap.get(id) ?? `Zone ${id}`),
    [selectedZoneIds, zoneNameMap],
  );

  /* ---- build merged chart data ---- */
  const chartData = useMemo(() => {
    const timeMap = new Map<string, ChartDataPoint>();

    Array.from(selectedZoneIds).forEach((zoneId) => {
      const readings = chartReadings[zoneId] ?? [];
      const zoneName = zoneNameMap.get(zoneId) ?? `Zone ${zoneId}`;

      readings.forEach((r) => {
        // Aggregated readings have "period" + "avg_value", raw have "received_at" + "value"
        const raw = r as unknown as Record<string, unknown>;
        const timeStr = (raw.period as string) ?? r.received_at;
        const val = (raw.avg_value as number) ?? r.value;

        const existing = timeMap.get(timeStr);
        if (existing) {
          existing[zoneName] = Number(val.toFixed(2));
        } else {
          const ts = new Date(timeStr).getTime();
          timeMap.set(timeStr, {
            time: format(new Date(timeStr), period === "7d" || period === "30d" ? "MM/dd" : "HH:mm"),
            timestamp: ts,
            [zoneName]: Number(val.toFixed(2)),
          });
        }
      });
    });

    let sorted = Array.from(timeMap.values()).sort((a, b) => a.timestamp - b.timestamp);

    // Apply client-side LTTB downsampling on the merged dataset when big data mode is on
    if (bigDataMode && sorted.length > BIG_DATA_THRESHOLD) {
      // Downsample using the first zone's values to pick key points
      const firstZoneName = selectedZoneNames[0];
      if (firstZoneName) {
        const withValue = sorted.map((p) => ({
          ...p,
          value: (p[firstZoneName] as number) ?? 0,
        }));
        sorted = lttbDownsample(withValue, BIG_DATA_TARGET_POINTS);
      }
    }

    return sorted;
  }, [selectedZoneIds, chartReadings, zoneNameMap, period, bigDataMode, selectedZoneNames]);

  /* ---- toggle zone selection ---- */
  function toggleZone(zoneId: number) {
    setSelectedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
      }
      return next;
    });
  }

  /* ---- render ---- */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const unit = SENSOR_TYPE_UNITS[sensorType] ?? "";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{tp("history.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tp("history.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Zone multi-select */}
        <div className="lg:col-span-2">
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {tp("history.selectZones")}
          </label>
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border bg-card p-3">
            {greenhouses.map((gh) => (
              <div key={gh.id} className="mb-3 last:mb-0">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                  {gh.name}
                </p>
                {gh.zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground/60">--</p>
                ) : (
                  <div className="space-y-1">
                    {gh.zones.map((zone) => (
                      <label
                        key={zone.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground/80 hover:bg-accent"
                      >
                        <input
                          type="checkbox"
                          checked={selectedZoneIds.has(zone.id)}
                          onChange={() => toggleZone(zone.id)}
                          className="h-4 w-4 rounded border-border text-primary accent-primary focus:ring-2 focus:ring-ring"
                        />
                        {zone.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Sensor type selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {tp("history.sensorType")}
          </label>
          <select
            value={sensorType}
            onChange={(e) => setSensorType(e.target.value as SensorType)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ALL_SENSOR_TYPES.map((st) => (
              <option key={st} value={st}>
                {SENSOR_TYPE_LABELS[st] ?? st}
              </option>
            ))}
          </select>
        </div>

        {/* Period selector */}
        <div>
          <label className="mb-2 block text-sm font-medium text-foreground/80">
            {tp("history.period")}
          </label>
          <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`flex-1 rounded-md px-2 py-1.5 text-sm font-medium transition-colors ${
                  period === p
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {tp(`history.periods.${p}`)}
              </button>
            ))}
          </div>

          {/* Big Data mode toggle */}
          <label className="mt-3 flex cursor-pointer items-center gap-2" title={tp("history.bigDataModeHint")}>
            <input
              type="checkbox"
              checked={bigDataMode}
              onChange={(e) => setBigDataMode(e.target.checked)}
              className="h-4 w-4 rounded border-border text-primary accent-primary focus:ring-2 focus:ring-ring"
            />
            <span className="text-sm text-foreground/80">{tp("history.bigDataMode")}</span>
          </label>
          {bigDataMode && chartData.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              {tp("history.pointsDisplayed", { count: chartData.length })}
            </p>
          )}
        </div>
      </div>

      {/* Chart or empty state */}
      {selectedZoneIds.size === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="mt-4 text-sm text-muted-foreground">{tp("history.noZonesSelected")}</p>
        </div>
      ) : loadingReadings ? (
        <div className="flex h-64 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : chartData.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-muted-foreground/30"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
          <p className="mt-4 text-sm text-muted-foreground">{tp("history.noData")}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            {SENSOR_TYPE_LABELS[sensorType] ?? sensorType}
            {unit ? ` (${unit})` : ""}
          </h2>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="time" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend />
              {selectedZoneNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
                  strokeWidth={2}
                  dot={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
