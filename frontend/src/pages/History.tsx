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
import { BarChart2 } from "lucide-react";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors, getSensorReadings } from "@/api/sensors";
import { GlowCard } from "@/components/ui/GlowCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/utils/cn";
import { useThemeStore } from "@/stores/themeStore";
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

const CHART_COLORS = ["#00ff9c", "#00d9ff", "#ffb300", "#ff4d4f", "#a78bfa", "#2dbf7f"];

const ALL_SENSOR_TYPES: SensorType[] = ["TEMP", "HUM_AIR", "HUM_SOIL", "PH", "LIGHT", "CO2"];

const PERIODS: Period[] = ["1h", "24h", "7d", "30d"];

/* ====================================================================== */
/*  History                                                                */
/* ====================================================================== */

export default function History() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");
  const theme = useThemeStore((s) => s.theme);

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
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <Skeleton className="lg:col-span-2 h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    );
  }

  const unit = SENSOR_TYPE_UNITS[sensorType] ?? "";
  const gridStroke = theme === "dark" ? "rgba(255,255,255,0.06)" : "#e5e7eb";
  const tickStyle = { fontSize: 11, fill: theme === "dark" ? "#6b7280" : "#9ca3af" };

  return (
    <div className="space-y-6 relative gradient-blur-primary gradient-blur-secondary">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart2 className="size-6 text-gh-secondary" aria-hidden="true" />
          {tp("history.title")}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{tp("history.subtitle")}</p>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* Zone multi-select */}
        <GlowCard variant="none" glass className="lg:col-span-2 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tp("history.selectZones")}</p>
          <div className="max-h-48 overflow-y-auto space-y-3">
            {greenhouses.map((gh) => (
              <div key={gh.id}>
                <p className="mb-1 text-xs font-medium text-muted-foreground/60">{gh.name}</p>
                {gh.zones.length === 0 ? (
                  <p className="text-xs text-muted-foreground/40">--</p>
                ) : (
                  <div className="space-y-0.5">
                    {gh.zones.map((zone) => (
                      <label key={zone.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm text-foreground/80 hover:bg-accent/50 transition-colors">
                        <input
                          type="checkbox"
                          checked={selectedZoneIds.has(zone.id)}
                          onChange={() => toggleZone(zone.id)}
                          className="h-3.5 w-3.5 rounded border-border accent-primary"
                        />
                        {zone.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </GlowCard>

        {/* Sensor type */}
        <GlowCard variant="none" glass className="p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tp("history.sensorType")}</p>
          <select
            value={sensorType}
            onChange={(e) => setSensorType(e.target.value as SensorType)}
            className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {ALL_SENSOR_TYPES.map((st) => (
              <option key={st} value={st}>{SENSOR_TYPE_LABELS[st] ?? st}</option>
            ))}
          </select>
        </GlowCard>

        {/* Period + Big Data toggle */}
        <GlowCard variant="none" glass className="p-4 flex flex-col gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tp("history.period")}</p>
          <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
            {PERIODS.map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn("flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition-colors",
                  period === p ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent"
                )}
              >
                {tp(`history.periods.${p}`)}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={bigDataMode} onChange={(e) => setBigDataMode(e.target.checked)} className="h-3.5 w-3.5 rounded border-border accent-primary" />
            <span className="text-xs text-muted-foreground">{tp("history.bigDataMode")}</span>
            {bigDataMode && chartData.length > 0 && <span className="text-xs text-muted-foreground/60">({chartData.length} pts)</span>}
          </label>
        </GlowCard>
      </div>

      {/* Chart or empty state */}
      {selectedZoneIds.size === 0 ? (
        <EmptyState
          icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          title={tp("history.noZonesSelected")}
          description=""
        />
      ) : loadingReadings ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : chartData.length === 0 ? (
        <EmptyState
          icon="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
          title={tp("history.noData")}
          description=""
        />
      ) : (
        <GlowCard variant="cyan" glass className="p-4">
          <h2 className="mb-4 text-base font-semibold text-foreground flex items-center gap-2">
            <BarChart2 className="size-4 text-gh-secondary" aria-hidden="true" />
            {SENSOR_TYPE_LABELS[sensorType] ?? sensorType}
            {unit ? ` (${unit})` : ""}
            {selectedZoneIds.size > 0 && <span className="text-xs text-muted-foreground font-normal">— {selectedZoneIds.size} zone{selectedZoneIds.size > 1 ? "s" : ""}</span>}
          </h2>
          <ResponsiveContainer width="100%" height={360} aria-label={`${sensorType} history chart`}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} />
              <XAxis dataKey="time" tick={tickStyle} axisLine={false} tickLine={false} />
              <YAxis tick={tickStyle} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ backgroundColor: theme === "dark" ? "#111720" : "#fff", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "0.5rem", fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {selectedZoneNames.map((name, i) => (
                <Line
                  key={name}
                  type="monotone"
                  dataKey={name}
                  stroke={CHART_COLORS[i % CHART_COLORS.length]}
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
    </div>
  );
}
