/**
 * Quick Actions page — fast actuator control from mobile home screen.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
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
        // Global interceptor shows toast.error automatically
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
      // Global interceptor shows toast.error automatically
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
        <h1 className="text-2xl font-bold text-base-content">
          {t("pages:quickActions.title")}
        </h1>
        <p className="mt-1 text-sm text-base-content/60">
          {t("pages:quickActions.subtitle")}
        </p>
      </div>

      {/* Zone status widgets */}
      <div>
        <h2 className="mb-3 text-sm font-semibold text-base-content/60 uppercase tracking-wider">
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
        <h2 className="mb-3 text-sm font-semibold text-base-content/60 uppercase tracking-wider">
          {t("pages:quickActions.actuators")}
        </h2>
        {actuators.length === 0 ? (
          <p className="text-sm text-base-content/60">
            {t("pages:quickActions.noActuators")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {actuators.map((a) => (
              <motion.div
                key={a.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                transition={{ type: "spring", stiffness: 400, damping: 25 }}
                className="card bg-base-100 shadow-xs flex-row items-center justify-between p-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-base-content">
                    {a.name}
                  </p>
                  <p className="text-xs text-base-content/60">
                    {a.zoneName} &middot; {a.actuator_type}
                  </p>
                </div>
                <input
                  type="checkbox"
                  className="toggle toggle-primary ml-3"
                  checked={a.state}
                  disabled={togglingId === a.id}
                  onChange={() => handleToggle(a)}
                  role="switch"
                  aria-label={`${a.name} toggle`}
                />
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
