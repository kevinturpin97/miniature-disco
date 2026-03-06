/**
 * Automations page — create, edit, delete, and toggle automation rules.
 * Includes a zone selector, rule cards with CRUD modals, and trigger history.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { z } from "zod";
import { Plus, Zap, ChevronDown, History } from "lucide-react";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { listCommands } from "@/api/commands";
import {
  listAutomations,
  createAutomation,
  updateAutomation,
  deleteAutomation,
} from "@/api/automations";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { GlowCard } from "@/components/ui/GlowCard";
import { AutomationChip } from "@/components/ui/AutomationChip";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/utils/cn";
import { SENSOR_TYPE_LABELS, ACTUATOR_TYPE_LABELS, COMMAND_STATUS_LABELS } from "@/utils/constants";
import { formatDate, formatRelativeTime } from "@/utils/formatters";
import type {
  Greenhouse,
  Zone,
  Actuator,
  AutomationRule,
  Command,
} from "@/types";

/* ---------- local types ---------- */

interface GreenhouseWithZones extends Greenhouse {
  zones: Zone[];
}

type RuleFormData = {
  name: string;
  description: string;
  sensor_type: string;
  condition: string;
  threshold_value: string;
  action_actuator: string;
  action_command_type: string;
  action_value: string;
  cooldown_seconds: string;
  is_active: boolean;
};

const EMPTY_FORM: RuleFormData = {
  name: "",
  description: "",
  sensor_type: "",
  condition: "GT",
  threshold_value: "",
  action_actuator: "",
  action_command_type: "ON",
  action_value: "",
  cooldown_seconds: "300",
  is_active: true,
};

const CONDITIONS = ["GT", "LT", "EQ", "GTE", "LTE"] as const;
const COMMAND_TYPES = ["ON", "OFF", "SET"] as const;
const SENSOR_TYPES = ["TEMP", "HUM_AIR", "HUM_SOIL", "PH", "LIGHT", "CO2"] as const;

/* ====================================================================== */
/*  Automations                                                            */
/* ====================================================================== */

export default function Automations() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  /* ---- structure state ---- */
  const [greenhouses, setGreenhouses] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- selection state ---- */
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);

  /* ---- zone data state ---- */
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [actuators, setActuators] = useState<Actuator[]>([]);
  const [triggerCommands, setTriggerCommands] = useState<Command[]>([]);
  const [loadingZone, setLoadingZone] = useState(false);

  /* ---- modal state ---- */
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [form, setForm] = useState<RuleFormData>(EMPTY_FORM);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  /* ---- delete state ---- */
  const [deleteTarget, setDeleteTarget] = useState<AutomationRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- fetch greenhouses + zones on mount ---- */
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

  /* ---- fetch zone data when zone selected ---- */
  const fetchZoneData = useCallback(async (zoneId: number) => {
    setLoadingZone(true);
    try {
      const [rulesRes, actuatorsRes, commandsRes] = await Promise.all([
        listAutomations(zoneId),
        listActuators(zoneId),
        listCommands(zoneId),
      ]);
      setRules(rulesRes.results);
      setActuators(actuatorsRes.results);
      setTriggerCommands(commandsRes.results.filter((c) => c.automation_rule !== null));
    } catch {
      setRules([]);
      setActuators([]);
      setTriggerCommands([]);
    } finally {
      setLoadingZone(false);
    }
  }, []);

  useEffect(() => {
    if (selectedZoneId !== null) {
      fetchZoneData(selectedZoneId);
    } else {
      setRules([]);
      setActuators([]);
      setTriggerCommands([]);
    }
  }, [selectedZoneId, fetchZoneData]);

  /* ---- Zod validation schema ---- */
  const ruleSchema = z.object({
    name: z.string().min(1, tp("automations.validation.nameRequired")),
    sensor_type: z.string().min(1, tp("automations.validation.sensorTypeRequired")),
    condition: z.string().min(1, tp("automations.validation.conditionRequired")),
    threshold_value: z.string().min(1, tp("automations.validation.thresholdRequired")).transform(Number),
    action_actuator: z.string().min(1, tp("automations.validation.actuatorRequired")).transform(Number),
    action_command_type: z.string().min(1, tp("automations.validation.commandTypeRequired")),
    cooldown_seconds: z.string().transform(Number).pipe(z.number().min(10, tp("automations.validation.cooldownMin"))),
  });

  /* ---- form helpers ---- */
  function openCreateModal() {
    setEditingRule(null);
    setForm(EMPTY_FORM);
    setFormErrors({});
    setModalOpen(true);
  }

  function openEditModal(rule: AutomationRule) {
    setEditingRule(rule);
    setForm({
      name: rule.name,
      description: rule.description,
      sensor_type: rule.sensor_type,
      condition: rule.condition,
      threshold_value: String(rule.threshold_value),
      action_actuator: String(rule.action_actuator),
      action_command_type: rule.action_command_type,
      action_value: rule.action_value !== null ? String(rule.action_value) : "",
      cooldown_seconds: String(rule.cooldown_seconds),
      is_active: rule.is_active,
    });
    setFormErrors({});
    setModalOpen(true);
  }

  function updateField(field: keyof RuleFormData, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  async function handleSubmit() {
    const result = ruleSchema.safeParse(form);
    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0];
        if (key) errors[String(key)] = issue.message;
      });
      setFormErrors(errors);
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: form.name,
        description: form.description,
        sensor_type: form.sensor_type,
        condition: form.condition,
        threshold_value: Number(form.threshold_value),
        action_actuator: Number(form.action_actuator),
        action_command_type: form.action_command_type,
        action_value: form.action_command_type === "SET" && form.action_value ? Number(form.action_value) : null,
        cooldown_seconds: Number(form.cooldown_seconds),
        is_active: form.is_active,
      };

      if (editingRule) {
        await updateAutomation(editingRule.id, payload);
        toast.success(t("success.updated"));
      } else if (selectedZoneId !== null) {
        await createAutomation(selectedZoneId, payload);
        toast.success(t("success.created"));
      }

      setModalOpen(false);
      if (selectedZoneId !== null) {
        fetchZoneData(selectedZoneId);
      }
    } catch {
      // Global interceptor shows toast.error automatically
    } finally {
      setSaving(false);
    }
  }

  /* ---- toggle active ---- */
  async function handleToggleActive(rule: AutomationRule) {
    try {
      await updateAutomation(rule.id, { is_active: !rule.is_active });
      setRules((prev) =>
        prev.map((r) => (r.id === rule.id ? { ...r, is_active: !r.is_active } : r)),
      );
      toast.success(t("success.updated"));
    } catch {
      // Silently fail
    }
  }

  /* ---- delete ---- */
  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteAutomation(deleteTarget.id);
      setRules((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      setDeleteTarget(null);
      toast.success(t("success.deleted"));
    } catch {
      // Silently fail
    } finally {
      setDeleting(false);
    }
  }

  /* ---- actuator name lookup ---- */
  const actuatorNameMap = new Map<number, string>();
  actuators.forEach((a) => actuatorNameMap.set(a.id, a.name));

  /* ---- render ---- */

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-80 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
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
            <Zap className="size-6 text-gh-primary" aria-hidden="true" />
            {tp("automations.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tp("automations.subtitle")}</p>
        </div>
        {selectedZoneId !== null && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="size-4" aria-hidden="true" />
            {tp("automations.addRule")}
          </button>
        )}
      </div>

      {/* Zone selector */}
      <GlowCard variant="none" glass className="flex items-center gap-3 px-4 py-3">
        <label className="text-sm font-medium text-foreground/80 shrink-0">{t("labels.zone")}:</label>
        <div className="relative flex-1 max-w-xs">
          <select
            value={selectedZoneId ?? ""}
            onChange={(e) => setSelectedZoneId(e.target.value ? Number(e.target.value) : null)}
            className="w-full appearance-none rounded-lg border border-input bg-background/60 px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{tp("automations.selectZone")}</option>
            {greenhouses.map((gh) => (
              <optgroup key={gh.id} label={gh.name}>
                {gh.zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </GlowCard>

      {/* No zone selected */}
      {selectedZoneId === null && (
        <EmptyState
          icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z"
          title={tp("automations.selectZone")}
          description=""
        />
      )}

      {/* Loading zone data */}
      {selectedZoneId !== null && loadingZone && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {[1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
        </div>
      )}

      {/* Rule cards */}
      {selectedZoneId !== null && !loadingZone && (
        <>
          {/* AutomationChips row — quick overview */}
          {rules.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {rules.map((rule) => (
                <AutomationChip
                  key={rule.id}
                  name={rule.name}
                  active={rule.is_active}
                  triggerCount={triggerCommands.filter((c) => c.automation_rule === rule.id).length}
                  onClick={() => openEditModal(rule)}
                />
              ))}
            </div>
          )}

          {rules.length === 0 ? (
            <EmptyState
              icon="M13 10V3L4 14h7v7l9-11h-7z"
              title={tp("automations.noRules")}
              description=""
              action={
                <button onClick={openCreateModal} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                  {tp("automations.addRule")}
                </button>
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {rules.map((rule) => {
                const actuatorName = actuatorNameMap.get(rule.action_actuator) ?? `#${rule.action_actuator}`;
                return (
                  <GlowCard
                    key={rule.id}
                    variant={rule.is_active ? "green" : "none"}
                    active={rule.is_active}
                    glass
                    className={cn("p-5", !rule.is_active && "opacity-60")}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="truncate font-semibold text-foreground">{rule.name}</h3>
                        {rule.description && (
                          <p className="mt-0.5 text-xs text-muted-foreground">{rule.description}</p>
                        )}
                      </div>
                      <span className={cn(
                        "ml-2 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        rule.is_active ? "bg-gh-primary/10 text-gh-primary" : "bg-muted text-muted-foreground"
                      )}>
                        {rule.is_active ? tp("automations.status.active") : tp("automations.status.inactive")}
                      </span>
                    </div>

                    {/* Rule condition */}
                    <div className="rounded-lg bg-black/10 dark:bg-white/5 p-3 text-xs font-mono space-y-0.5">
                      <div>
                        <span className="text-muted-foreground">IF </span>
                        <span className="text-gh-secondary">{SENSOR_TYPE_LABELS[rule.sensor_type] ?? rule.sensor_type}</span>
                        <span className="text-muted-foreground"> {tp(`automations.conditions.${rule.condition}`)} </span>
                        <span className="text-foreground font-bold">{rule.threshold_value}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">THEN </span>
                        <span className="text-gh-primary">{tp(`automations.commandTypes.${rule.action_command_type}`)}</span>
                        <span className="text-muted-foreground"> → </span>
                        <span className="text-foreground">{actuatorName}</span>
                        {rule.action_command_type === "SET" && rule.action_value !== null && (
                          <span className="text-muted-foreground"> = {rule.action_value}</span>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground/60">
                      <span>{rule.last_triggered ? `${tp("automations.status.lastTriggered")}: ${formatRelativeTime(rule.last_triggered)}` : tp("automations.status.neverTriggered")}</span>
                      <span>Cooldown: {rule.cooldown_seconds}s</span>
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(rule)}
                        className={cn("rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                          rule.is_active ? "bg-gh-warning/10 text-gh-warning hover:bg-gh-warning/20" : "bg-gh-primary/10 text-gh-primary hover:bg-gh-primary/20"
                        )}
                      >
                        {rule.is_active ? tp("automations.status.inactive") : tp("automations.status.active")}
                      </button>
                      <button onClick={() => openEditModal(rule)} className="rounded-lg bg-muted/60 px-3 py-1.5 text-xs font-medium text-foreground/80 hover:bg-accent transition-colors">
                        {t("actions.edit")}
                      </button>
                      <button onClick={() => setDeleteTarget(rule)} className="rounded-lg bg-gh-danger/10 px-3 py-1.5 text-xs font-medium text-gh-danger hover:bg-gh-danger/20 transition-colors">
                        {t("actions.delete")}
                      </button>
                    </div>
                  </GlowCard>
                );
              })}
            </div>
          )}

          {/* Trigger History */}
          <GlowCard variant="none" glass>
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">{tp("automations.triggerHistory")}</h2>
            </div>
            {triggerCommands.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground/60">{tp("automations.noTriggers")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t("labels.actuator")}</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Rule</th>
                      <th className="px-4 py-3">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {triggerCommands.slice(0, 20).map((cmd) => {
                      const actuatorName = actuatorNameMap.get(cmd.actuator) ?? `#${cmd.actuator}`;
                      const linkedRule = rules.find((r) => r.id === cmd.automation_rule);
                      return (
                        <tr key={cmd.id} className="hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{actuatorName}</td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cmd.command_type === "ON" ? "bg-gh-primary/10 text-gh-primary" : "bg-muted text-muted-foreground")}>
                              {cmd.command_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-foreground/80">
                              {COMMAND_STATUS_LABELS[cmd.status] ?? cmd.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{linkedRule?.name ?? `#${cmd.automation_rule}`}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(cmd.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </GlowCard>
        </>
      )}

      {/* Create / Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingRule ? tp("automations.editRule") : tp("automations.addRule")}
      >
        <div className="space-y-4">
          {/* Name */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">
              {tp("automations.ruleForm.name")}
            </label>
            <input
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder={tp("automations.ruleForm.namePlaceholder")}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {formErrors.name && <p className="mt-1 text-xs text-destructive">{formErrors.name}</p>}
          </div>

          {/* Description */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">
              {tp("automations.ruleForm.description")}
            </label>
            <input
              value={form.description}
              onChange={(e) => updateField("description", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Sensor Type + Condition + Threshold */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.sensorType")}
              </label>
              <select
                value={form.sensor_type}
                onChange={(e) => updateField("sensor_type", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">--</option>
                {SENSOR_TYPES.map((st) => (
                  <option key={st} value={st}>
                    {SENSOR_TYPE_LABELS[st] ?? st}
                  </option>
                ))}
              </select>
              {formErrors.sensor_type && <p className="mt-1 text-xs text-destructive">{formErrors.sensor_type}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.condition")}
              </label>
              <select
                value={form.condition}
                onChange={(e) => updateField("condition", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {tp(`automations.conditions.${c}`)}
                  </option>
                ))}
              </select>
              {formErrors.condition && <p className="mt-1 text-xs text-destructive">{formErrors.condition}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.thresholdValue")}
              </label>
              <input
                type="number"
                step="any"
                value={form.threshold_value}
                onChange={(e) => updateField("threshold_value", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {formErrors.threshold_value && <p className="mt-1 text-xs text-destructive">{formErrors.threshold_value}</p>}
            </div>
          </div>

          {/* Actuator + Command Type */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.actuator")}
              </label>
              <select
                value={form.action_actuator}
                onChange={(e) => updateField("action_actuator", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">--</option>
                {actuators.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({ACTUATOR_TYPE_LABELS[a.actuator_type] ?? a.actuator_type})
                  </option>
                ))}
              </select>
              {formErrors.action_actuator && <p className="mt-1 text-xs text-destructive">{formErrors.action_actuator}</p>}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.commandType")}
              </label>
              <select
                value={form.action_command_type}
                onChange={(e) => updateField("action_command_type", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COMMAND_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {tp(`automations.commandTypes.${ct}`)}
                  </option>
                ))}
              </select>
              {formErrors.action_command_type && <p className="mt-1 text-xs text-destructive">{formErrors.action_command_type}</p>}
            </div>
          </div>

          {/* Action value (only for SET) */}
          {form.action_command_type === "SET" && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground/80">
                {tp("automations.ruleForm.actionValue")}
              </label>
              <input
                type="number"
                step="any"
                value={form.action_value}
                onChange={(e) => updateField("action_value", e.target.value)}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-xs text-muted-foreground/60">{tp("automations.ruleForm.actionValueHint")}</p>
            </div>
          )}

          {/* Cooldown */}
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground/80">
              {tp("automations.ruleForm.cooldown")}
            </label>
            <input
              type="number"
              value={form.cooldown_seconds}
              onChange={(e) => updateField("cooldown_seconds", e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p className="mt-1 text-xs text-muted-foreground/60">{tp("automations.ruleForm.cooldownHint")}</p>
            {formErrors.cooldown_seconds && <p className="mt-1 text-xs text-destructive">{formErrors.cooldown_seconds}</p>}
          </div>

          {/* Active toggle */}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => updateField("is_active", e.target.checked)}
              className="h-4 w-4 rounded border-input text-primary focus:ring-ring"
            />
            {tp("automations.ruleForm.isActive")}
          </label>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              onClick={handleSubmit}
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {saving ? t("status.loading") : t("actions.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={tp("automations.deleteRule")}
        message={tp("automations.confirmDelete")}
        loading={deleting}
      />
    </div>
  );
}
