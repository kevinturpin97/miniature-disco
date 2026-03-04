/**
 * Settings page with two tabs: Profile and Resources.
 *
 * Profile tab allows editing user info and changing password.
 * Resources tab provides an accordion/tree view for managing
 * greenhouses, zones, sensors, and actuators.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { getMe, updateMe, changePassword } from "@/api/auth";
import {
  listGreenhouses,
  createGreenhouse,
  deleteGreenhouse,
} from "@/api/greenhouses";
import { listZones, createZone, deleteZone } from "@/api/zones";
import { listSensors, createSensor, deleteSensor } from "@/api/sensors";
import {
  listActuators,
  createActuator,
  deleteActuator,
} from "@/api/actuators";
import { Modal } from "@/components/ui/Modal";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Spinner } from "@/components/ui/Spinner";
import {
  SENSOR_TYPE_LABELS,
  SENSOR_TYPE_UNITS,
  ACTUATOR_TYPE_LABELS,
} from "@/utils/constants";
import type {
  User,
  Greenhouse,
  Zone,
  Sensor,
  Actuator,
  SensorType,
  ActuatorType,
} from "@/types";

type TabKey = "profile" | "resources";

/* ------------------------------------------------------------------ */
/*  Chevron icon used for accordion expand / collapse                  */
/* ------------------------------------------------------------------ */
function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-gray-500 dark:text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Plus icon used on "Add" buttons                                    */
/* ------------------------------------------------------------------ */
function PlusIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M12 4v16m8-8H4"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Trash icon used on "Delete" buttons                                */
/* ------------------------------------------------------------------ */
function TrashIcon() {
  return (
    <svg
      className="h-4 w-4"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    </svg>
  );
}

/* ================================================================== */
/*  Profile Tab                                                        */
/* ================================================================== */

function ProfileTab() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState("");
  const [profileError, setProfileError] = useState("");

  // Profile fields
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");

  // Password fields
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [changingPw, setChangingPw] = useState(false);
  const [pwMsg, setPwMsg] = useState("");
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user: User = await getMe();
        if (cancelled) return;
        setUsername(user.username);
        setEmail(user.email);
        setFirstName(user.first_name);
        setLastName(user.last_name);
      } catch {
        if (!cancelled) setProfileError(t("errors.loadFailed"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [t]);

  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileMsg("");
    setProfileError("");
    setSaving(true);
    try {
      const updated = await updateMe({
        email,
        first_name: firstName,
        last_name: lastName,
      });
      setEmail(updated.email);
      setFirstName(updated.first_name);
      setLastName(updated.last_name);
      setProfileMsg(tp("settings.profile.saveSuccess"));
    } catch {
      setProfileError(t("errors.generic"));
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwMsg("");
    setPwError("");

    if (newPassword !== confirmNewPassword) {
      setPwError(tp("settings.profile.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      setPwError(tp("settings.profile.passwordTooShort"));
      return;
    }

    setChangingPw(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      setPwMsg(tp("settings.profile.passwordSuccess"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      setPwError(t("errors.generic"));
    } finally {
      setChangingPw(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Profile form */}
      <div className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {tp("settings.profile.title")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {tp("settings.profile.subtitle")}
        </p>

        {profileMsg && (
          <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            {profileMsg}
          </div>
        )}
        {profileError && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {profileError}
          </div>
        )}

        <form onSubmit={handleProfileSave} className="mt-6 space-y-4">
          {/* Username (readonly) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.username")}
            </label>
            <input
              type="text"
              value={username}
              readOnly
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 shadow-sm"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
            />
          </div>

          {/* First name / Last name */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.name")} (first)
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.name")} (last)
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {saving ? "..." : t("actions.save")}
            </button>
          </div>
        </form>
      </div>

      {/* Password change */}
      <div className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
          {tp("settings.profile.passwordTitle")}
        </h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          {tp("settings.profile.passwordSubtitle")}
        </p>

        {pwMsg && (
          <div className="mt-4 rounded-lg bg-green-50 dark:bg-green-900/20 px-4 py-3 text-sm text-green-700 dark:text-green-300">
            {pwMsg}
          </div>
        )}
        {pwError && (
          <div className="mt-4 rounded-lg bg-red-50 dark:bg-red-900/20 px-4 py-3 text-sm text-red-700 dark:text-red-300">
            {pwError}
          </div>
        )}

        <form onSubmit={handlePasswordChange} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.currentPassword")}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.confirmNewPassword")}
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPw}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-50"
            >
              {changingPw ? "..." : t("actions.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  Resources Tab                                                      */
/* ================================================================== */

/** Shape of the data we keep per-zone in the accordion. */
interface ZoneResources {
  zone: Zone;
  sensors: Sensor[];
  actuators: Actuator[];
  loaded: boolean;
}

/** Shape of the data we keep per-greenhouse. */
interface GreenhouseResources {
  greenhouse: Greenhouse;
  zones: ZoneResources[];
  loaded: boolean;
}

const ALL_SENSOR_TYPES: SensorType[] = [
  "TEMP",
  "HUM_AIR",
  "HUM_SOIL",
  "PH",
  "LIGHT",
  "CO2",
];

const ALL_ACTUATOR_TYPES: ActuatorType[] = [
  "VALVE",
  "FAN",
  "HEATER",
  "LIGHT",
  "PUMP",
  "SHADE",
];

function ResourcesTab() {
  const { t } = useTranslation();
  const { t: tp } = useTranslation("pages");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [greenhouses, setGreenhouses] = useState<GreenhouseResources[]>([]);

  // Accordion state
  const [expandedGh, setExpandedGh] = useState<Set<number>>(new Set());
  const [expandedZone, setExpandedZone] = useState<Set<number>>(new Set());

  // Create greenhouse modal
  const [ghModalOpen, setGhModalOpen] = useState(false);
  const [ghName, setGhName] = useState("");
  const [ghLocation, setGhLocation] = useState("");
  const [ghDescription, setGhDescription] = useState("");
  const [ghSaving, setGhSaving] = useState(false);

  // Create zone modal
  const [zoneModalOpen, setZoneModalOpen] = useState(false);
  const [zoneParentGhId, setZoneParentGhId] = useState<number | null>(null);
  const [zoneName, setZoneName] = useState("");
  const [zoneRelayId, setZoneRelayId] = useState("");
  const [zoneDescription, setZoneDescription] = useState("");
  const [zoneInterval, setZoneInterval] = useState("300");
  const [zoneSaving, setZoneSaving] = useState(false);

  // Create sensor modal
  const [sensorModalOpen, setSensorModalOpen] = useState(false);
  const [sensorParentZoneId, setSensorParentZoneId] = useState<number | null>(
    null,
  );
  const [sensorType, setSensorType] = useState<SensorType>("TEMP");
  const [sensorLabel, setSensorLabel] = useState("");
  const [sensorUnit, setSensorUnit] = useState(SENSOR_TYPE_UNITS["TEMP"]);
  const [sensorMin, setSensorMin] = useState("");
  const [sensorMax, setSensorMax] = useState("");
  const [sensorSaving, setSensorSaving] = useState(false);

  // Create actuator modal
  const [actuatorModalOpen, setActuatorModalOpen] = useState(false);
  const [actuatorParentZoneId, setActuatorParentZoneId] = useState<
    number | null
  >(null);
  const [actuatorType, setActuatorType] = useState<ActuatorType>("VALVE");
  const [actuatorName, setActuatorName] = useState("");
  const [actuatorGpio, setActuatorGpio] = useState("");
  const [actuatorSaving, setActuatorSaving] = useState(false);

  // Delete confirmation
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState("");
  const [confirmMessage, setConfirmMessage] = useState("");
  const [confirmAction, setConfirmAction] = useState<(() => Promise<void>) | null>(null);
  const [confirmLoading, setConfirmLoading] = useState(false);

  /* ---- Load greenhouses ---- */
  const fetchGreenhouses = useCallback(async () => {
    try {
      const data = await listGreenhouses();
      setGreenhouses(
        data.results.map((gh) => ({
          greenhouse: gh,
          zones: [],
          loaded: false,
        })),
      );
    } catch {
      setError(t("errors.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchGreenhouses();
  }, [fetchGreenhouses]);

  /* ---- Load zones for a greenhouse ---- */
  const loadZonesForGh = useCallback(
    async (ghId: number) => {
      setGreenhouses((prev) =>
        prev.map((g) => {
          if (g.greenhouse.id !== ghId || g.loaded) return g;
          return { ...g, loaded: true };
        }),
      );
      try {
        const data = await listZones(ghId);
        setGreenhouses((prev) =>
          prev.map((g) => {
            if (g.greenhouse.id !== ghId) return g;
            return {
              ...g,
              zones: data.results.map((z) => ({
                zone: z,
                sensors: [],
                actuators: [],
                loaded: false,
              })),
              loaded: true,
            };
          }),
        );
      } catch {
        /* silently fail — user can toggle again */
      }
    },
    [],
  );

  /* ---- Load sensors + actuators for a zone ---- */
  const loadResourcesForZone = useCallback(async (zoneId: number) => {
    setGreenhouses((prev) =>
      prev.map((g) => ({
        ...g,
        zones: g.zones.map((z) => {
          if (z.zone.id !== zoneId || z.loaded) return z;
          return { ...z, loaded: true };
        }),
      })),
    );
    try {
      const [sensorsData, actuatorsData] = await Promise.all([
        listSensors(zoneId),
        listActuators(zoneId),
      ]);
      setGreenhouses((prev) =>
        prev.map((g) => ({
          ...g,
          zones: g.zones.map((z) => {
            if (z.zone.id !== zoneId) return z;
            return {
              ...z,
              sensors: sensorsData.results,
              actuators: actuatorsData.results,
              loaded: true,
            };
          }),
        })),
      );
    } catch {
      /* silently fail */
    }
  }, []);

  /* ---- Toggle greenhouse accordion ---- */
  const toggleGh = (ghId: number) => {
    setExpandedGh((prev) => {
      const next = new Set(prev);
      if (next.has(ghId)) {
        next.delete(ghId);
      } else {
        next.add(ghId);
        loadZonesForGh(ghId);
      }
      return next;
    });
  };

  /* ---- Toggle zone accordion ---- */
  const toggleZone = (zoneId: number) => {
    setExpandedZone((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) {
        next.delete(zoneId);
      } else {
        next.add(zoneId);
        loadResourcesForZone(zoneId);
      }
      return next;
    });
  };

  /* ---- Open delete confirmation ---- */
  const openConfirm = (
    title: string,
    message: string,
    action: () => Promise<void>,
  ) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => action);
    setConfirmOpen(true);
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setConfirmLoading(true);
    try {
      await confirmAction();
    } finally {
      setConfirmLoading(false);
      setConfirmOpen(false);
      setConfirmAction(null);
    }
  };

  /* ---- Create greenhouse ---- */
  const handleCreateGh = async (e: React.FormEvent) => {
    e.preventDefault();
    setGhSaving(true);
    try {
      const created = await createGreenhouse({
        name: ghName,
        location: ghLocation,
        description: ghDescription,
      });
      setGreenhouses((prev) => [
        ...prev,
        { greenhouse: created, zones: [], loaded: false },
      ]);
      setGhModalOpen(false);
      setGhName("");
      setGhLocation("");
      setGhDescription("");
    } catch {
      /* modal stays open for retry */
    } finally {
      setGhSaving(false);
    }
  };

  /* ---- Delete greenhouse ---- */
  const handleDeleteGh = (gh: Greenhouse) => {
    openConfirm(
      t("confirm.deleteTitle"),
      t("confirm.deleteGreenhouse"),
      async () => {
        await deleteGreenhouse(gh.id);
        setGreenhouses((prev) =>
          prev.filter((g) => g.greenhouse.id !== gh.id),
        );
      },
    );
  };

  /* ---- Create zone ---- */
  const openCreateZone = (ghId: number) => {
    setZoneParentGhId(ghId);
    setZoneName("");
    setZoneRelayId("");
    setZoneDescription("");
    setZoneInterval("300");
    setZoneModalOpen(true);
  };

  const handleCreateZone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (zoneParentGhId === null) return;
    setZoneSaving(true);
    try {
      const created = await createZone(zoneParentGhId, {
        name: zoneName,
        relay_id: Number(zoneRelayId),
        description: zoneDescription,
        transmission_interval: Number(zoneInterval),
      });
      setGreenhouses((prev) =>
        prev.map((g) => {
          if (g.greenhouse.id !== zoneParentGhId) return g;
          return {
            ...g,
            zones: [
              ...g.zones,
              { zone: created, sensors: [], actuators: [], loaded: false },
            ],
          };
        }),
      );
      setZoneModalOpen(false);
    } catch {
      /* modal stays open */
    } finally {
      setZoneSaving(false);
    }
  };

  /* ---- Delete zone ---- */
  const handleDeleteZone = (zone: Zone) => {
    openConfirm(
      t("confirm.deleteTitle"),
      t("confirm.deleteZone"),
      async () => {
        await deleteZone(zone.id);
        setGreenhouses((prev) =>
          prev.map((g) => ({
            ...g,
            zones: g.zones.filter((z) => z.zone.id !== zone.id),
          })),
        );
      },
    );
  };

  /* ---- Create sensor ---- */
  const openCreateSensor = (zoneId: number) => {
    setSensorParentZoneId(zoneId);
    setSensorType("TEMP");
    setSensorUnit(SENSOR_TYPE_UNITS["TEMP"]);
    setSensorLabel("");
    setSensorMin("");
    setSensorMax("");
    setSensorModalOpen(true);
  };

  const handleSensorTypeChange = (val: SensorType) => {
    setSensorType(val);
    setSensorUnit(SENSOR_TYPE_UNITS[val] ?? "");
  };

  const handleCreateSensor = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sensorParentZoneId === null) return;
    setSensorSaving(true);
    try {
      const created = await createSensor(sensorParentZoneId, {
        sensor_type: sensorType,
        unit: sensorUnit,
        label: sensorLabel || undefined,
        min_threshold: sensorMin ? Number(sensorMin) : undefined,
        max_threshold: sensorMax ? Number(sensorMax) : undefined,
      });
      setGreenhouses((prev) =>
        prev.map((g) => ({
          ...g,
          zones: g.zones.map((z) => {
            if (z.zone.id !== sensorParentZoneId) return z;
            return { ...z, sensors: [...z.sensors, created] };
          }),
        })),
      );
      setSensorModalOpen(false);
    } catch {
      /* modal stays open */
    } finally {
      setSensorSaving(false);
    }
  };

  /* ---- Delete sensor ---- */
  const handleDeleteSensor = (sensor: Sensor) => {
    openConfirm(
      t("confirm.deleteTitle"),
      t("confirm.deleteSensor"),
      async () => {
        await deleteSensor(sensor.id);
        setGreenhouses((prev) =>
          prev.map((g) => ({
            ...g,
            zones: g.zones.map((z) => ({
              ...z,
              sensors: z.sensors.filter((s) => s.id !== sensor.id),
            })),
          })),
        );
      },
    );
  };

  /* ---- Create actuator ---- */
  const openCreateActuator = (zoneId: number) => {
    setActuatorParentZoneId(zoneId);
    setActuatorType("VALVE");
    setActuatorName("");
    setActuatorGpio("");
    setActuatorModalOpen(true);
  };

  const handleCreateActuator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (actuatorParentZoneId === null) return;
    setActuatorSaving(true);
    try {
      const created = await createActuator(actuatorParentZoneId, {
        actuator_type: actuatorType,
        name: actuatorName,
        gpio_pin: actuatorGpio ? Number(actuatorGpio) : undefined,
      });
      setGreenhouses((prev) =>
        prev.map((g) => ({
          ...g,
          zones: g.zones.map((z) => {
            if (z.zone.id !== actuatorParentZoneId) return z;
            return { ...z, actuators: [...z.actuators, created] };
          }),
        })),
      );
      setActuatorModalOpen(false);
    } catch {
      /* modal stays open */
    } finally {
      setActuatorSaving(false);
    }
  };

  /* ---- Delete actuator ---- */
  const handleDeleteActuator = (actuator: Actuator) => {
    openConfirm(
      t("confirm.deleteTitle"),
      t("confirm.deleteActuator"),
      async () => {
        await deleteActuator(actuator.id);
        setGreenhouses((prev) =>
          prev.map((g) => ({
            ...g,
            zones: g.zones.map((z) => ({
              ...z,
              actuators: z.actuators.filter((a) => a.id !== actuator.id),
            })),
          })),
        );
      },
    );
  };

  /* ---- Render ---- */
  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-300">
        {error}
      </div>
    );
  }

  return (
    <>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {tp("settings.resources.title")}
            </h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              {tp("settings.resources.subtitle")}
            </p>
          </div>
          <button
            onClick={() => setGhModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
          >
            <PlusIcon />
            {t("labels.greenhouse")}
          </button>
        </div>

        {/* Greenhouse accordion */}
        <div className="space-y-2">
          {greenhouses.map(({ greenhouse: gh, zones, loaded: ghLoaded }) => {
            const ghOpen = expandedGh.has(gh.id);
            return (
              <div
                key={gh.id}
                className="overflow-hidden rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
              >
                {/* Greenhouse row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleGh(gh.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <ChevronIcon expanded={ghOpen} />
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        {gh.name}
                      </span>
                      {gh.location && (
                        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                          {gh.location}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteGh(gh)}
                    className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                    title={t("actions.delete")}
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Zones */}
                {ghOpen && (
                  <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3">
                    {!ghLoaded ? (
                      <div className="flex justify-center py-4">
                        <Spinner className="h-5 w-5" />
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {zones.map(
                          ({
                            zone,
                            sensors,
                            actuators,
                            loaded: zoneLoaded,
                          }) => {
                            const zOpen = expandedZone.has(zone.id);
                            return (
                              <div
                                key={zone.id}
                                className="overflow-hidden rounded-lg border dark:border-gray-700 bg-white dark:bg-gray-800"
                              >
                                {/* Zone row */}
                                <div className="flex items-center gap-3 px-4 py-2.5">
                                  <button
                                    onClick={() => toggleZone(zone.id)}
                                    className="flex flex-1 items-center gap-3 text-left"
                                  >
                                    <ChevronIcon expanded={zOpen} />
                                    <div>
                                      <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                        {zone.name}
                                      </span>
                                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                        Relay #{zone.relay_id}
                                      </span>
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteZone(zone)}
                                    className="rounded-md p-1.5 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                                    title={t("actions.delete")}
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>

                                {/* Sensors + Actuators */}
                                {zOpen && (
                                  <div className="border-t dark:border-gray-700 bg-gray-50 dark:bg-gray-900 px-4 py-3 space-y-4">
                                    {!zoneLoaded ? (
                                      <div className="flex justify-center py-4">
                                        <Spinner className="h-5 w-5" />
                                      </div>
                                    ) : (
                                      <>
                                        {/* Sensors */}
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                              {t("labels.sensor")}s
                                            </h4>
                                            <button
                                              onClick={() =>
                                                openCreateSensor(zone.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                                            >
                                              <PlusIcon />
                                              {tp(
                                                "settings.resources.addSensor",
                                              )}
                                            </button>
                                          </div>
                                          {sensors.length === 0 ? (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                              {tp(
                                                "settings.resources.noSensors",
                                              )}
                                            </p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {sensors.map((s) => (
                                                <li
                                                  key={s.id}
                                                  className="flex items-center justify-between rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm border dark:border-gray-700"
                                                >
                                                  <div>
                                                    <span className="font-medium text-gray-800 dark:text-gray-200">
                                                      {SENSOR_TYPE_LABELS[
                                                        s.sensor_type
                                                      ] ?? s.sensor_type}
                                                    </span>
                                                    {s.unit && (
                                                      <span className="ml-1.5 text-xs text-gray-500 dark:text-gray-400">
                                                        ({s.unit})
                                                      </span>
                                                    )}
                                                    {s.label && (
                                                      <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                                                        - {s.label}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteSensor(s)
                                                    }
                                                    className="rounded-md p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                                                    title={t("actions.delete")}
                                                  >
                                                    <TrashIcon />
                                                  </button>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>

                                        {/* Actuators */}
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                                              {t("labels.actuator")}s
                                            </h4>
                                            <button
                                              onClick={() =>
                                                openCreateActuator(zone.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-1 text-xs font-medium text-primary-700 hover:bg-primary-100"
                                            >
                                              <PlusIcon />
                                              {tp(
                                                "settings.resources.addActuator",
                                              )}
                                            </button>
                                          </div>
                                          {actuators.length === 0 ? (
                                            <p className="text-xs text-gray-400 dark:text-gray-500 italic">
                                              {tp(
                                                "settings.resources.noActuators",
                                              )}
                                            </p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {actuators.map((a) => (
                                                <li
                                                  key={a.id}
                                                  className="flex items-center justify-between rounded-md bg-white dark:bg-gray-800 px-3 py-2 text-sm border dark:border-gray-700"
                                                >
                                                  <div>
                                                    <span className="font-medium text-gray-800 dark:text-gray-200">
                                                      {a.name}
                                                    </span>
                                                    <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                                      {ACTUATOR_TYPE_LABELS[
                                                        a.actuator_type
                                                      ] ?? a.actuator_type}
                                                    </span>
                                                    {a.gpio_pin !== null && (
                                                      <span className="ml-1.5 text-xs text-gray-400 dark:text-gray-500">
                                                        (GPIO {a.gpio_pin})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteActuator(a)
                                                    }
                                                    className="rounded-md p-1 text-gray-400 dark:text-gray-500 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 dark:hover:text-red-400"
                                                    title={t("actions.delete")}
                                                  >
                                                    <TrashIcon />
                                                  </button>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          },
                        )}

                        {/* Add zone button */}
                        <button
                          onClick={() => openCreateZone(gh.id)}
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-gray-300 dark:border-gray-600 px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-primary-400 hover:text-primary-600"
                        >
                          <PlusIcon />
                          {t("labels.zone")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {greenhouses.length === 0 && (
            <div className="rounded-xl border dark:border-gray-700 bg-white dark:bg-gray-800 p-12 text-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No greenhouses yet. Create one to get started.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ---- Modals ---- */}

      {/* Create Greenhouse */}
      <Modal
        open={ghModalOpen}
        onClose={() => setGhModalOpen(false)}
        title={`${t("actions.add")} ${t("labels.greenhouse")}`}
      >
        <form onSubmit={handleCreateGh} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={ghName}
              onChange={(e) => setGhName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.location")}
            </label>
            <input
              type="text"
              value={ghLocation}
              onChange={(e) => setGhLocation(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.description")}
            </label>
            <textarea
              value={ghDescription}
              onChange={(e) => setGhDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setGhModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={ghSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {ghSaving ? "..." : t("actions.add")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Zone */}
      <Modal
        open={zoneModalOpen}
        onClose={() => setZoneModalOpen(false)}
        title={`${t("actions.add")} ${t("labels.zone")}`}
      >
        <form onSubmit={handleCreateZone} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.relayId")}
            </label>
            <input
              type="number"
              min={1}
              max={255}
              value={zoneRelayId}
              onChange={(e) => setZoneRelayId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.description")}
            </label>
            <textarea
              value={zoneDescription}
              onChange={(e) => setZoneDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.transmissionInterval")}
            </label>
            <input
              type="number"
              min={10}
              value={zoneInterval}
              onChange={(e) => setZoneInterval(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setZoneModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={zoneSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {zoneSaving ? "..." : t("actions.add")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Sensor */}
      <Modal
        open={sensorModalOpen}
        onClose={() => setSensorModalOpen(false)}
        title={tp("settings.resources.addSensor")}
      >
        <form onSubmit={handleCreateSensor} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.sensorType")}
            </label>
            <select
              value={sensorType}
              onChange={(e) =>
                handleSensorTypeChange(e.target.value as SensorType)
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            >
              {ALL_SENSOR_TYPES.map((st) => (
                <option key={st} value={st}>
                  {SENSOR_TYPE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.unit")}
            </label>
            <input
              type="text"
              value={sensorUnit}
              onChange={(e) => setSensorUnit(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 px-3 py-2 text-sm text-gray-500 dark:text-gray-400 shadow-sm"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Label
            </label>
            <input
              type="text"
              value={sensorLabel}
              onChange={(e) => setSensorLabel(e.target.value)}
              placeholder="Optional label"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.minThreshold")}
              </label>
              <input
                type="number"
                step="any"
                value={sensorMin}
                onChange={(e) => setSensorMin(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                {t("labels.maxThreshold")}
              </label>
              <input
                type="number"
                step="any"
                value={sensorMax}
                onChange={(e) => setSensorMax(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setSensorModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={sensorSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {sensorSaving ? "..." : t("actions.add")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Actuator */}
      <Modal
        open={actuatorModalOpen}
        onClose={() => setActuatorModalOpen(false)}
        title={tp("settings.resources.addActuator")}
      >
        <form onSubmit={handleCreateActuator} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.actuatorType")}
            </label>
            <select
              value={actuatorType}
              onChange={(e) =>
                setActuatorType(e.target.value as ActuatorType)
              }
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            >
              {ALL_ACTUATOR_TYPES.map((at) => (
                <option key={at} value={at}>
                  {ACTUATOR_TYPE_LABELS[at]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={actuatorName}
              onChange={(e) => setActuatorName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              {t("labels.gpioPin")}
            </label>
            <input
              type="number"
              min={0}
              value={actuatorGpio}
              onChange={(e) => setActuatorGpio(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-lg border border-gray-300 dark:border-gray-600 px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500 dark:bg-gray-700 dark:text-gray-100"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setActuatorModalOpen(false)}
              className="rounded-lg border border-gray-300 dark:border-gray-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={actuatorSaving}
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
            >
              {actuatorSaving ? "..." : t("actions.add")}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          setConfirmOpen(false);
          setConfirmAction(null);
        }}
        onConfirm={handleConfirm}
        title={confirmTitle}
        message={confirmMessage}
        loading={confirmLoading}
      />
    </>
  );
}

/* ================================================================== */
/*  Main Settings Page                                                 */
/* ================================================================== */

export default function Settings() {
  const { t: tp } = useTranslation("pages");

  const [activeTab, setActiveTab] = useState<TabKey>("profile");

  const tabs: { key: TabKey; label: string }[] = [
    { key: "profile", label: tp("settings.tabs.profile") },
    { key: "resources", label: tp("settings.tabs.resources") },
  ];

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          {tp("settings.title")}
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-primary-600 text-primary-600"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "profile" && <ProfileTab />}
      {activeTab === "resources" && <ResourcesTab />}
    </div>
  );
}
