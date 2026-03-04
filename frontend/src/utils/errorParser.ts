/**
 * Parse API error responses into human-readable messages.
 *
 * The backend returns errors in the format:
 *   { error: true, status_code: number, details: string | object }
 *
 * This utility extracts a single user-facing message from that structure.
 */

import type { AxiosError } from "axios";

interface ApiErrorData {
  error?: boolean;
  status_code?: number;
  details?: unknown;
}

/**
 * Flatten a DRF `details` payload into a single readable string.
 *
 * Handles:
 *  - string: returned as-is
 *  - { detail: "msg" }: common DRF pattern
 *  - { field: "msg" } or { field: ["msg1", "msg2"] }: validation errors
 *  - arrays: joined with ", "
 */
function flattenDetails(details: unknown): string {
  if (typeof details === "string") return details;

  if (Array.isArray(details)) {
    return details.map((d) => (typeof d === "string" ? d : JSON.stringify(d))).join(", ");
  }

  if (details && typeof details === "object") {
    const obj = details as Record<string, unknown>;

    // Single "detail" key — standard DRF error
    if (typeof obj.detail === "string") return obj.detail;
    if (Array.isArray(obj.detail)) return obj.detail.join(", ");

    // Field-level validation errors: { field: "msg" | ["msg1"] }
    const parts: string[] = [];
    for (const [, value] of Object.entries(obj)) {
      if (typeof value === "string") {
        parts.push(value);
      } else if (Array.isArray(value)) {
        parts.push(value.join(", "));
      }
    }
    if (parts.length > 0) return parts.join(" ");
  }

  return "";
}

/**
 * Extract a human-readable error message from an Axios error.
 *
 * Priority:
 *  1. Backend structured error (details field)
 *  2. HTTP status-based fallback
 *  3. Network / timeout fallback
 */
export function parseApiError(error: AxiosError<ApiErrorData>): string {
  // Network error — no response received
  if (!error.response) {
    if (error.code === "ECONNABORTED") {
      return "Request timed out. Please try again.";
    }
    return "Network error. Please check your connection.";
  }

  const { data, status } = error.response;

  // Backend structured error format
  if (data?.details) {
    const msg = flattenDetails(data.details);
    if (msg) return msg;
  }

  // Plain response body (non-wrapped)
  if (data && !data.error) {
    const msg = flattenDetails(data as unknown);
    if (msg) return msg;
  }

  // HTTP status fallback
  switch (status) {
    case 400:
      return "Invalid request.";
    case 401:
      return "Authentication required.";
    case 403:
      return "You don't have permission to perform this action.";
    case 404:
      return "The requested resource was not found.";
    case 409:
      return "Conflict detected. Please reload and try again.";
    case 429:
      return "Too many requests. Please wait and try again.";
    default:
      if (status >= 500) return "Server error. Please try again later.";
      return "An unexpected error occurred.";
  }
}
