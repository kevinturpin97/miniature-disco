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

const ENTRY_TYPE_STYLES: Record<CultureLogEntryType, { bg: string; icon: string }> = {
  COMMAND: { bg: "bg-primary/10 text-primary", icon: "bolt" },
  ALERT: { bg: "bg-destructive/10 text-destructive", icon: "exclamation-triangle" },
  NOTE: { bg: "bg-info/10 text-info", icon: "pencil" },
  THRESHOLD: { bg: "bg-warning/10 text-warning", icon: "sliders" },
  CROP: { bg: "bg-success/10 text-success", icon: "seedling" },
  AUTOMATION: { bg: "bg-secondary/10 text-secondary", icon: "cog" },
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
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{tp("cultureJournal.title")}</h1>
          <p className="text-base-content/60 text-sm">{tp("cultureJournal.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            className="btn btn-primary btn-sm"
            disabled={!selectedZoneId}
            onClick={() => setShowNoteModal(true)}
          >
            {tp("cultureJournal.addNote")}
          </button>
          <button
            className="btn btn-success btn-sm"
            disabled={!selectedZoneId}
            onClick={() => setShowCropCycleModal(true)}
          >
            {tp("cultureJournal.newCropCycle")}
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={!selectedZoneId}
            onClick={() => setShowPDFModal(true)}
          >
            {tp("cultureJournal.exportReport")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="card bg-base-100 shadow-sm">
        <div className="card-body p-4">
          <div className="flex flex-wrap gap-4">
            <select
              className="select select-bordered select-sm w-full max-w-xs"
              value={selectedGreenhouseId}
              onChange={(e) => setSelectedGreenhouseId(e.target.value ? Number(e.target.value) : "")}
            >
              <option value="">{tp("cultureJournal.selectGreenhouse")}</option>
              {greenhouses.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>

            <select
              className="select select-bordered select-sm w-full max-w-xs"
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
              className="select select-bordered select-sm w-full max-w-xs"
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
      </div>

      {/* Active Crop Cycles */}
      {cropCycles.length > 0 && (
        <div className="card bg-base-100 shadow-sm">
          <div className="card-body p-4">
            <h2 className="card-title text-lg">{tp("cultureJournal.activeCropCycles")}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {cropCycles.map((cc) => (
                <div
                  key={cc.id}
                  className="flex flex-col gap-1 rounded-lg border border-base-300 p-3"
                >
                  <div className="font-semibold">{cc.species}{cc.variety ? ` (${cc.variety})` : ""}</div>
                  <div className="flex items-center gap-2 text-xs text-base-content/60">
                    <span className={`badge badge-sm ${cc.status === "ACTIVE" ? "badge-success" : "badge-ghost"}`}>
                      {cc.status}
                    </span>
                    {cc.sowing_date && <span>{tp("cultureJournal.sowing")}: {cc.sowing_date}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : !selectedZoneId ? (
        <div className="flex justify-center py-12 text-base-content/40">
          {tp("cultureJournal.selectZonePrompt")}
        </div>
      ) : entries.length === 0 ? (
        <div className="flex justify-center py-12 text-base-content/40">
          {tp("cultureJournal.noEntries")}
        </div>
      ) : (
        <div className="relative ml-4 border-l-2 border-base-300 pl-6 space-y-6">
          {entries.map((entry, i) => {
            const style = ENTRY_TYPE_STYLES[entry.entry_type] || { bg: "bg-base-200", icon: "circle" };
            return (
              <motion.div
                key={entry.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.03 }}
                className="relative"
              >
                {/* Timeline dot */}
                <div className="absolute -left-[31px] top-1 h-4 w-4 rounded-full border-2 border-base-100 bg-base-300" />

                <div className={`card shadow-sm ${style.bg}`}>
                  <div className="card-body p-4">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-base-content/60">
                      <span className="badge badge-sm badge-outline">{entry.entry_type_display}</span>
                      <time>{formatDate(entry.created_at)}</time>
                      <span>{formatRelativeTime(entry.created_at)}</span>
                      {entry.username && <span className="font-medium">{entry.username}</span>}
                    </div>
                    <p className="mt-1 text-sm">{entry.summary}</p>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Add Note Modal */}
      <Modal open={showNoteModal} onClose={() => setShowNoteModal(false)} title={tp("cultureJournal.addNote")}>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.noteContent")}</span></label>
            <textarea
              className="textarea textarea-bordered h-24"
              value={noteContent}
              onChange={(e) => setNoteContent(e.target.value)}
              placeholder={tp("cultureJournal.notePlaceholder")}
            />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.observedAt")}</span></label>
            <input
              type="datetime-local"
              className="input input-bordered"
              value={noteObservedAt}
              onChange={(e) => setNoteObservedAt(e.target.value)}
            />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setShowNoteModal(false)}>{t("actions.cancel")}</button>
            <button className="btn btn-primary" onClick={handleAddNote} disabled={!noteContent.trim()}>{t("actions.save")}</button>
          </div>
        </div>
      </Modal>

      {/* New Crop Cycle Modal */}
      <Modal open={showCropCycleModal} onClose={() => setShowCropCycleModal(false)} title={tp("cultureJournal.newCropCycle")}>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.species")}</span></label>
            <input type="text" className="input input-bordered" value={ccSpecies} onChange={(e) => setCcSpecies(e.target.value)} placeholder="Solanum lycopersicum" />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.variety")}</span></label>
            <input type="text" className="input input-bordered" value={ccVariety} onChange={(e) => setCcVariety(e.target.value)} placeholder="Roma" />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.sowingDate")}</span></label>
            <input type="date" className="input input-bordered" value={ccSowingDate} onChange={(e) => setCcSowingDate(e.target.value)} />
          </div>
          <div className="modal-action">
            <button className="btn btn-ghost" onClick={() => setShowCropCycleModal(false)}>{t("actions.cancel")}</button>
            <button className="btn btn-success" onClick={handleAddCropCycle} disabled={!ccSpecies.trim()}>{t("actions.create")}</button>
          </div>
        </div>
      </Modal>

      {/* Export Report Modal */}
      <Modal open={showPDFModal} onClose={() => setShowPDFModal(false)} title={tp("cultureJournal.exportReport")}>
        <div className="space-y-4">
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.periodStart")}</span></label>
            <input type="date" className="input input-bordered" value={pdfStart} onChange={(e) => setPdfStart(e.target.value)} />
          </div>
          <div className="form-control">
            <label className="label"><span className="label-text">{tp("cultureJournal.periodEnd")}</span></label>
            <input type="date" className="input input-bordered" value={pdfEnd} onChange={(e) => setPdfEnd(e.target.value)} />
          </div>
          <div className="modal-action flex-wrap gap-2">
            <button className="btn btn-ghost" onClick={() => setShowPDFModal(false)}>{t("actions.cancel")}</button>
            <button className="btn btn-accent" onClick={handleExportGlobalGAP} disabled={!pdfStart || !pdfEnd}>
              {tp("cultureJournal.exportGAP")}
            </button>
            <button className="btn btn-secondary" onClick={handleGeneratePDF} disabled={generating || !pdfStart || !pdfEnd}>
              {generating ? <Spinner /> : tp("cultureJournal.downloadPDF")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
