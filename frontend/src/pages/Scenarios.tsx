/**
 * Scenarios & Schedules page — manage time-based automation scenarios.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import {
  listScenarios,
  createScenario,
  updateScenario,
  deleteScenario,
  runScenario,
  listSchedules,
  createSchedule,
  updateSchedule,
  deleteSchedule,
} from "@/api/scenarios";
import toast from "react-hot-toast";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import type {
  Actuator,
  Greenhouse,
  Scenario,
  ScenarioPayload,
  ScenarioStep,
  ScheduleData,
  SchedulePayload,
  Zone,
} from "@/types";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const STATUS_COLORS: Record<string, string> = {
  IDLE: "bg-muted text-foreground/80",
  RUNNING: "bg-blue-500/10 text-blue-500",
  COMPLETED: "bg-green-500/10 text-green-500",
  FAILED: "bg-destructive/10 text-destructive",
};

export default function Scenarios() {
  const { t } = useTranslation(["pages", "common"]);

  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [selectedZone, setSelectedZone] = useState<number | null>(null);
  const [actuators, setActuators] = useState<Actuator[]>([]);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [schedules, setSchedules] = useState<ScheduleData[]>([]);
  const [loading, setLoading] = useState(false);

  // Modals
  const [showScenarioModal, setShowScenarioModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<Scenario | null>(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleData | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{type: "scenario" | "schedule"; id: number; name: string} | null>(null);

  // Tab
  const [tab, setTab] = useState<"scenarios" | "calendar">("scenarios");

  // Load greenhouses + zones
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

  // Load data when zone changes
  const loadData = useCallback(async () => {
    if (!selectedZone) return;
    setLoading(true);
    try {
      const [scnRes, schRes] = await Promise.all([
        listScenarios(selectedZone),
        listSchedules(selectedZone),
      ]);
      setScenarios(scnRes.results);
      setSchedules(schRes.results);
      // also load actuators for the zone
      const actRes = await listActuators(selectedZone);
      setActuators(actRes.results);
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setLoading(false);
    }
  }, [selectedZone, t]);

  useEffect(() => { loadData(); }, [loadData]);

  // Run scenario
  const handleRun = async (id: number) => {
    try {
      await runScenario(id);
      toast.success(t("common:success.scenarioStarted"));
      loadData();
    } catch {
      // Global interceptor shows toast.error automatically
    }
  };

  // Delete confirm
  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "scenario") {
        await deleteScenario(deleteTarget.id);
      } else {
        await deleteSchedule(deleteTarget.id);
      }
      setDeleteTarget(null);
      toast.success(t("common:success.deleted"));
      loadData();
    } catch {
      // Global interceptor shows toast.error automatically
    }
  };

  // Weekly calendar data
  const calendarRows = useMemo(() => {
    const rows: { schedule: ScheduleData; days: boolean[]; timeLabel: string }[] = [];
    for (const sched of schedules) {
      const days = [false, false, false, false, false, false, false];
      let timeLabel = "";

      if (sched.schedule_type === "CRON") {
        // Parse cron_day_of_week
        if (sched.cron_day_of_week === "*") {
          days.fill(true);
        } else {
          sched.cron_day_of_week.split(",").forEach((d) => {
            const idx = parseInt(d.trim(), 10);
            if (idx >= 0 && idx <= 6) days[idx] = true;
          });
        }
        timeLabel = `${sched.cron_hour.padStart(2, "0")}:${sched.cron_minute.padStart(2, "0")}`;
      } else if (sched.schedule_type === "TIME_RANGE") {
        sched.days_of_week.forEach((d) => {
          if (d >= 0 && d <= 6) days[d] = true;
        });
        timeLabel = `${sched.start_time || "?"} - ${sched.end_time || "?"}`;
      }

      rows.push({ schedule: sched, days, timeLabel });
    }
    return rows;
  }, [schedules]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">
          {t("pages:scenarios.title")}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("pages:scenarios.subtitle")}
        </p>
      </div>

      {/* Zone selector + tabs */}
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
                {zones.filter((z) => z.greenhouse === gh.id).map((z) => (
                  <option key={z.id} value={z.id}>{z.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div className="flex gap-1">
          {(["scenarios", "calendar"] as const).map((t2) => (
            <button
              key={t2}
              onClick={() => setTab(t2)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t2
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground/80 hover:bg-accent"
              }`}
            >
              {t(`pages:scenarios.tabs.${t2}`)}
            </button>
          ))}
        </div>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => { setEditingScenario(null); setShowScenarioModal(true); }}
            className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            + {t("pages:scenarios.newScenario")}
          </button>
          <button
            onClick={() => { setEditingSchedule(null); setShowScheduleModal(true); }}
            className="rounded-lg bg-foreground px-3 py-1.5 text-sm font-medium text-background hover:bg-foreground/90 transition-colors"
          >
            + {t("pages:scenarios.newSchedule")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Spinner className="h-8 w-8" /></div>
      ) : tab === "scenarios" ? (
        /* Scenario list */
        <div className="space-y-4">
          {scenarios.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pages:scenarios.noScenarios")}</p>
          ) : (
            scenarios.map((scn) => (
              <div key={scn.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground">{scn.name}</h3>
                    {scn.description && (
                      <p className="text-sm text-muted-foreground">{scn.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[scn.status]}`}>
                      {scn.status}
                    </span>
                    <button
                      onClick={() => handleRun(scn.id)}
                      disabled={scn.status === "RUNNING"}
                      className="rounded-lg bg-green-500 px-3 py-1 text-xs font-medium text-white hover:bg-green-500/80 transition-colors disabled:opacity-50"
                    >
                      {t("pages:scenarios.runNow")}
                    </button>
                    <button
                      onClick={() => { setEditingScenario(scn); setShowScenarioModal(true); }}
                      className="rounded-lg bg-muted px-3 py-1 text-xs font-medium text-foreground/80 hover:bg-accent transition-colors"
                    >
                      {t("common:actions.edit")}
                    </button>
                    <button
                      onClick={() => setDeleteTarget({ type: "scenario", id: scn.id, name: scn.name })}
                      className="rounded-lg bg-destructive/10 px-3 py-1 text-xs font-medium text-destructive hover:bg-destructive/20 transition-colors"
                    >
                      {t("common:actions.delete")}
                    </button>
                  </div>
                </div>

                {/* Steps timeline */}
                {scn.steps.length > 0 && (
                  <div className="mt-3 flex items-center gap-1 overflow-x-auto">
                    {scn.steps.map((step, idx) => (
                      <div key={step.id || idx} className="flex items-center gap-1">
                        {idx > 0 && (
                          <div className="flex flex-col items-center">
                            <div className="h-0.5 w-6 bg-border" />
                            {step.delay_seconds > 0 && (
                              <span className="text-[9px] text-muted-foreground/60">{step.delay_seconds}s</span>
                            )}
                          </div>
                        )}
                        <div className={`rounded-md border px-2 py-1 text-xs ${
                          step.action === "ON" ? "border-green-500/30 bg-green-500/10" :
                          step.action === "OFF" ? "border-destructive/30 bg-destructive/10" :
                          "border-amber-500/30 bg-amber-500/10"
                        }`}>
                          <span className="font-medium">{step.actuator_name || `#${step.actuator}`}</span>
                          <span className="ml-1 text-muted-foreground">{step.action}</span>
                          {step.duration_seconds && (
                            <span className="ml-1 text-muted-foreground/60">({step.duration_seconds}s)</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {scn.last_run_at && (
                  <p className="mt-2 text-[10px] text-muted-foreground/60">
                    {t("pages:scenarios.lastRun")}: {new Date(scn.last_run_at).toLocaleString()}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        /* Weekly Calendar */
        <div className="rounded-xl border border-border bg-card p-4 overflow-x-auto">
          <h3 className="mb-4 text-sm font-semibold text-foreground/80">
            {t("pages:scenarios.weeklyCalendar")}
          </h3>
          {calendarRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pages:scenarios.noSchedules")}</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="border-b border-border px-3 py-2 text-left text-muted-foreground">{t("pages:scenarios.schedule")}</th>
                  <th className="border-b border-border px-3 py-2 text-left text-muted-foreground">{t("pages:scenarios.scenario")}</th>
                  <th className="border-b border-border px-3 py-2 text-left text-muted-foreground">{t("pages:scenarios.time")}</th>
                  {DAY_NAMES.map((d) => (
                    <th key={d} className="border-b border-border px-2 py-2 text-center text-muted-foreground">{d}</th>
                  ))}
                  <th className="border-b border-border px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {calendarRows.map(({ schedule, days, timeLabel }) => (
                  <tr key={schedule.id} className="hover:bg-accent transition-colors">
                    <td className="border-b border-border px-3 py-2 font-medium text-foreground">{schedule.name}</td>
                    <td className="border-b border-border px-3 py-2 text-muted-foreground">{schedule.scenario_name}</td>
                    <td className="border-b border-border px-3 py-2 text-muted-foreground">{timeLabel}</td>
                    {days.map((active, i) => (
                      <td key={i} className="border-b border-border px-2 py-2 text-center">
                        {active ? (
                          <span className="inline-block h-4 w-4 rounded-full bg-primary" />
                        ) : (
                          <span className="inline-block h-4 w-4 rounded-full bg-muted" />
                        )}
                      </td>
                    ))}
                    <td className="border-b border-border px-2 py-2">
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingSchedule(schedule); setShowScheduleModal(true); }}
                          className="text-xs text-primary hover:underline"
                        >
                          {t("common:actions.edit")}
                        </button>
                        <button
                          onClick={() => setDeleteTarget({ type: "schedule", id: schedule.id, name: schedule.name })}
                          className="text-xs text-destructive hover:underline"
                        >
                          {t("common:actions.delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Scenario Modal */}
      {showScenarioModal && (
        <ScenarioModal
          scenario={editingScenario}
          actuators={actuators}
          zoneId={selectedZone!}
          onClose={() => setShowScenarioModal(false)}
          onSaved={() => { setShowScenarioModal(false); loadData(); }}
          t={t}
        />
      )}

      {/* Schedule Modal */}
      {showScheduleModal && (
        <ScheduleModal
          schedule={editingSchedule}
          scenarios={scenarios}
          zoneId={selectedZone!}
          onClose={() => setShowScheduleModal(false)}
          onSaved={() => { setShowScheduleModal(false); loadData(); }}
          t={t}
        />
      )}

      {/* Delete confirm */}
      {deleteTarget && (
        <ConfirmDialog
          open
          onClose={() => setDeleteTarget(null)}
          title={t("common:actions.delete")}
          message={`${t("pages:scenarios.confirmDelete")} "${deleteTarget.name}"?`}
          onConfirm={handleConfirmDelete}
        />
      )}
    </div>
  );
}

/* ---- Scenario Builder Modal ---- */

function ScenarioModal({
  scenario,
  actuators,
  zoneId,
  onClose,
  onSaved,
  t,
}: {
  scenario: Scenario | null;
  actuators: Actuator[];
  zoneId: number;
  onClose: () => void;
  onSaved: () => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(scenario?.name || "");
  const [description, setDescription] = useState(scenario?.description || "");
  const [steps, setSteps] = useState<ScenarioStep[]>(
    scenario?.steps.map((s) => ({ ...s })) || []
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const addStep = () => {
    setSteps([
      ...steps,
      {
        actuator: actuators[0]?.id || 0,
        order: steps.length,
        action: "ON",
        delay_seconds: 0,
        duration_seconds: null,
      },
    ]);
  };

  const removeStep = (idx: number) => {
    const next = steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i }));
    setSteps(next);
  };

  const updateStep = (idx: number, field: string, value: any) => {
    const next = [...steps];
    next[idx] = { ...next[idx], [field]: value };
    setSteps(next);
  };

  const handleSave = async () => {
    if (!name.trim()) { setErr(t("common:errors.required")); return; }
    setSaving(true);
    setErr("");
    const payload: ScenarioPayload = {
      name,
      description,
      steps: steps.map((s) => ({
        actuator: s.actuator,
        order: s.order,
        action: s.action,
        action_value: s.action_value,
        delay_seconds: s.delay_seconds,
        duration_seconds: s.duration_seconds,
      })),
    };
    try {
      if (scenario) {
        await updateScenario(scenario.id, payload);
      } else {
        await createScenario(zoneId, payload);
      }
      toast.success(t("common:success.saved"));
      onSaved();
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={scenario ? t("pages:scenarios.editScenario") : t("pages:scenarios.newScenario")}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground/80">{t("common:labels.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-sm shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground/80">{t("common:labels.description")}</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-sm shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Steps Builder */}
        <div>
          <div className="flex items-center justify-between">
            <label className="block text-sm font-medium text-foreground/80">{t("pages:scenarios.steps")}</label>
            <button
              onClick={addStep}
              className="text-xs font-medium text-primary hover:underline"
            >
              + {t("pages:scenarios.addStep")}
            </button>
          </div>
          <div className="mt-2 space-y-2">
            {steps.map((step, idx) => (
              <div key={idx} className="flex items-center gap-2 rounded-lg border border-border bg-muted p-2">
                <span className="text-xs font-bold text-muted-foreground/60">#{idx}</span>
                <select
                  value={step.actuator}
                  onChange={(e) => updateStep(idx, "actuator", Number(e.target.value))}
                  className="rounded-lg border border-input bg-background text-foreground text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  {actuators.map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
                <select
                  value={step.action}
                  onChange={(e) => updateStep(idx, "action", e.target.value)}
                  className="rounded-lg border border-input bg-background text-foreground text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="ON">ON</option>
                  <option value="OFF">OFF</option>
                  <option value="SET">SET</option>
                </select>
                <input
                  type="number"
                  value={step.delay_seconds}
                  onChange={(e) => updateStep(idx, "delay_seconds", Number(e.target.value))}
                  className="w-16 rounded-lg border border-input bg-background text-foreground text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("pages:scenarios.delay")}
                  title={t("pages:scenarios.delaySec")}
                />
                <input
                  type="number"
                  value={step.duration_seconds ?? ""}
                  onChange={(e) => updateStep(idx, "duration_seconds", e.target.value ? Number(e.target.value) : null)}
                  className="w-16 rounded-lg border border-input bg-background text-foreground text-xs px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
                  placeholder={t("pages:scenarios.duration")}
                  title={t("pages:scenarios.durationSec")}
                />
                <button
                  onClick={() => removeStep(idx)}
                  className="text-destructive hover:text-destructive/80"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        </div>

        {err && <p className="text-xs text-destructive">{String(err)}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/80 hover:bg-accent transition-colors">{t("common:actions.cancel")}</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Spinner className="h-4 w-4" /> : t("common:actions.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ---- Schedule Modal ---- */

function ScheduleModal({
  schedule,
  scenarios,
  zoneId,
  onClose,
  onSaved,
  t,
}: {
  schedule: ScheduleData | null;
  scenarios: Scenario[];
  zoneId: number;
  onClose: () => void;
  onSaved: () => void;
  t: (k: string) => string;
}) {
  const [name, setName] = useState(schedule?.name || "");
  const [scenarioId, setScenarioId] = useState(schedule?.scenario || scenarios[0]?.id || 0);
  const [scheduleType, setScheduleType] = useState<"CRON" | "TIME_RANGE">(schedule?.schedule_type || "CRON");
  const [cronMinute, setCronMinute] = useState(schedule?.cron_minute || "0");
  const [cronHour, setCronHour] = useState(schedule?.cron_hour || "6");
  const [cronDow, setCronDow] = useState(schedule?.cron_day_of_week || "*");
  const [startTime, setStartTime] = useState(schedule?.start_time || "06:00");
  const [endTime, setEndTime] = useState(schedule?.end_time || "06:30");
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(schedule?.days_of_week || [0, 1, 2, 3, 4]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const toggleDay = (day: number) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()
    );
  };

  const handleSave = async () => {
    if (!name.trim()) { setErr(t("common:errors.required")); return; }
    setSaving(true);
    setErr("");
    const payload: SchedulePayload = {
      scenario: scenarioId,
      name,
      schedule_type: scheduleType,
      ...(scheduleType === "CRON" ? {
        cron_minute: cronMinute,
        cron_hour: cronHour,
        cron_day_of_week: cronDow,
      } : {
        start_time: startTime,
        end_time: endTime,
        days_of_week: daysOfWeek,
      }),
    };
    try {
      if (schedule) {
        await updateSchedule(schedule.id, payload);
      } else {
        await createSchedule(zoneId, payload);
      }
      toast.success(t("common:success.saved"));
      onSaved();
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title={schedule ? t("pages:scenarios.editSchedule") : t("pages:scenarios.newSchedule")}
      onClose={onClose}
    >
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-foreground/80">{t("common:labels.name")}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-sm shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80">{t("pages:scenarios.scenario")}</label>
          <select
            value={scenarioId}
            onChange={(e) => setScenarioId(Number(e.target.value))}
            className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-sm shadow-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {scenarios.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-foreground/80">{t("pages:scenarios.type")}</label>
          <div className="mt-1 flex gap-2">
            {(["CRON", "TIME_RANGE"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setScheduleType(st)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  scheduleType === st
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground/80 hover:bg-accent"
                }`}
              >
                {st === "CRON" ? "Cron" : t("pages:scenarios.timeRange")}
              </button>
            ))}
          </div>
        </div>

        {scheduleType === "CRON" ? (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-muted-foreground">{t("pages:scenarios.cronMinute")}</label>
              <input value={cronMinute} onChange={(e) => setCronMinute(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">{t("pages:scenarios.cronHour")}</label>
              <input value={cronHour} onChange={(e) => setCronHour(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground">{t("pages:scenarios.cronDow")}</label>
              <input value={cronDow} onChange={(e) => setCronDow(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted-foreground">{t("pages:scenarios.startTime")}</label>
                <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground">{t("pages:scenarios.endTime")}</label>
                <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="mt-1 w-full rounded-lg border border-input bg-background text-foreground text-xs px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1">{t("pages:scenarios.daysOfWeek")}</label>
              <div className="flex gap-1">
                {DAY_NAMES.map((d, i) => (
                  <button
                    key={i}
                    onClick={() => toggleDay(i)}
                    className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${
                      daysOfWeek.includes(i)
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {err && <p className="text-xs text-destructive">{err}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm text-foreground/80 hover:bg-accent transition-colors">{t("common:actions.cancel")}</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? <Spinner className="h-4 w-4" /> : t("common:actions.save")}
          </button>
        </div>
      </div>
    </Modal>
  );
}
