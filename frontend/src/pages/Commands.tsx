/**
 * Commands page — send ON/OFF commands to actuators and view command history.
 * Includes a zone selector (grouped by greenhouse), actuator control cards,
 * and an auto-refreshing command history table.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Zap, History, ChevronDown } from "lucide-react";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { createCommand, listCommands } from "@/api/commands";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useAuthStore } from "@/stores/authStore";
import { GlowCard } from "@/components/ui/GlowCard";
import { CommandButton } from "@/components/ui/CommandButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/utils/cn";
import { ACTUATOR_TYPE_LABELS, COMMAND_STATUS_LABELS } from "@/utils/constants";
import { formatDate } from "@/utils/formatters";
import type { Greenhouse, Zone, Actuator, Command, CommandStatus } from "@/types";

/* ---------- local types ---------- */

interface GreenhouseWithZones extends Greenhouse {
  zones: Zone[];
}

/* ---------- constants ---------- */

const STATUS_STYLES: Record<CommandStatus, { bg: string; text: string }> = {
  PENDING: { bg: "bg-gh-warning/10", text: "text-gh-warning" },
  SENT: { bg: "bg-info/10", text: "text-info" },
  ACK: { bg: "bg-gh-primary/10", text: "text-gh-primary" },
  FAILED: { bg: "bg-gh-danger/10", text: "text-gh-danger" },
  TIMEOUT: { bg: "bg-muted", text: "text-muted-foreground" },
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
        // Global interceptor shows toast.error automatically
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
      <div className="space-y-6">
        <Skeleton className="h-10 w-48 rounded-xl" />
        <Skeleton className="h-10 w-80 rounded-lg" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      </div>
    );
  }

  const nameMap = actuatorNameMap();

  return (
    <div className="space-y-6 relative gradient-blur-primary gradient-blur-secondary">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Zap className="size-6 text-gh-warning" aria-hidden="true" />
            {tp("commands.title")}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{tp("commands.subtitle")}</p>
        </div>
      </div>

      {/* Zone selector */}
      <GlowCard variant="none" glass className="flex items-center gap-3 px-4 py-3">
        <label className="text-sm font-medium text-foreground/80 shrink-0">{t("labels.zone")}:</label>
        <div className="relative flex-1 max-w-xs">
          <select
            value={selectedZoneId ?? ""}
            onChange={handleZoneChange}
            className="w-full appearance-none rounded-lg border border-input bg-background/60 px-3 py-2 pr-8 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{tp("commands.selectZone")}</option>
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
          icon="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75"
          title={tp("commands.selectZone")}
          description=""
        />
      )}

      {/* Loading zone data */}
      {selectedZoneId !== null && loadingZone && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
        </div>
      )}

      {/* Actuator controls */}
      {selectedZoneId !== null && !loadingZone && (
        <>
          <section aria-label="Actuator controls">
            <h2 className="mb-4 text-base font-semibold text-foreground flex items-center gap-2">
              <Zap className="size-4 text-gh-warning" aria-hidden="true" />
              {tp("commands.actuatorControls")}
            </h2>
            {actuators.length === 0 ? (
              <GlowCard variant="none" className="p-8 text-center text-sm text-muted-foreground/60">
                {tp("commands.noActuators")}
              </GlowCard>
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {actuators.map((actuator) => {
                  const typeLabel = ACTUATOR_TYPE_LABELS[actuator.actuator_type] ?? actuator.actuator_type;
                  return (
                    <GlowCard
                      key={actuator.id}
                      variant={actuator.state ? "green" : "none"}
                      active={actuator.state}
                      glass
                      className="p-5"
                    >
                      <div className="mb-4">
                        <h3 className="font-semibold text-foreground">{actuator.name}</h3>
                        <p className="text-xs text-muted-foreground">{typeLabel}</p>
                      </div>
                      <CommandButton
                        isOn={actuator.state}
                        name={actuator.name}
                        onToggle={async () => {
                          await handleSendCommand(actuator.id, actuator.state ? "OFF" : "ON");
                        }}
                        disabled={sendingActuatorId !== null && sendingActuatorId !== actuator.id}
                      />
                    </GlowCard>
                  );
                })}
              </div>
            )}
          </section>

          {/* Command history */}
          <GlowCard variant="none" glass aria-label="Command history">
            <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-base font-semibold text-foreground">{tp("commands.commandHistory")}</h2>
            </div>
            {commands.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground/60">{tp("commands.noCommands")}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border/50 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
                      <th className="px-4 py-3">{t("labels.actuator")}</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Created</th>
                      <th className="px-4 py-3">Ack At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {commands.map((cmd) => {
                      const statusStyle = STATUS_STYLES[cmd.status] ?? STATUS_STYLES.PENDING;
                      const actuatorName = nameMap.get(cmd.actuator) ?? `#${cmd.actuator}`;
                      return (
                        <tr key={cmd.id} className="hover:bg-accent/40 transition-colors">
                          <td className="px-4 py-3 font-medium text-foreground">{actuatorName}</td>
                          <td className="px-4 py-3">
                            <span className={cn("rounded-full px-2 py-0.5 text-xs font-semibold", cmd.command_type === "ON" ? "bg-gh-primary/10 text-gh-primary" : "bg-muted text-muted-foreground")}>
                              {cmd.command_type}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", statusStyle.bg, statusStyle.text)}>
                              {COMMAND_STATUS_LABELS[cmd.status] ?? cmd.status}
                            </span>
                            {cmd.error_message && <p className="mt-1 text-xs text-gh-danger">{cmd.error_message}</p>}
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{formatDate(cmd.created_at)}</td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{cmd.acknowledged_at ? formatDate(cmd.acknowledged_at) : "--"}</td>
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
    </div>
  );
}
