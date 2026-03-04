/**
 * Commands page — send ON/OFF commands to actuators and view command history.
 * Includes a zone selector (grouped by greenhouse), actuator control cards,
 * and an auto-refreshing command history table.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { createCommand, listCommands } from "@/api/commands";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/stores/authStore";
import { Spinner } from "@/components/ui/Spinner";
import { ACTUATOR_TYPE_LABELS, COMMAND_STATUS_LABELS } from "@/utils/constants";
import { formatDate } from "@/utils/formatters";
import type { Greenhouse, Zone, Actuator, Command, CommandStatus } from "@/types";

/* ---------- local types ---------- */

interface GreenhouseWithZones extends Greenhouse {
  zones: Zone[];
}

/* ---------- constants ---------- */

const STATUS_STYLES: Record<CommandStatus, { bg: string; text: string }> = {
  PENDING: { bg: "bg-yellow-100", text: "text-yellow-700" },
  SENT: { bg: "bg-blue-100", text: "text-blue-700" },
  ACK: { bg: "bg-green-100", text: "text-green-700" },
  FAILED: { bg: "bg-red-100", text: "text-red-700" },
  TIMEOUT: { bg: "bg-gray-100", text: "text-gray-600" },
};

const COMMAND_REFRESH_INTERVAL = 5_000;

/* ====================================================================== */
/*  Commands                                                               */
/* ====================================================================== */

export default function Commands() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  /* ---- structure state ---- */
  const [greenhouses, setGreenhouses] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ---- selection state ---- */
  const [selectedZoneId, setSelectedZoneId] = useState<number | null>(null);

  /* ---- zone data state ---- */
  const [actuators, setActuators] = useState<Actuator[]>([]);
  const [commands, setCommands] = useState<Command[]>([]);
  const [loadingZone, setLoadingZone] = useState(false);

  /* ---- command sending state ---- */
  const [sendingActuatorId, setSendingActuatorId] = useState<number | null>(null);

  /* ---- actuator id -> name lookup for command history ---- */
  const actuatorNameMap = useCallback(() => {
    const map = new Map<number, string>();
    actuators.forEach((a) => map.set(a.id, a.name));
    return map;
  }, [actuators]);

  /* ---- fetch greenhouses and zones on mount ---- */
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
        setError(t("errors.loadFailed"));
      } finally {
        setLoading(false);
      }
    }
    fetchStructure();
  }, [t]);

  /* ---- fetch actuators and commands when zone selected ---- */
  const fetchZoneData = useCallback(async (zoneId: number) => {
    setLoadingZone(true);
    try {
      const [actuatorResponse, commandResponse] = await Promise.all([
        listActuators(zoneId),
        listCommands(zoneId),
      ]);
      setActuators(actuatorResponse.results);
      setCommands(commandResponse.results);
    } catch {
      setActuators([]);
      setCommands([]);
    } finally {
      setLoadingZone(false);
    }
  }, []);

  useEffect(() => {
    if (selectedZoneId !== null) {
      fetchZoneData(selectedZoneId);
    } else {
      setActuators([]);
      setCommands([]);
    }
  }, [selectedZoneId, fetchZoneData]);

  /* ---- auto-refresh commands every 5 seconds ---- */
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (selectedZoneId === null) return;

    intervalRef.current = setInterval(async () => {
      try {
        const [actuatorResponse, commandResponse] = await Promise.all([
          listActuators(selectedZoneId),
          listCommands(selectedZoneId),
        ]);
        setActuators(actuatorResponse.results);
        setCommands(commandResponse.results);
      } catch {
        // Silently fail on background refresh
      }
    }, COMMAND_REFRESH_INTERVAL);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [selectedZoneId]);

  /* ---- WebSocket for real-time command status updates ---- */
  useWebSocket({
    url: "/ws/commands/",
    enabled: isAuthenticated,
    onMessage: (data: Record<string, unknown>) => {
      if (data.type === "command_status_update") {
        const commandId = data.command_id as number;
        const status = data.status as CommandStatus;
        const sentAt = (data.sent_at as string | null) ?? null;
        const acknowledgedAt = (data.acknowledged_at as string | null) ?? null;
        const errorMessage = (data.error_message as string) ?? "";

        setCommands((prev) =>
          prev.map((cmd) =>
            cmd.id === commandId
              ? {
                  ...cmd,
                  status,
                  sent_at: sentAt ?? cmd.sent_at,
                  acknowledged_at: acknowledgedAt ?? cmd.acknowledged_at,
                  error_message: errorMessage || cmd.error_message,
                }
              : cmd,
          ),
        );
      }
    },
  });

  /* ---- send command handler ---- */
  async function handleSendCommand(actuatorId: number, commandType: "ON" | "OFF") {
    setSendingActuatorId(actuatorId);
    try {
      await createCommand(actuatorId, { command_type: commandType });
      // Refetch actuators and commands to reflect new state
      if (selectedZoneId !== null) {
        const [actuatorResponse, commandResponse] = await Promise.all([
          listActuators(selectedZoneId),
          listCommands(selectedZoneId),
        ]);
        setActuators(actuatorResponse.results);
        setCommands(commandResponse.results);
      }
    } catch {
      // Silently fail — command status will be visible in history
    } finally {
      setSendingActuatorId(null);
    }
  }

  /* ---- zone change handler ---- */
  function handleZoneChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    setSelectedZoneId(value ? Number(value) : null);
  }

  /* ---- render ---- */

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  const nameMap = actuatorNameMap();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{tp("commands.title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{tp("commands.subtitle")}</p>
      </div>

      {/* Zone selector */}
      <div>
        <label className="mb-2 block text-sm font-medium text-gray-700">
          {t("labels.zone")}
        </label>
        <select
          value={selectedZoneId ?? ""}
          onChange={handleZoneChange}
          className="w-full max-w-md rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 shadow-sm"
        >
          <option value="">{tp("commands.selectZone")}</option>
          {greenhouses.map((gh) => (
            <optgroup key={gh.id} label={gh.name}>
              {gh.zones.map((zone) => (
                <option key={zone.id} value={zone.id}>
                  {zone.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* No zone selected state */}
      {selectedZoneId === null && (
        <div className="rounded-xl border bg-white p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
            />
          </svg>
          <p className="mt-4 text-sm text-gray-500">{tp("commands.selectZone")}</p>
        </div>
      )}

      {/* Loading zone data */}
      {selectedZoneId !== null && loadingZone && (
        <div className="flex h-48 items-center justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      )}

      {/* Actuator controls */}
      {selectedZoneId !== null && !loadingZone && (
        <>
          <div>
            <h2 className="mb-4 text-lg font-semibold text-gray-900">
              {tp("commands.actuatorControls")}
            </h2>
            {actuators.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center text-sm text-gray-400">
                {tp("commands.noActuators")}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {actuators.map((actuator) => {
                  const typeLabel = ACTUATOR_TYPE_LABELS[actuator.actuator_type] ?? actuator.actuator_type;
                  const isSending = sendingActuatorId === actuator.id;

                  return (
                    <div
                      key={actuator.id}
                      className="rounded-xl border bg-white p-5 shadow-sm"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-900">{actuator.name}</h3>
                          <p className="text-xs text-gray-500">{typeLabel}</p>
                        </div>
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                            actuator.state
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          <span
                            className={`inline-block h-1.5 w-1.5 rounded-full ${
                              actuator.state ? "bg-green-500" : "bg-gray-400"
                            }`}
                          />
                          {actuator.state ? t("status.on") : t("status.off")}
                        </span>
                      </div>

                      <div className="mt-4 flex gap-2">
                        <button
                          onClick={() => handleSendCommand(actuator.id, "ON")}
                          disabled={isSending}
                          className="flex-1 rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-green-700 disabled:opacity-50"
                        >
                          {isSending ? tp("commands.sendingCommand") : t("status.on")}
                        </button>
                        <button
                          onClick={() => handleSendCommand(actuator.id, "OFF")}
                          disabled={isSending}
                          className="flex-1 rounded-lg bg-gray-200 px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-300 disabled:opacity-50"
                        >
                          {isSending ? tp("commands.sendingCommand") : t("status.off")}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Command history */}
          <div className="rounded-xl border bg-white shadow-sm">
            <div className="border-b px-4 py-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {tp("commands.commandHistory")}
              </h2>
            </div>
            {commands.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                {tp("commands.noCommands")}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                      <th className="px-4 py-3">{t("labels.actuator")}</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Sent At</th>
                      <th className="px-4 py-3">Acknowledged At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {commands.map((cmd) => {
                      const statusStyle = STATUS_STYLES[cmd.status] ?? STATUS_STYLES.PENDING;
                      const actuatorName = nameMap.get(cmd.actuator) ?? `#${cmd.actuator}`;

                      return (
                        <tr key={cmd.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900">
                            {actuatorName}
                          </td>
                          <td className="px-4 py-3 text-gray-700">{cmd.command_type}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${statusStyle.bg} ${statusStyle.text}`}
                              title={cmd.error_message || undefined}
                            >
                              {COMMAND_STATUS_LABELS[cmd.status] ?? cmd.status}
                            </span>
                            {cmd.error_message && (
                              <p className="mt-1 text-xs text-red-500">{cmd.error_message}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {formatDate(cmd.created_at)}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {cmd.sent_at ? formatDate(cmd.sent_at) : "--"}
                          </td>
                          <td className="px-4 py-3 text-gray-500">
                            {cmd.acknowledged_at ? formatDate(cmd.acknowledged_at) : "--"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
