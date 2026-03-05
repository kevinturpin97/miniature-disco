/**
 * Structured frontend logger.
 *
 * In production (when VITE_SENTRY_DSN is set), errors are forwarded to Sentry.
 * All log entries are JSON-formatted for log aggregation.
 */

const isDev = import.meta.env.DEV;

interface LogContext {
  [key: string]: unknown;
}

function formatLog(
  level: string,
  message: string,
  context?: LogContext,
): string {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };
  return JSON.stringify(entry);
}

export const logger = {
  debug(message: string, context?: LogContext): void {
    if (isDev) {
      console.debug(formatLog("debug", message, context));
    }
  },

  info(message: string, context?: LogContext): void {
    if (isDev) {
      console.info(formatLog("info", message, context));
    }
  },

  warn(message: string, context?: LogContext): void {
    console.warn(formatLog("warn", message, context));
  },

  error(message: string, error?: unknown, context?: LogContext): void {
    console.error(
      formatLog("error", message, {
        ...context,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      }),
    );

    // Forward to Sentry if available
    if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).__SENTRY__) {
      import("@sentry/react").then((Sentry) => {
        if (error instanceof Error) {
          Sentry.captureException(error, { extra: context });
        } else {
          Sentry.captureMessage(message, { level: "error", extra: context });
        }
      }).catch(() => {
        // Sentry not available, already logged to console
      });
    }
  },
};
