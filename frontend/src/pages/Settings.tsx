/**
 * Settings page with two tabs: Profile and Resources.
 *
 * Profile tab allows editing user info and changing password.
 * Resources tab provides an accordion/tree view for managing
 * greenhouses, zones, sensors, and actuators.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

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
      className={`h-4 w-4 text-muted-foreground transition-transform ${expanded ? "rotate-90" : ""}`}
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
        // handled by global interceptor
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
      toast.success(t("success.saved"));
    } catch {
      // handled by global interceptor
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword !== confirmNewPassword) {
      toast.error(tp("settings.profile.passwordMismatch"));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(tp("settings.profile.passwordTooShort"));
      return;
    }

    setChangingPw(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      });
      toast.success(t("success.passwordChanged"));
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      // handled by global interceptor
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
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-foreground">
          {tp("settings.profile.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tp("settings.profile.subtitle")}
        </p>

        <form onSubmit={handleProfileSave} className="mt-6 space-y-4">
          {/* Username (readonly) */}
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.username")}
            </label>
            <input
              type="text"
              value={username}
              readOnly
              className="mt-1 block w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground shadow-xs"
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
            />
          </div>

          {/* First name / Last name */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-foreground/80">
                {t("labels.name")} (first)
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80">
                {t("labels.name")} (last)
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
              />
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {saving ? "..." : t("actions.save")}
            </button>
          </div>
        </form>
      </div>

      {/* Password change */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
        <h2 className="text-lg font-semibold text-foreground">
          {tp("settings.profile.passwordTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {tp("settings.profile.passwordSubtitle")}
        </p>

        <form onSubmit={handlePasswordChange} className="mt-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.currentPassword")}
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.newPassword")}
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.confirmNewPassword")}
            </label>
            <input
              type="password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground shadow-xs focus:border-primary focus:ring-primary bg-card"
            />
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={changingPw}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
      // handled by global interceptor
    } finally {
      setLoading(false);
    }
  }, []);

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
        /* silently fail -- user can toggle again */
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
      toast.success(t("success.created"));
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
        toast.success(t("success.deleted"));
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
      toast.success(t("success.created"));
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
        toast.success(t("success.deleted"));
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
      toast.success(t("success.created"));
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
        toast.success(t("success.deleted"));
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
      toast.success(t("success.created"));
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
        toast.success(t("success.deleted"));
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

  return (
    <>
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {tp("settings.resources.title")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {tp("settings.resources.subtitle")}
            </p>
          </div>
          <button
            onClick={() => setGhModalOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90 transition-colors"
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
                className="overflow-hidden rounded-xl border border-border bg-card shadow-xs"
              >
                {/* Greenhouse row */}
                <div className="flex items-center gap-3 px-4 py-3">
                  <button
                    onClick={() => toggleGh(gh.id)}
                    className="flex flex-1 items-center gap-3 text-left"
                  >
                    <ChevronIcon expanded={ghOpen} />
                    <div>
                      <span className="text-sm font-semibold text-foreground">
                        {gh.name}
                      </span>
                      {gh.location && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {gh.location}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    onClick={() => handleDeleteGh(gh)}
                    className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                    title={t("actions.delete")}
                  >
                    <TrashIcon />
                  </button>
                </div>

                {/* Zones */}
                {ghOpen && (
                  <div className="border-t border-border bg-secondary px-4 py-3">
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
                                className="overflow-hidden rounded-lg border border-border bg-card"
                              >
                                {/* Zone row */}
                                <div className="flex items-center gap-3 px-4 py-2.5">
                                  <button
                                    onClick={() => toggleZone(zone.id)}
                                    className="flex flex-1 items-center gap-3 text-left"
                                  >
                                    <ChevronIcon expanded={zOpen} />
                                    <div>
                                      <span className="text-sm font-medium text-foreground">
                                        {zone.name}
                                      </span>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                        Relay #{zone.relay_id}
                                      </span>
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => handleDeleteZone(zone)}
                                    className="rounded-md p-1.5 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
                                    title={t("actions.delete")}
                                  >
                                    <TrashIcon />
                                  </button>
                                </div>

                                {/* Sensors + Actuators */}
                                {zOpen && (
                                  <div className="border-t border-border bg-secondary px-4 py-3 space-y-4">
                                    {!zoneLoaded ? (
                                      <div className="flex justify-center py-4">
                                        <Spinner className="h-5 w-5" />
                                      </div>
                                    ) : (
                                      <>
                                        {/* Sensors */}
                                        <div>
                                          <div className="flex items-center justify-between mb-2">
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              {t("labels.sensor")}s
                                            </h4>
                                            <button
                                              onClick={() =>
                                                openCreateSensor(zone.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                                            >
                                              <PlusIcon />
                                              {tp(
                                                "settings.resources.addSensor",
                                              )}
                                            </button>
                                          </div>
                                          {sensors.length === 0 ? (
                                            <p className="text-xs text-muted-foreground/60 italic">
                                              {tp(
                                                "settings.resources.noSensors",
                                              )}
                                            </p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {sensors.map((s) => (
                                                <li
                                                  key={s.id}
                                                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm border border-border"
                                                >
                                                  <div>
                                                    <span className="font-medium text-foreground">
                                                      {SENSOR_TYPE_LABELS[
                                                        s.sensor_type
                                                      ] ?? s.sensor_type}
                                                    </span>
                                                    {s.unit && (
                                                      <span className="ml-1.5 text-xs text-muted-foreground">
                                                        ({s.unit})
                                                      </span>
                                                    )}
                                                    {s.label && (
                                                      <span className="ml-2 text-xs text-muted-foreground/60">
                                                        - {s.label}
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteSensor(s)
                                                    }
                                                    className="rounded-md p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
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
                                            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                              {t("labels.actuator")}s
                                            </h4>
                                            <button
                                              onClick={() =>
                                                openCreateActuator(zone.id)
                                              }
                                              className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/20"
                                            >
                                              <PlusIcon />
                                              {tp(
                                                "settings.resources.addActuator",
                                              )}
                                            </button>
                                          </div>
                                          {actuators.length === 0 ? (
                                            <p className="text-xs text-muted-foreground/60 italic">
                                              {tp(
                                                "settings.resources.noActuators",
                                              )}
                                            </p>
                                          ) : (
                                            <ul className="space-y-1">
                                              {actuators.map((a) => (
                                                <li
                                                  key={a.id}
                                                  className="flex items-center justify-between rounded-md bg-card px-3 py-2 text-sm border border-border"
                                                >
                                                  <div>
                                                    <span className="font-medium text-foreground">
                                                      {a.name}
                                                    </span>
                                                    <span className="ml-2 text-xs text-muted-foreground">
                                                      {ACTUATOR_TYPE_LABELS[
                                                        a.actuator_type
                                                      ] ?? a.actuator_type}
                                                    </span>
                                                    {a.gpio_pin !== null && (
                                                      <span className="ml-1.5 text-xs text-muted-foreground/60">
                                                        (GPIO {a.gpio_pin})
                                                      </span>
                                                    )}
                                                  </div>
                                                  <button
                                                    onClick={() =>
                                                      handleDeleteActuator(a)
                                                    }
                                                    className="rounded-md p-1 text-muted-foreground/60 hover:bg-destructive/10 hover:text-destructive"
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
                          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium text-muted-foreground hover:border-primary hover:text-primary"
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
            <div className="rounded-xl border border-border bg-card p-12 text-center">
              <p className="text-sm text-muted-foreground">
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
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={ghName}
              onChange={(e) => setGhName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.location")}
            </label>
            <input
              type="text"
              value={ghLocation}
              onChange={(e) => setGhLocation(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.description")}
            </label>
            <textarea
              value={ghDescription}
              onChange={(e) => setGhDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setGhModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={ghSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={zoneName}
              onChange={(e) => setZoneName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.relayId")}
            </label>
            <input
              type="number"
              min={1}
              max={255}
              value={zoneRelayId}
              onChange={(e) => setZoneRelayId(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.description")}
            </label>
            <textarea
              value={zoneDescription}
              onChange={(e) => setZoneDescription(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.transmissionInterval")}
            </label>
            <input
              type="number"
              min={10}
              value={zoneInterval}
              onChange={(e) => setZoneInterval(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setZoneModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={zoneSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.sensorType")}
            </label>
            <select
              value={sensorType}
              onChange={(e) =>
                handleSensorTypeChange(e.target.value as SensorType)
              }
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            >
              {ALL_SENSOR_TYPES.map((st) => (
                <option key={st} value={st}>
                  {SENSOR_TYPE_LABELS[st]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.unit")}
            </label>
            <input
              type="text"
              value={sensorUnit}
              onChange={(e) => setSensorUnit(e.target.value)}
              className="mt-1 block w-full rounded-lg border border-border bg-secondary px-3 py-2 text-sm text-muted-foreground shadow-xs"
              readOnly
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              Label
            </label>
            <input
              type="text"
              value={sensorLabel}
              onChange={(e) => setSensorLabel(e.target.value)}
              placeholder="Optional label"
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-foreground/80">
                {t("labels.minThreshold")}
              </label>
              <input
                type="number"
                step="any"
                value={sensorMin}
                onChange={(e) => setSensorMin(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground/80">
                {t("labels.maxThreshold")}
              </label>
              <input
                type="number"
                step="any"
                value={sensorMax}
                onChange={(e) => setSensorMax(e.target.value)}
                className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setSensorModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={sensorSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.actuatorType")}
            </label>
            <select
              value={actuatorType}
              onChange={(e) =>
                setActuatorType(e.target.value as ActuatorType)
              }
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            >
              {ALL_ACTUATOR_TYPES.map((at) => (
                <option key={at} value={at}>
                  {ACTUATOR_TYPE_LABELS[at]}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.name")}
            </label>
            <input
              type="text"
              value={actuatorName}
              onChange={(e) => setActuatorName(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-foreground/80">
              {t("labels.gpioPin")}
            </label>
            <input
              type="number"
              min={0}
              value={actuatorGpio}
              onChange={(e) => setActuatorGpio(e.target.value)}
              placeholder="Optional"
              className="mt-1 block w-full rounded-lg border border-border px-3 py-2 text-sm shadow-xs focus:border-primary focus:ring-primary bg-card text-foreground"
            />
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setActuatorModalOpen(false)}
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground/80 hover:bg-accent transition-colors"
            >
              {t("actions.cancel")}
            </button>
            <button
              type="submit"
              disabled={actuatorSaving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
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
        <h1 className="text-2xl font-bold text-foreground">
          {tp("settings.title")}
        </h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="-mb-px flex gap-6" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`whitespace-nowrap border-b-2 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground/80"
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
