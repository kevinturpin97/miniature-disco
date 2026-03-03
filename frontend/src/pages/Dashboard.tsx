/**
 * Dashboard page — lists greenhouses with their zones and latest sensor data.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { listGreenhouses } from "@/api/greenhouses";
import { listZones } from "@/api/zones";
import { listSensors } from "@/api/sensors";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { Spinner } from "@/components/ui/Spinner";
import { SENSOR_TYPE_LABELS, SENSOR_TYPE_UNITS } from "@/utils/constants";
import type { Greenhouse, Zone, Sensor } from "@/types";

interface ZoneWithSensors extends Zone {
  sensors: Sensor[];
}

interface GreenhouseWithZones extends Greenhouse {
  zones: ZoneWithSensors[];
}

export default function Dashboard() {
  const [data, setData] = useState<GreenhouseWithZones[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchData() {
      try {
        const ghResponse = await listGreenhouses();
        const greenhouses = ghResponse.results;

        const withZones: GreenhouseWithZones[] = await Promise.all(
          greenhouses.map(async (gh) => {
            const zoneResponse = await listZones(gh.id);
            const zonesWithSensors: ZoneWithSensors[] = await Promise.all(
              zoneResponse.results.map(async (zone) => {
                const sensorResponse = await listSensors(zone.id);
                return { ...zone, sensors: sensorResponse.results };
              }),
            );
            return { ...gh, zones: zonesWithSensors };
          }),
        );

        setData(withZones);
      } catch {
        setError("Failed to load dashboard data.");
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        <svg className="mx-auto h-12 w-12 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900">No greenhouses</h3>
        <p className="mt-1 text-sm text-gray-500">Create your first greenhouse to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Overview of all your greenhouses and zones.
        </p>
      </div>

      {data.map((gh) => (
        <section key={gh.id}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{gh.name}</h2>
              {gh.location && (
                <p className="text-sm text-gray-500">{gh.location}</p>
              )}
            </div>
            <span className="rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
              {gh.zones.length} zone{gh.zones.length !== 1 ? "s" : ""}
            </span>
          </div>

          {gh.zones.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-sm text-gray-400">
              No zones configured.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {gh.zones.map((zone) => (
                <ZoneCard key={zone.id} zone={zone} />
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ZoneCard({ zone }: { zone: ZoneWithSensors }) {
  return (
    <Link
      to={`/zones/${zone.id}`}
      className="block rounded-xl border bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900">{zone.name}</h3>
        <StatusBadge online={zone.is_online} />
      </div>

      <p className="mt-1 text-xs text-gray-400">
        Relay #{zone.relay_id}
      </p>

      {zone.sensors.length > 0 ? (
        <div className="mt-4 space-y-2">
          {zone.sensors.map((sensor) => (
            <SensorRow key={sensor.id} sensor={sensor} />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-xs text-gray-400">No sensors configured.</p>
      )}
    </Link>
  );
}

function SensorRow({ sensor }: { sensor: Sensor }) {
  const label =
    SENSOR_TYPE_LABELS[sensor.sensor_type as keyof typeof SENSOR_TYPE_LABELS] ??
    sensor.sensor_type;
  const unit =
    SENSOR_TYPE_UNITS[sensor.sensor_type as keyof typeof SENSOR_TYPE_UNITS] ??
    sensor.unit;

  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">
        -- {unit}
      </span>
    </div>
  );
}
