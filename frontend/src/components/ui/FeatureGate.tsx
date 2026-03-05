/**
 * FeatureGate — conditionally renders children based on app mode features.
 *
 * Usage:
 *   <FeatureGate feature="loraBridge">
 *     <LoRaBridgePanel />
 *   </FeatureGate>
 */

import { useAppMode } from "@/hooks/useAppMode";
import type { AppFeatures } from "@/hooks/useAppMode";

interface FeatureGateProps {
  feature: keyof AppFeatures;
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export function FeatureGate({ feature, children, fallback = null }: FeatureGateProps) {
  const { features } = useAppMode();

  if (!features[feature]) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}
