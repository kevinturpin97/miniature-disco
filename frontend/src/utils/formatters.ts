/**
 * Formatting utilities for the Greenhouse SaaS frontend.
 */

import { format, formatDistanceToNow } from "date-fns";

/**
 * Format a date string to a human-readable format.
 */
export function formatDate(dateString: string): string {
  return format(new Date(dateString), "PPp");
}

/**
 * Format a date string to a relative time (e.g., "5 minutes ago").
 */
export function formatRelativeTime(dateString: string): string {
  return formatDistanceToNow(new Date(dateString), { addSuffix: true });
}

/**
 * Format a sensor value with its unit.
 */
export function formatSensorValue(value: number, unit: string): string {
  if (value == null) return "--";
  return `${value.toFixed(1)}${unit ? ` ${unit}` : ""}`;
}
