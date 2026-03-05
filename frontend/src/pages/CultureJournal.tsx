/**
 * Culture Journal page — timeline view of all interventions on a zone
 * with crop cycle management, manual notes, traceability PDF export,
 * and GlobalG.A.P. export.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { listZones } from "@/api/zones";
import {
  createCropCycle,
  createNote,
  exportGlobalGAP,
  generateTraceabilityPDF,
  listCropCycles,
  listCultureJournal,
} from "@/api/compliance";
import { listGreenhouses } from "@/api/greenhouses";
import { Spinner } from "@/components/ui/Spinner";
import { Modal } from "@/components/ui/Modal";
import { formatDate, formatRelativeTime } from "@/utils/formatters";
import type {
  CropCycle,
  CultureLogEntry,
  CultureLogEntryType,
  Greenhouse,
  Zone,
} from "@/types";

const ENTRY_TYPE_STYLES: Record<CultureLogEntryType, { border: string; bg: string }> = {
  COMMAND: { border: "border-primary/20", bg: "bg-primary/5" },
  ALERT: { border: "border-destructive/20", bg: "bg-destructive/5" },
  NOTE: { border: "border-sky-500/20", bg: "bg-sky-500/5" },
  THRESHOLD: { border: "border-amber-500/20", bg: "bg-amber-500/5" },
  CROP: { border: "border-emerald-500/20", bg: "bg-emerald-500/5" },
  AUTOMATION: { border: "border-violet-500/20", bg: "bg-violet-500/5" },
};

const ENTRY_TYPE_DOT: Record<CultureLogEntryType, string> = {
  COMMAND: "bg-primary",
  ALERT: "bg-destructive",
  NOTE: "bg-sky-500",
  THRESHOLD: "bg-amber-500",
  CROP: "bg-emerald-500",
  AUTOMATION: "bg-violet-500",
};

export default function CultureJournal() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  // Data
  const [greenhouses, setGreenhouses] = useState<Greenhouse[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [entries, setEntries] = useState<CultureLogEntry[]>([]);
  const [cropCycles, setCropCycles] = useState<CropCycle[]>([]);

  // Selection
  const [selectedGreenhouseId, setSelectedGreenhouseId] = useState<number | "">("");
  const [selectedZoneId, setSelectedZoneId] = useState<number | "">("");
  const [selectedEntryType, setSelectedEntryType] = useState<CultureLogEntryType | "">("");

  // UI State
  const [loading, setLoading] = useState(false);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showCropCycleModal, setShowCropCycleModal] = useState(false);
  const [showPDFModal, setShowPDFModal] = useState(false);

  // Note form
  const [noteContent, setNoteContent] = useState("");
  const [noteObservedAt, setNoteObservedAt] = useState(
    new Date().toISOString().slice(0, 16),
  );

  // Crop cycle form
  const [ccSpecies, setCcSpecies] = useState("");
  const [ccVariety, setCcVariety] = useState("");
  const [ccSowingDate, setCcSowingDate] = useState("");

  // PDF form
  const [pdfStart, setPdfStart] = useState("");
  const [pdfEnd, setPdfEnd] = useState("");
  const [generating, setGenerating] = useState(false);

  // Fetch greenhouses
  useEffect(() => {
    listGreenhouses().then((d) => setGreenhouses(d.results)).catch(() => {});
  }, []);

  // Fetch zones when greenhouse changes
  useEffect(() => {
    if (!selectedGreenhouseId) {
      setZones([]);
      setSelectedZoneId("");
      return;
    }
    listZones(Number(selectedGreenhouseId))
      .then((d) => setZones(d.results))
      .catch(() => {});
  }, [selectedGreenhouseId]);

  // Fetch journal + crop cycles when zone changes
  const fetchJournal = useCallback(async () => {
    if (!selectedZoneId) {
      setEntries([]);
      setCropCycles([]);
      return;
    }
    setLoading(true);
    try {
      const params: Record<string, unknown> = {};
      if (selectedEntryType) params.entry_type = selectedEntryType;
      const [journal, cycles] = await Promise.all([
        listCultureJournal(Number(selectedZoneId), params as Parameters<typeof listCultureJournal>[1]),
        listCropCycles(Number(selectedZoneId)),
      ]);
      setEntries(journal.results);
      setCropCycles(cycles.results);
    } catch {
      // interceptor handles
    } finally {
      setLoading(false);
    }
  }, [selectedZoneId, selectedEntryType]);

  useEffect(() => {
    fetchJournal();
  }, [fetchJournal]);

  // Handlers
  const handleAddNote = useCallback(async () => {
    if (!selectedZoneId || !noteContent.trim()) return;
    try {
      await createNote(Number(selectedZoneId), {
        content: noteContent,
        observed_at: new Date(noteObservedAt).toISOString(),
      });
      toast.success(t("success.created"));
      setShowNoteModal(false);
      setNoteContent("");
      fetchJournal();
    } catch {
      toast.error(t("errors.generic"));
    }
  }, [selectedZoneId, noteContent, noteObservedAt, t, fetchJournal]);

  const handleAddCropCycle = useCallback(async () => {
    if (!selectedZoneId || !ccSpecies.trim()) return;
    try {
      await createCropCycle(Number(selectedZoneId), {
        species: ccSpecies,
        variety: ccVariety,
        sowing_date: ccSowingDate || null,
        status: "ACTIVE",
      });
      toast.success(t("success.created"));
      setShowCropCycleModal(false);
      setCcSpecies("");
      setCcVariety("");
      setCcSowingDate("");
      fetchJournal();
    } catch {
      toast.error(t("errors.generic"));
    }
  }, [selectedZoneId, ccSpecies, ccVariety, ccSowingDate, t, fetchJournal]);

  const handleGeneratePDF = useCallback(async () => {
    if (!selectedZoneId || !pdfStart || !pdfEnd) return;
    setGenerating(true);
    try {
      const blob = await generateTraceabilityPDF(Number(selectedZoneId), {
        period_start: pdfStart,
        period_end: pdfEnd,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `traceability_${selectedZoneId}_${pdfStart}_${pdfEnd}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tp("cultureJournal.pdfGenerated"));
      setShowPDFModal(false);
    } catch {
      toast.error(t("errors.generic"));
    } finally {
      setGenerating(false);
    }
  }, [selectedZoneId, pdfStart, pdfEnd, t, tp]);

  const handleExportGlobalGAP = useCallback(async () => {
    if (!selectedZoneId || !pdfStart || !pdfEnd) {
      toast.error(tp("cultureJournal.selectPeriod"));
      return;
    }
    try {
      const data = await exportGlobalGAP(Number(selectedZoneId), {
        from: pdfStart,
        to: pdfEnd,
      });
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `globalgap_${selectedZoneId}_${pdfStart}_${pdfEnd}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(tp("cultureJournal.gapExported"));
    } catch {
      toast.error(t("errors.generic"));
    }
  }, [selectedZoneId, pdfStart, pdfEnd, t, tp]);

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{tp("cultureJournal.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{tp("cultureJournal.subtitle")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            disabled={!selectedZoneId}
            onClick={() => setShowNoteModal(true)}
          >
            {tp("cultureJournal.addNote")}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
            disabled={!selectedZoneId}
            onClick={() => setShowCropCycleModal(true)}
          >
            {tp("cultureJournal.newCropCycle")}
          </button>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
            disabled={!selectedZoneId}
            onClick={() => setShowPDFModal(true)}
          >
            {tp("cultureJournal.exportReport")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-4">
          <select
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-full max-w-xs"
            value={selectedGreenhouseId}
            onChange={(e) => setSelectedGreenhouseId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">{tp("cultureJournal.selectGreenhouse")}</option>
            {greenhouses.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>

          <select
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-full max-w-xs disabled:opacity-50"
            value={selectedZoneId}
            disabled={!zones.length}
            onChange={(e) => setSelectedZoneId(e.target.value ? Number(e.target.value) : "")}
          >
            <option value="">{tp("cultureJournal.selectZone")}</option>
            {zones.map((z) => (
              <option key={z.id} value={z.id}>{z.name}</option>
            ))}
          </select>

          <select
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 w-full max-w-xs"
            value={selectedEntryType}
            onChange={(e) => setSelectedEntryType(e.target.value as CultureLogEntryType | "")}
          >
            <option value="">{tp("cultureJournal.allTypes")}</option>
            <option value="COMMAND">{t("entryTypes.command")}</option>
            <option value="ALERT">{t("entryTypes.alert")}</option>
            <option value="NOTE">{t("entryTypes.note")}</option>
            <option value="THRESHOLD">{t("entryTypes.threshold")}</option>
            <option value="CROP">{t("entryTypes.crop")}</option>
            <option value="AUTOMATION">{t("entryTypes.automation")}</option>
          </select>
        </div>
      </div>

      {/* Active Crop Cycles */}
      {cropCycles.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold text-foreground">{tp("cultureJournal.activeCropCycles")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cropCycles.map((cc) => (
              <div
                key={cc.id}
                className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
              >
                <div className="font-medium text-foreground">
                  {cc.species}{cc.variety ? ` (${cc.variety})` : ""}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    cc.status === "ACTIVE"
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400"
                      : "bg-muted text-muted-foreground"
                  }`}>
                    {cc.status}
                  </span>
                  {cc.sowing_date && (
                    <span>{tp("cultureJournal.sowing")}: {cc.sowing_date}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !selectedZoneId ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">
          {tp("cultureJournal.selectZonePrompt")}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex justify-center py-12 text-sm text-muted-foreground">
          {tp("cultureJournal.noEntries")}
        </div>
      ) : (
        <div className="relative ml-4 border-l-2 border-border pl-6 space-y-5">
          {entries.map((entry, i) => {
            const style = ENTRY_TYPE_STYLES[entry.entry_type] ?? {
              border: "border-border",
              bg: "bg-card",
            };
            const dot = ENTRY_TYPE_DOT[entry.entry_type] ?? "bg-muted-foreground";
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className={`absolute -left-7.75 top-2 h-3.5 w-3.5 rounded-full border-2 border-background ${dot}`} />

                <div className={`rounded-xl border ${style.border} ${style.bg} p-4`}>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-xs font-medium text-foreground">
                      {entry.entry_type_display}
                    </span>
                    <time>{formatDate(entry.created_at)}</time>
                    <span>{formatRelativeTime(entry.created_at)}</span>
                    {entry.username && (
                      <span className="font-medium text-foreground">{entry.username}</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-foreground">{entry.summary}</p>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Note Modal */}
      <Modal open={showNoteModal} onClose={() => setShowNoteModal(false)} title={tp("cultureJournal.addNote")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.noteContent")}</label>
            <textarea
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 h-24 resize-none"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={tp("cultureJournal.notePlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.observedAt")}</label>
            <input
              type="datetime-local"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={noteObservedAt}
              onChange={(e) => setNoteObservedAt(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setShowNoteModal(false)}
            >
              {t("actions.cancel")}
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              onClick={handleAddNote}
              disabled={!noteContent.trim()}
            >
              {t("actions.save")}
            </button>
          </div>
        </div>
      </Modal>

      {/* New Crop Cycle Modal */}
      <Modal open={showCropCycleModal} onClose={() => setShowCropCycleModal(false)} title={tp("cultureJournal.newCropCycle")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.species")}</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={ccSpecies}
              onChange={(e) => setCcSpecies(e.target.value)}
              placeholder="Solanum lycopersicum"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.variety")}</label>
            <input
              type="text"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={ccVariety}
              onChange={(e) => setCcVariety(e.target.value)}
              placeholder="Roma"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.sowingDate")}</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={ccSowingDate}
              onChange={(e) => setCcSowingDate(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setShowCropCycleModal(false)}
            >
              {t("actions.cancel")}
            </button>
            <button
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
              onClick={handleAddCropCycle}
              disabled={!ccSpecies.trim()}
            >
              {t("actions.create")}
            </button>
          </div>
        </div>
      </Modal>

      {/* Export Report Modal */}
      <Modal open={showPDFModal} onClose={() => setShowPDFModal(false)} title={tp("cultureJournal.exportReport")}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.periodStart")}</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={pdfStart}
              onChange={(e) => setPdfStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{tp("cultureJournal.periodEnd")}</label>
            <input
              type="date"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20"
              value={pdfEnd}
              onChange={(e) => setPdfEnd(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <button
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
              onClick={() => setShowPDFModal(false)}
            >
              {t("actions.cancel")}
            </button>
            <button
              className="rounded-lg bg-secondary px-3 py-1.5 text-sm font-medium text-secondary-foreground hover:bg-secondary/80 disabled:opacity-50 transition-colors"
              onClick={handleExportGlobalGAP}
              disabled={!pdfStart || !pdfEnd}
            >
              {tp("cultureJournal.exportGAP")}
            </button>
            <button
              className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
              onClick={handleGeneratePDF}
              disabled={generating || !pdfStart || !pdfEnd}
            >
              {generating ? <Spinner className="h-4 w-4" /> : tp("cultureJournal.downloadPDF")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
