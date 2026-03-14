/**
 * useAppMode — exposes runtime app mode based on VITE_EDGE_MODE env variable.
 *
 * Edge mode: Raspberry Pi local deployment (LoRa bridge, MQTT visible).
 * Cloud mode: SaaS multi-tenant platform (CRM, Sync visible).
 */

const EDGE_MODE = import.meta.env.VITE_EDGE_MODE === "true";

export interface AppFeatures {
  loraBridge: boolean;
  mqtt: boolean;
  crm: boolean;
  cloudSync: boolean;
  billing: boolean;
  fleet: boolean;
  multiTenant: boolean;
}

export interface AppMode {
  isEdgeMode: boolean;
  isCloudMode: boolean;
  features: AppFeatures;
  modeBadge: string;
}

export function useAppMode(): AppMode {
  const isEdgeMode = EDGE_MODE;
  const isCloudMode = !EDGE_MODE;

  const features: AppFeatures = {
    loraBridge: isEdgeMode,
    mqtt: isEdgeMode,
    crm: isCloudMode,
    cloudSync: isCloudMode,
    billing: isCloudMode,
    fleet: isCloudMode,
    multiTenant: true, // available in both modes
  };

  const modeBadge = isEdgeMode ? "Edge" : "Cloud";

  return { isEdgeMode, isCloudMode, features, modeBadge };
}
