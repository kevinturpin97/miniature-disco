/**
 * Dashboard page — lists greenhouses with their zones and latest sensor data.
 * Supports full CRUD for greenhouses and zones via modals.
 */

import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import toast from "react-hot-toast";
import { z } from "zod";
import {
  listGreenhouses,
  createGreenhouse,
  updateGreenhouse,
  deleteGreenhouse,
} from "@/api/greenhouses";
import {
  listZones,
  createZone,
  updateZone,
  deleteZone,
} from "@/api/zones";
import { listSensors } from "@/api/sensors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS } from "@/utils/constants";
import type { Greenhouse, Zone, Sensor } from "@/types";

/* ---------- extended types ---------- */

interface ZoneWithSensors extends Zone {
  sensors: Sensor[];
}

interface GreenhouseWithZones extends Greenhouse {
  zones: ZoneWithSensors[];
}

/* ---------- Zod schemas ---------- */

const greenhouseSchema = z.object({
  name: z.string().min(1, "Name is required"),
  location: z.string().optional(),
  description: z.string().optional(),
});

type GreenhouseFormData = z.infer<typeof greenhouseSchema>;

const zoneSchema = z.object({
  name: z.string().min(1, "Name is required"),
  relay_id: z.coerce.number().int().min(1).max(255),
  description: z.string().optional(),
  transmission_interval: z.coerce.number().int().min(1).default(300),
});

type ZoneFormData = z.infer<typeof zoneSchema>;

/* ---------- initial form values ---------- */

const EMPTY_GH_FORM: GreenhouseFormData = { name: "", location: "", description: "" };
const EMPTY_ZONE_FORM: ZoneFormData = { name: "", relay_id: 1, description: "", transmission_interval: 300 };

/* ====================================================================== */
/*  Dashboard                                                              */
/* ====================================================================== */

export default function Dashboard() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  /* ---- data state ---- */
  const [data, setData] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);

  /* ---- greenhouse modal state ---- */
  const [ghModalOpen, setGhModalOpen] = useState(false);
  const [ghEditing, setGhEditing] = useState<Greenhouse | null>(null);
  const [ghForm, setGhForm] = useState<GreenhouseFormData>(EMPTY_GH_FORM);
  const [ghErrors, setGhErrors] = useState<Record<string, string>>({});
  const [ghSaving, setGhSaving] = useState(false);

  /* ---- zone modal state ---- */
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [zoneEditing, setZoneEditing] = useState<Zone | null>(null);
  const [zoneParentGhId, setZoneParentGhId] = useState<number | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneFormData>(EMPTY_ZONE_FORM);
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({});
  const [zoneSaving, setZoneSaving] = useState(false);

  /* ---- delete confirm state ---- */
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "greenhouse"; id: number }
    | { kind: "zone"; id: number }
    | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- fetch all dashboard data ---- */
  const fetchData = useCallback(async () => {
    try {
      const ghResponse = await listGreenhouses();
      const greenhouses = ghResponse.results;

      const withZones: GreenhouseWithZones[] = await Promise.all(
        greenhouses.map(async (gh) => {
          const zoneResponse = await listZones(gh.id);
          const zonesWithSensors: ZoneWithSensors[] = await Promise.all(
            zoneResponse.results.map(async (zone) => {
              const sensorResponse = await listSensors(zone.id);
              return { ...zone, sensors: sensorResponse.results };
            }),
          );
          return { ...gh, zones: zonesWithSensors };
        }),
      );

      setData(withZones);
    } catch {
      // handled by global interceptor
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ============================================================ */
  /*  Greenhouse CRUD handlers                                     */
  /* ============================================================ */

  function openCreateGreenhouse() {
    setGhEditing(null);
    setGhForm(EMPTY_GH_FORM);
    setGhErrors({});
    setGhModalOpen(true);
  }

  function openEditGreenhouse(gh: Greenhouse) {
    setGhEditing(gh);
    setGhForm({ name: gh.name, location: gh.location, description: gh.description });
    setGhErrors({});
    setGhModalOpen(true);
  }

  function closeGhModal() {
    setGhModalOpen(false);
    setGhEditing(null);
  }

  async function handleGhSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = greenhouseSchema.safeParse(ghForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setGhErrors(fieldErrors);
      return;
    }

    setGhSaving(true);
    try {
      const isEditing = !!ghEditing;
      if (ghEditing) {
        await updateGreenhouse(ghEditing.id, result.data);
      } else {
        await createGreenhouse(result.data as { name: string; location: string; description: string });
      }
      closeGhModal();
      await fetchData();
      toast.success(t(isEditing ? "success.updated" : "success.created"));
    } catch {
      // handled by global interceptor
    } finally {
      setGhSaving(false);
    }
  }

  /* ============================================================ */
  /*  Zone CRUD handlers                                           */
  /* ============================================================ */

  function openCreateZone(greenhouseId: number) {
    setZoneEditing(null);
    setZoneParentGhId(greenhouseId);
    setZoneForm(EMPTY_ZONE_FORM);
    setZoneErrors({});
    setZoneModalOpen(true);
  }

  function openEditZone(zone: Zone) {
    setZoneEditing(zone);
    setZoneParentGhId(zone.greenhouse);
    setZoneForm({
      name: zone.name,
      relay_id: zone.relay_id,
      description: zone.description,
      transmission_interval: zone.transmission_interval,
    });
    setZoneErrors({});
    setZoneModalOpen(true);
  }

  function closeZoneModal() {
    setZoneModalOpen(false);
    setZoneEditing(null);
  }

  async function handleZoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = zoneSchema.safeParse(zoneForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) fieldErrors[err.path[0] as string] = err.message;
      });
      setZoneErrors(fieldErrors);
      return;
    }

    setZoneSaving(true);
    try {
      const isEditing = !!zoneEditing;
      if (zoneEditing) {
        await updateZone(zoneEditing.id, {
          name: result.data.name,
          description: result.data.description ?? "",
          transmission_interval: result.data.transmission_interval,
        });
      } else if (zoneParentGhId !== null) {
        await createZone(zoneParentGhId, {
          name: result.data.name,
          relay_id: result.data.relay_id,
          description: result.data.description ?? "",
          transmission_interval: result.data.transmission_interval,
        });
      }
      closeZoneModal();
      await fetchData();
      toast.success(t(isEditing ? "success.updated" : "success.created"));
    } catch {
      // handled by global interceptor
    } finally {
      setZoneSaving(false);
    }
  }

  /* ============================================================ */
  /*  Delete handler                                               */
  /* ============================================================ */

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "greenhouse") {
        await deleteGreenhouse(deleteTarget.id);
      } else {
        await deleteZone(deleteTarget.id);
      }
      setDeleteTarget(null);
      await fetchData();
      toast.success(t("success.deleted"));
    } catch {
      // keep dialog open so user sees the failure context
    } finally {
      setDeleting(false);
    }
  }

  /* ============================================================ */
  /*  Render helpers                                               */
  /* ============================================================ */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ---------- header ---------- */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {tp("dashboard.title")}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tp("dashboard.subtitle")}
          </p>
        </div>
        <button
          onClick={openCreateGreenhouse}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <PlusIcon />
          {tp("dashboard.addGreenhouse")}
        </button>
      </div>

      {/* ---------- empty state ---------- */}
      {data.length === 0 && (
        <EmptyState
          icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
          title={tp("dashboard.noGreenhouses")}
          description={tp("dashboard.noGreenhousesHint")}
          action={
            <button
              onClick={openCreateGreenhouse}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              {tp("dashboard.addGreenhouse")}
            </button>
          }
        />
      )}

      {/* ---------- greenhouse sections ---------- */}
      {data.map((gh) => (
        <section key={gh.id}>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">{gh.name}</h2>
                {gh.location && (
                  <p className="text-sm text-muted-foreground">{gh.location}</p>
                )}
              </div>
              {/* greenhouse edit / delete buttons */}
              <div className="flex items-center gap-1">
                <button
                  onClick={() => openEditGreenhouse(gh)}
                  className="rounded-md p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground/70 transition-colors"
                  aria-label={t("actions.edit")}
                >
                  <PencilIcon />
                </button>
                <button
                  onClick={() => setDeleteTarget({ kind: "greenhouse", id: gh.id })}
                  className="rounded-md p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
                  aria-label={t("actions.delete")}
                >
                  <TrashIcon />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                {gh.zones.length} zone{gh.zones.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={() => openCreateZone(gh.id)}
                className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors"
              >
                <PlusIcon className="h-3.5 w-3.5" />
                {tp("dashboard.addZone")}
              </button>
            </div>
          </div>

          {gh.zones.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground/60">
              {tp("dashboard.noZones")}
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gh.zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  onEdit={() => openEditZone(zone)}
                  onDelete={() => setDeleteTarget({ kind: "zone", id: zone.id })}
                />
              ))}
            </div>
          )}
        </section>
      ))}

      {/* ================== Greenhouse Modal ================== */}
      <Modal
        open={ghModalOpen}
        onClose={closeGhModal}
        title={ghEditing ? tp("dashboard.editGreenhouse") : tp("dashboard.addGreenhouse")}
      >
        <form onSubmit={handleGhSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.name")} *
            </label>
            <input
              type="text"
              value={ghForm.name}
              onChange={(e) => setGhForm({ ...ghForm, name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {ghErrors.name && (
              <p className="mt-1 text-xs text-destructive">{ghErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.location")}
            </label>
            <input
              type="text"
              value={ghForm.location ?? ""}
              onChange={(e) => setGhForm({ ...ghForm, location: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.description")}
            </label>
            <textarea
              rows={3}
              value={ghForm.description ?? ""}
              onChange={(e) => setGhForm({ ...ghForm, description: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeGhModal}
              disabled={ghSaving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={ghSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {ghSaving ? "..." : t("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================== Zone Modal ================== */}
      <Modal
        open={zoneModalOpen}
        onClose={closeZoneModal}
        title={zoneEditing ? tp("dashboard.editZone") : tp("dashboard.addZone")}
      >
        <form onSubmit={handleZoneSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.name")} *
            </label>
            <input
              type="text"
              value={zoneForm.name}
              onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {zoneErrors.name && (
              <p className="mt-1 text-xs text-destructive">{zoneErrors.name}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.relayId")} *
            </label>
            <input
              type="number"
              min={1}
              max={255}
              value={zoneForm.relay_id}
              onChange={(e) => setZoneForm({ ...zoneForm, relay_id: Number(e.target.value) })}
              disabled={!!zoneEditing}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-secondary disabled:text-muted-foreground"
            />
            {zoneErrors.relay_id && (
              <p className="mt-1 text-xs text-destructive">{zoneErrors.relay_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.description")}
            </label>
            <textarea
              rows={3}
              value={zoneForm.description ?? ""}
              onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.transmissionInterval")}
            </label>
            <input
              type="number"
              min={1}
              value={zoneForm.transmission_interval}
              onChange={(e) => setZoneForm({ ...zoneForm, transmission_interval: Number(e.target.value) })}
              className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {zoneErrors.transmission_interval && (
              <p className="mt-1 text-xs text-destructive">{zoneErrors.transmission_interval}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={closeZoneModal}
              disabled={zoneSaving}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={zoneSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {zoneSaving ? "..." : t("actions.save")}
            </button>
          </div>
        </form>
      </Modal>

      {/* ================== Delete Confirm Dialog ================== */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t("confirm.deleteTitle")}
        message={
          deleteTarget?.kind === "greenhouse"
            ? t("confirm.deleteGreenhouse")
            : t("confirm.deleteZone")
        }
        loading={deleting}
      />
    </div>
  );
}

/* ====================================================================== */
/*  ZoneCard                                                               */
/* ====================================================================== */

interface ZoneCardProps {
  zone: ZoneWithSensors;
  onEdit: () => void;
  onDelete: () => void;
}

function ZoneCard({ zone, onEdit, onDelete }: ZoneCardProps) {
  const { t: tp } = useTranslation("pages");
  const { t } = useTranslation();

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
    >
    <Link
      to={`/zones/${zone.id}`}
      className="block rounded-xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-foreground">{zone.name}</h3>
          {/* edit / delete buttons */}
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
            className="rounded-md p-1 text-muted-foreground/60 hover:bg-accent hover:text-foreground/70 transition-colors"
            aria-label={t("actions.edit")}
          >
            <PencilIcon className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
            className="rounded-md p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive transition-colors"
            aria-label={t("actions.delete")}
          >
            <TrashIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <StatusBadge online={zone.is_online} />
      </div>

      <p className="mt-1 text-xs text-muted-foreground/60">
        {tp("dashboard.relay", { id: zone.relay_id })}
      </p>

      {zone.sensors.length > 0 ? (
        <div className="mt-4 space-y-2">
          {zone.sensors.map((sensor) => (
            <SensorRow key={sensor.id} sensor={sensor} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground/60">{tp("dashboard.noSensors")}</p>
      )}
    </Link>
    </motion.div>
  );
}

/* ====================================================================== */
/*  SensorRow                                                              */
/* ====================================================================== */

function SensorRow({ sensor }: { sensor: Sensor }) {
  const label =
    SENSOR_TYPE_LABELS[sensor.sensor_type as keyof typeof SENSOR_TYPE_LABELS] ??
    sensor.sensor_type;
  const unit =
    SENSOR_TYPE_UNITS[sensor.sensor_type as keyof typeof SENSOR_TYPE_UNITS] ??
    sensor.unit;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">-- {unit}</span>
    </div>
  );
}

/* ====================================================================== */
/*  Inline SVG Icons                                                       */
/* ====================================================================== */

function PlusIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
  );
}

function PencilIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zM16.862 4.487L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
      />
    </svg>
  );
}

function TrashIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
      />
    </svg>
  );
}
