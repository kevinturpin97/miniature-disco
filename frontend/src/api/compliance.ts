/**
 * Compliance & traceability API calls.
 */

import client from "./client";
import type {
  CropCycle,
  CropCyclePayload,
  CultureLogEntry,
  GDPRExportData,
  GDPRErasureResponse,
  GlobalGAPExport,
  NotePayload,
  PaginatedResponse,
  TraceabilityReportRequest,
  ZoneNote,
} from "@/types";

// --- Crop Cycles ---

export async function listCropCycles(
  zoneId: number,
): Promise<PaginatedResponse<CropCycle>> {
  const { data } = await client.get<PaginatedResponse<CropCycle>>(
    `/zones/${zoneId}/crop-cycles/`,
  );
  return data;
}

export async function getCropCycle(id: number): Promise<CropCycle> {
  const { data } = await client.get<CropCycle>(`/crop-cycles/${id}/`);
  return data;
}

export async function createCropCycle(
  zoneId: number,
  payload: CropCyclePayload,
): Promise<CropCycle> {
  const { data } = await client.post<CropCycle>(
    `/zones/${zoneId}/crop-cycles/`,
    payload,
  );
  return data;
}

export async function updateCropCycle(
  id: number,
  payload: Partial<CropCyclePayload>,
): Promise<CropCycle> {
  const { data } = await client.patch<CropCycle>(
    `/crop-cycles/${id}/`,
    payload,
  );
  return data;
}

export async function deleteCropCycle(id: number): Promise<void> {
  await client.delete(`/crop-cycles/${id}/`);
}

// --- Notes ---

export async function listNotes(
  zoneId: number,
): Promise<PaginatedResponse<ZoneNote>> {
  const { data } = await client.get<PaginatedResponse<ZoneNote>>(
    `/zones/${zoneId}/notes/`,
  );
  return data;
}

export async function createNote(
  zoneId: number,
  payload: NotePayload,
): Promise<ZoneNote> {
  const { data } = await client.post<ZoneNote>(
    `/zones/${zoneId}/notes/`,
    payload,
  );
  return data;
}

export async function updateNote(
  id: number,
  payload: Partial<NotePayload>,
): Promise<ZoneNote> {
  const { data } = await client.patch<ZoneNote>(`/notes/${id}/`, payload);
  return data;
}

export async function deleteNote(id: number): Promise<void> {
  await client.delete(`/notes/${id}/`);
}

// --- Culture Journal ---

export async function listCultureJournal(
  zoneId: number,
  params?: { entry_type?: string; crop_cycle?: number; page?: number },
): Promise<PaginatedResponse<CultureLogEntry>> {
  const { data } = await client.get<PaginatedResponse<CultureLogEntry>>(
    `/zones/${zoneId}/culture-journal/`,
    { params },
  );
  return data;
}

// --- Traceability Reports ---

export async function generateTraceabilityPDF(
  zoneId: number,
  payload: TraceabilityReportRequest,
): Promise<Blob> {
  const { data } = await client.post(
    `/zones/${zoneId}/traceability/pdf/`,
    payload,
    { responseType: "blob" },
  );
  return data;
}

export async function verifyTraceabilityReport(
  zoneId: number,
  hash: string,
): Promise<{ valid: boolean; report_id?: number; zone?: string; signed_at?: string }> {
  const { data } = await client.get(
    `/zones/${zoneId}/traceability/verify/`,
    { params: { hash } },
  );
  return data;
}

// --- GDPR ---

export async function exportGDPRData(): Promise<GDPRExportData> {
  const { data } = await client.get<GDPRExportData>("/auth/gdpr/export/");
  return data;
}

export async function requestGDPRErasure(): Promise<GDPRErasureResponse> {
  const { data } = await client.post<GDPRErasureResponse>(
    "/auth/gdpr/erasure/",
    { confirm: true },
  );
  return data;
}

// --- GlobalG.A.P. ---

export async function exportGlobalGAP(
  zoneId: number,
  params: { from: string; to: string; crop_cycle?: number },
): Promise<GlobalGAPExport> {
  const { data } = await client.get<GlobalGAPExport>(
    `/zones/${zoneId}/globalgap/export/`,
    { params },
  );
  return data;
}
