/**
 * Dashboard — Sprint 30 signature layout.
 *
 * 4 blocks:
 *  1. Global Overview  — live gauge MetricTiles (greenhouses, zones, online count, alerts)
 *  2. Zones Grid       — zone cards with GlowCard + ZoneStatusBadge + real-time status
 *  3. Live Feed        — latest readings feed (right sidebar)
 *  4. Recent Alerts    — unacknowledged alerts (right sidebar below feed)
 *
 * All CRUD operations (greenhouse / zone) are preserved unchanged.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import toast from "react-hot-toast";
import { z } from "zod";
import {
  Plus,
  Pencil,
  Trash2,
  Thermometer,
  Droplets,
  Wifi,
  WifiOff,
  BellRing,
  RefreshCw,
} from "lucide-react";

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
import { listAlerts, acknowledgeAlert } from "@/api/alerts";
import { GlowCard } from "@/components/ui/GlowCard";
import { MetricTile } from "@/components/ui/MetricTile";
import { LiveIndicator } from "@/components/ui/LiveIndicator";
import { ZoneStatusBadge } from "@/components/ui/ZoneStatusBadge";
import { CropIntelligenceCard } from "@/components/ui/CropIntelligenceCard";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS } from "@/utils/constants";
import { cn } from "@/utils/cn";
import type { Alert, Greenhouse, Zone, Sensor } from "@/types";

/* ------------------------------------------------------------------ */
/*  Extended types                                                       */
/* ------------------------------------------------------------------ */

interface ZoneWithSensors extends Zone {
  sensors: Sensor[];
}

interface GreenhouseWithZones extends Greenhouse {
  zones: ZoneWithSensors[];
}

interface LiveFeedItem {
  id: string;
  zone: string;
  sensor: string;
  value: number;
  unit: string;
  ts: Date;
}

/* ------------------------------------------------------------------ */
/*  Zod schemas                                                          */
/* ------------------------------------------------------------------ */

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

const EMPTY_GH_FORM: GreenhouseFormData = { name: "", location: "", description: "" };
const EMPTY_ZONE_FORM: ZoneFormData = { name: "", relay_id: 1, description: "", transmission_interval: 300 };

/* ================================================================== */
/*  Dashboard                                                           */
/* ================================================================== */

export default function Dashboard() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  /* ---- data ---- */
  const [data, setData] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentAlerts, setRecentAlerts] = useState<Alert[]>([]);
  const [ackingId, setAckingId] = useState<number | null>(null);
  const [liveFeed, setLiveFeed] = useState<LiveFeedItem[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _feedRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---- greenhouse modal ---- */
  const [ghModalOpen, setGhModalOpen] = useState(false);
  const [ghEditing, setGhEditing] = useState<Greenhouse | null>(null);
  const [ghForm, setGhForm] = useState<GreenhouseFormData>(EMPTY_GH_FORM);
  const [ghErrors, setGhErrors] = useState<Record<string, string>>({});
  const [ghSaving, setGhSaving] = useState(false);

  /* ---- zone modal ---- */
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [zoneEditing, setZoneEditing] = useState<Zone | null>(null);
  const [zoneParentGhId, setZoneParentGhId] = useState<number | null>(null);
  const [zoneForm, setZoneForm] = useState<ZoneFormData>(EMPTY_ZONE_FORM);
  const [zoneErrors, setZoneErrors] = useState<Record<string, string>>({});
  const [zoneSaving, setZoneSaving] = useState(false);

  /* ---- delete confirm ---- */
  const [deleteTarget, setDeleteTarget] = useState<
    { kind: "greenhouse"; id: number } | { kind: "zone"; id: number } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  /* ---- fetch ---- */
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

  const fetchAlerts = useCallback(async () => {
    try {
      const res = await listAlerts({ is_acknowledged: false, ordering: "-created_at", page: 1 });
      setRecentAlerts(res.results.slice(0, 6));
    } catch {
      // non-blocking
    }
  }, []);

  useEffect(() => {
    fetchData();
    fetchAlerts();
  }, [fetchData, fetchAlerts]);

  /* ---- global metrics ---- */
  const metrics = useMemo(() => {
    const allZones = data.flatMap((gh) => gh.zones);
    return {
      totalGreenhouses: data.length,
      totalZones: allZones.length,
      onlineZones: allZones.filter((z) => z.is_online).length,
    };
  }, [data]);

  /* ---- Greenhouse CRUD ---- */

  function openCreateGreenhouse() {
    setGhEditing(null); setGhForm(EMPTY_GH_FORM); setGhErrors({}); setGhModalOpen(true);
  }
  function openEditGreenhouse(gh: Greenhouse) {
    setGhEditing(gh);
    setGhForm({ name: gh.name, location: gh.location, description: gh.description });
    setGhErrors({}); setGhModalOpen(true);
  }
  function closeGhModal() { setGhModalOpen(false); setGhEditing(null); }

  async function handleGhSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = greenhouseSchema.safeParse(ghForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
      setGhErrors(fieldErrors); return;
    }
    setGhSaving(true);
    try {
      const isEditing = !!ghEditing;
      if (ghEditing) { await updateGreenhouse(ghEditing.id, result.data); }
      else { await createGreenhouse(result.data as { name: string; location: string; description: string }); }
      closeGhModal(); await fetchData();
      toast.success(t(isEditing ? "success.updated" : "success.created"));
    } catch { /* handled */ } finally { setGhSaving(false); }
  }

  /* ---- Zone CRUD ---- */

  function openCreateZone(greenhouseId: number) {
    setZoneEditing(null); setZoneParentGhId(greenhouseId); setZoneForm(EMPTY_ZONE_FORM); setZoneErrors({}); setZoneModalOpen(true);
  }
  function openEditZone(zone: Zone) {
    setZoneEditing(zone); setZoneParentGhId(zone.greenhouse);
    setZoneForm({ name: zone.name, relay_id: zone.relay_id, description: zone.description, transmission_interval: zone.transmission_interval });
    setZoneErrors({}); setZoneModalOpen(true);
  }
  function closeZoneModal() { setZoneModalOpen(false); setZoneEditing(null); }

  async function handleZoneSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = zoneSchema.safeParse(zoneForm);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      result.error.errors.forEach((err) => { if (err.path[0]) fieldErrors[err.path[0] as string] = err.message; });
      setZoneErrors(fieldErrors); return;
    }
    setZoneSaving(true);
    try {
      const isEditing = !!zoneEditing;
      if (zoneEditing) {
        await updateZone(zoneEditing.id, { name: result.data.name, description: result.data.description ?? "", transmission_interval: result.data.transmission_interval });
      } else if (zoneParentGhId !== null) {
        await createZone(zoneParentGhId, { name: result.data.name, relay_id: result.data.relay_id, description: result.data.description ?? "", transmission_interval: result.data.transmission_interval });
      }
      closeZoneModal(); await fetchData();
      toast.success(t(isEditing ? "success.updated" : "success.created"));
    } catch { /* handled */ } finally { setZoneSaving(false); }
  }

  /* ---- Delete ---- */

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      if (deleteTarget.kind === "greenhouse") { await deleteGreenhouse(deleteTarget.id); }
      else { await deleteZone(deleteTarget.id); }
      setDeleteTarget(null); await fetchData();
      toast.success(t("success.deleted"));
    } catch { /* keep dialog open */ } finally { setDeleting(false); }
  }

  /* ---- Alert acknowledge ---- */

  async function handleAck(id: number) {
    setAckingId(id);
    try {
      await acknowledgeAlert(id);
      setRecentAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch { /* non-blocking */ } finally { setAckingId(null); }
  }

  /* ---- Loading skeleton ---- */

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          <div className="lg:col-span-3 space-y-4">
            {[1, 2].map((i) => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
          <div className="space-y-4">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 relative gradient-blur-primary gradient-blur-secondary">

      {/* ========== HEADER ========== */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tp("dashboard.title")}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tp("dashboard.subtitle")}</p>
        </div>
        <motion.button
          onClick={openCreateGreenhouse}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <Plus className="size-4" aria-hidden="true" />
          {tp("dashboard.addGreenhouse")}
        </motion.button>
      </div>

      {/* ========== BLOCK 1 — GLOBAL OVERVIEW ========== */}
      <section aria-label="Global overview metrics">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <GlowCard variant="green" glass className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#00ff9c]/10">
                <Thermometer className="size-4 text-[#00ff9c]" aria-hidden="true" />
              </div>
              <MetricTile label="Greenhouses" value={metrics.totalGreenhouses} color="green" />
            </div>
          </GlowCard>

          <GlowCard variant="cyan" glass className="p-5">
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#00d9ff]/10">
                <Droplets className="size-4 text-[#00d9ff]" aria-hidden="true" />
              </div>
              <MetricTile label="Zones" value={metrics.totalZones} color="cyan" />
            </div>
          </GlowCard>

          <GlowCard
            variant={metrics.onlineZones === metrics.totalZones && metrics.totalZones > 0 ? "green" : "warning"}
            glass
            className="p-5"
            active={metrics.onlineZones > 0}
          >
            <div className="flex items-start gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#00ff9c]/10">
                {metrics.onlineZones > 0
                  ? <Wifi className="size-4 text-[#00ff9c]" aria-hidden="true" />
                  : <WifiOff className="size-4 text-[#ffb300]" aria-hidden="true" />
                }
              </div>
              <MetricTile
                label="Online"
                value={`${metrics.onlineZones}/${metrics.totalZones}`}
                color={metrics.onlineZones === metrics.totalZones && metrics.totalZones > 0 ? "green" : "warning"}
              />
            </div>
          </GlowCard>

          <GlowCard variant={recentAlerts.length > 0 ? "danger" : "none"} glass className="p-5">
            <div className="flex items-start gap-3">
              <div className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", recentAlerts.length > 0 ? "bg-[#ff4d4f]/10" : "bg-muted")}>
                <BellRing className={cn("size-4", recentAlerts.length > 0 ? "text-[#ff4d4f]" : "text-muted-foreground")} aria-hidden="true" />
              </div>
              <MetricTile label="Active Alerts" value={recentAlerts.length} color={recentAlerts.length > 0 ? "danger" : "neutral"} />
            </div>
          </GlowCard>
        </div>
      </section>

      {/* ========== MAIN LAYOUT ========== */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">

        {/* ===== BLOCK 2 — ZONES ===== */}
        <section className="lg:col-span-3 space-y-8" aria-label="Greenhouses and zones">
          {data.length === 0 ? (
            <EmptyState
              icon="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
              title={tp("dashboard.noGreenhouses")}
              description={tp("dashboard.noGreenhousesHint")}
              action={
                <button onClick={openCreateGreenhouse} className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors">
                  {tp("dashboard.addGreenhouse")}
                </button>
              }
            />
          ) : (
            data.map((gh) => (
              <div key={gh.id}>
                {/* Greenhouse header */}
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-foreground">{gh.name}</h2>
                    {gh.location && <span className="text-xs text-muted-foreground">· {gh.location}</span>}
                    <button onClick={() => openEditGreenhouse(gh)} className="rounded-md p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground/70 transition-colors" aria-label={t("actions.edit")}>
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    <button onClick={() => setDeleteTarget({ kind: "greenhouse", id: gh.id })} className="rounded-md p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors" aria-label={t("actions.delete")}>
                      <Trash2 className="size-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-primary/10 px-3 py-0.5 text-xs font-medium text-primary">
                      {gh.zones.length} zone{gh.zones.length !== 1 ? "s" : ""}
                    </span>
                    <button onClick={() => openCreateZone(gh.id)} className="inline-flex items-center gap-1 rounded-lg border border-primary/30 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/10 transition-colors">
                      <Plus className="size-3.5" aria-hidden="true" />
                      {tp("dashboard.addZone")}
                    </button>
                  </div>
                </div>

                {/* Zone cards */}
                {gh.zones.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground/60">
                    {tp("dashboard.noZones")}
                  </p>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    <AnimatePresence>
                      {gh.zones.map((zone, idx) => (
                        <motion.div
                          key={zone.id}
                          initial={{ opacity: 0, y: 16 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05, duration: 0.3 }}
                        >
                          <ZoneCard
                            zone={zone}
                            onEdit={() => openEditZone(zone)}
                            onDelete={() => setDeleteTarget({ kind: "zone", id: zone.id })}
                            onLiveReading={(item) => setLiveFeed((prev) => [item, ...prev].slice(0, 50))}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            ))
          )}
        </section>

        {/* ===== SIDEBAR ===== */}
        <aside className="space-y-4" aria-label="Live feed and recent alerts">

          {/* BLOCK 3 — LIVE FEED */}
          <GlowCard variant="cyan" glass className="flex flex-col overflow-hidden" style={{ maxHeight: "20rem" }}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                <LiveIndicator state="live" size="sm" label="Live data active" />
                Live Feed
              </h3>
              <RefreshCw className="size-3.5 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/50" role="log" aria-live="polite" aria-label="Live sensor readings">
              {liveFeed.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">Awaiting live readings…</div>
              ) : (
                liveFeed.map((item) => (
                  <motion.div key={item.id} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} className="flex items-center justify-between px-4 py-2.5 text-xs">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground truncate">{item.zone}</p>
                      <p className="text-muted-foreground truncate">{item.sensor}</p>
                    </div>
                    <span className="ml-2 shrink-0 font-semibold text-[#00d9ff] tabular-nums">
                      {item.value.toFixed(1)} {item.unit}
                    </span>
                  </motion.div>
                ))
              )}
            </div>
          </GlowCard>

          {/* BLOCK 4 — RECENT ALERTS */}
          <GlowCard variant={recentAlerts.length > 0 ? "danger" : "none"} glass className="flex flex-col overflow-hidden" style={{ maxHeight: "18rem" }}>
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <h3 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <BellRing className="size-3.5 text-[#ff4d4f]" aria-hidden="true" />
                Recent Alerts
                {recentAlerts.length > 0 && (
                  <span className="rounded-full bg-[#ff4d4f]/20 px-1.5 text-[10px] font-bold text-[#ff4d4f]">{recentAlerts.length}</span>
                )}
              </h3>
              <Link to="/alerts" className="text-xs text-primary hover:underline">See all</Link>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-border/50" aria-label="Recent unacknowledged alerts">
              {recentAlerts.length === 0 ? (
                <div className="px-4 py-6 text-center text-xs text-muted-foreground">No active alerts 🎉</div>
              ) : (
                recentAlerts.map((alert) => (
                  <AlertRow key={alert.id} alert={alert} onAck={() => handleAck(alert.id)} acking={ackingId === alert.id} />
                ))
              )}
            </div>
          </GlowCard>
        </aside>
      </div>

      {/* ========== MODALS ========== */}

      {/* Greenhouse */}
      <Modal open={ghModalOpen} onClose={closeGhModal} title={ghEditing ? tp("dashboard.editGreenhouse") : tp("dashboard.addGreenhouse")}>
        <form onSubmit={handleGhSubmit} className="space-y-4">
          <ModalField label={`${t("labels.name")} *`} error={ghErrors.name}>
            <input type="text" value={ghForm.name} onChange={(e) => setGhForm({ ...ghForm, name: e.target.value })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalField label={t("labels.location")}>
            <input type="text" value={ghForm.location ?? ""} onChange={(e) => setGhForm({ ...ghForm, location: e.target.value })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalField label={t("labels.description")}>
            <textarea rows={3} value={ghForm.description ?? ""} onChange={(e) => setGhForm({ ...ghForm, description: e.target.value })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalActions onCancel={closeGhModal} saving={ghSaving} cancelLabel={t("actions.cancel")} saveLabel={t("actions.save")} />
        </form>
      </Modal>

      {/* Zone */}
      <Modal open={zoneModalOpen} onClose={closeZoneModal} title={zoneEditing ? tp("dashboard.editZone") : tp("dashboard.addZone")}>
        <form onSubmit={handleZoneSubmit} className="space-y-4">
          <ModalField label={`${t("labels.name")} *`} error={zoneErrors.name}>
            <input type="text" value={zoneForm.name} onChange={(e) => setZoneForm({ ...zoneForm, name: e.target.value })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalField label={`${t("labels.relayId")} *`} error={zoneErrors.relay_id}>
            <input type="number" min={1} max={255} value={zoneForm.relay_id} onChange={(e) => setZoneForm({ ...zoneForm, relay_id: Number(e.target.value) })} disabled={!!zoneEditing} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:bg-secondary disabled:text-muted-foreground" />
          </ModalField>
          <ModalField label={t("labels.description")}>
            <textarea rows={3} value={zoneForm.description ?? ""} onChange={(e) => setZoneForm({ ...zoneForm, description: e.target.value })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalField label={t("labels.transmissionInterval")} error={zoneErrors.transmission_interval}>
            <input type="number" min={1} value={zoneForm.transmission_interval} onChange={(e) => setZoneForm({ ...zoneForm, transmission_interval: Number(e.target.value) })} className="mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground shadow-sm focus:outline-none focus:ring-2 focus:ring-ring" />
          </ModalField>
          <ModalActions onCancel={closeZoneModal} saving={zoneSaving} cancelLabel={t("actions.cancel")} saveLabel={t("actions.save")} />
        </form>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title={t("confirm.deleteTitle")}
        message={deleteTarget?.kind === "greenhouse" ? t("confirm.deleteGreenhouse") : t("confirm.deleteZone")}
        loading={deleting}
      />
    </div>
  );
}

/* ================================================================== */
/*  ZoneCard                                                            */
/* ================================================================== */

interface ZoneCardProps {
  zone: ZoneWithSensors;
  onEdit: () => void;
  onDelete: () => void;
  onLiveReading?: (item: LiveFeedItem) => void;
}

function ZoneCard({ zone, onEdit, onDelete }: ZoneCardProps) {
  const { t: tp } = useTranslation("pages");
  const { t } = useTranslation();

  return (
    <GlowCard
      variant={zone.is_online ? "green" : "none"}
      active={zone.is_online && zone.sensors.length > 0}
      className="p-0 overflow-hidden"
    >
      <Link to={`/zones/${zone.id}`} className="block p-4" aria-label={`${zone.name} zone detail`}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <h3 className="font-semibold text-foreground truncate">{zone.name}</h3>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onEdit(); }}
              className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:bg-accent hover:text-foreground/70 transition-colors"
              aria-label={t("actions.edit")}
            >
              <Pencil className="size-3" aria-hidden="true" />
            </button>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDelete(); }}
              className="shrink-0 rounded-md p-1 text-muted-foreground/50 hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label={t("actions.delete")}
            >
              <Trash2 className="size-3" aria-hidden="true" />
            </button>
          </div>
          <ZoneStatusBadge state={zone.is_online ? "online" : "offline"} />
        </div>

        <p className="text-xs text-muted-foreground/60 mb-3">
          {tp("dashboard.relay", { id: zone.relay_id })}
        </p>

        {zone.sensors.length > 0 ? (
          <div className="space-y-1.5">
            {zone.sensors.map((sensor) => <SensorRow key={sensor.id} sensor={sensor} />)}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground/60">{tp("dashboard.noSensors")}</p>
        )}
      </Link>
      <CropIntelligenceCard
        zoneId={zone.id}
        className="rounded-none border-t border-base-300/20"
      />
    </GlowCard>
  );
}

/* ================================================================== */
/*  SensorRow                                                           */
/* ================================================================== */

function SensorRow({ sensor }: { sensor: Sensor }) {
  const label = SENSOR_TYPE_LABELS[sensor.sensor_type as keyof typeof SENSOR_TYPE_LABELS] ?? sensor.sensor_type;
  const unit = SENSOR_TYPE_UNITS[sensor.sensor_type as keyof typeof SENSOR_TYPE_UNITS] ?? sensor.unit;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">— {unit}</span>
    </div>
  );
}

/* ================================================================== */
/*  AlertRow                                                            */
/* ================================================================== */

function AlertRow({ alert, onAck, acking }: { alert: Alert; onAck: () => void; acking: boolean }) {
  const [acked, setAcked] = useState(false);
  const severityColor =
    alert.severity === "CRITICAL" ? "text-[#ff4d4f]" :
    alert.severity === "WARNING" ? "text-[#ffb300]" :
    "text-muted-foreground";

  function handleAck(e: React.MouseEvent) {
    e.preventDefault();
    setAcked(true);
    setTimeout(() => onAck(), 400);
  }

  return (
    <AnimatePresence>
      {!acked && (
        <motion.div exit={{ opacity: 0, height: 0, overflow: "hidden" }} transition={{ duration: 0.3 }} className="flex items-start gap-2 px-4 py-2.5 text-xs">
          <div className="flex-1 min-w-0">
            <p className={cn("font-medium truncate", severityColor)}>{alert.severity}</p>
            <p className="text-muted-foreground truncate">{alert.message}</p>
          </div>
          <button onClick={handleAck} disabled={acking} aria-label="Acknowledge alert" className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors disabled:opacity-50">
            {acking ? "…" : "Ack"}
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ================================================================== */
/*  Modal helpers                                                       */
/* ================================================================== */

function ModalField({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-foreground/80">{label}</label>
      {children}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ModalActions({ onCancel, saving, cancelLabel, saveLabel }: { onCancel: () => void; saving: boolean; cancelLabel: string; saveLabel: string }) {
  return (
    <div className="flex justify-end gap-3 pt-2">
      <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent disabled:opacity-50 transition-colors">{cancelLabel}</button>
      <button type="submit" disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors">{saving ? "…" : saveLabel}</button>
    </div>
  );
}
