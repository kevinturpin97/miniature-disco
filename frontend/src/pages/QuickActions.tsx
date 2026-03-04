/**
 * Quick Actions page — fast actuator control from mobile home screen.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listActuators } from "@/api/actuators";
import { createCommand } from "@/api/commands";
import { Spinner } from "@/components/ui/Spinner";
import { ZoneStatusWidget } from "@/components/ui/ZoneStatusWidget";
import type { Actuator, Zone } from "@/types";

interface ActuatorWithZone extends Actuator {
  zoneName: string;
  zoneId: number;
}

export default function QuickActions() {
  const { t } = useTranslation(["pages", "common"]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [actuators, setActuators] = useState<ActuatorWithZone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [togglingId, setTogglingId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const ghRes = await listGreenhouses();
        if (cancelled) return;

        const allZones: Zone[] = [];
        const allActuators: ActuatorWithZone[] = [];

        for (const gh of ghRes.results) {
          const zRes = await listZones(gh.id);
          for (const z of zRes.results) {
            allZones.push(z);
            const aRes = await listActuators(z.id);
            for (const a of aRes.results) {
              allActuators.push({ ...a, zoneName: z.name, zoneId: z.id });
            }
          }
        }

        if (cancelled) return;
        setZones(allZones);
        setActuators(allActuators);
      } catch {
        if (!cancelled) setError(t("common:errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleToggle = useCallback(async (actuator: ActuatorWithZone) => {
    setTogglingId(actuator.id);
    try {
      const cmd = actuator.state ? "OFF" : "ON";
      await createCommand(actuator.id, { command_type: cmd });
      // Optimistic update
      setActuators((prev) =>
        prev.map((a) =>
          a.id === actuator.id ? { ...a, state: !a.state } : a,
        ),
      );
    } catch {
      setError(t("common:errors.generic"));
    } finally {
      setTogglingId(null);
    }
  }, [t]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {t("pages:quickActions.title")}
        </h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {t("pages:quickActions.subtitle")}
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Zone status widgets */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
          {t("pages:quickActions.zoneOverview")}
        </h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {zones.map((z) => (
            <ZoneStatusWidget key={z.id} zone={z} />
          ))}
        </div>
      </div>

      {/* Actuator quick controls */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-gray-500 uppercase tracking-wider dark:text-gray-400">
          {t("pages:quickActions.actuators")}
        </h2>
        {actuators.length === 0 ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {t("pages:quickActions.noActuators")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actuators.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-gray-100">
                    {a.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {a.zoneName} &middot; {a.actuator_type}
                  </p>
                </div>
                <button
                  onClick={() => handleToggle(a)}
                  disabled={togglingId === a.id}
                  className={`relative ml-3 inline-flex h-8 w-14 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 ${
                    a.state
                      ? "bg-primary-600"
                      : "bg-gray-200 dark:bg-gray-600"
                  }`}
                  role="switch"
                  aria-checked={a.state}
                >
                  <span
                    className={`pointer-events-none inline-block h-7 w-7 transform rounded-full bg-white shadow ring-0 transition-transform duration-200 ${
                      a.state ? "translate-x-6" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
