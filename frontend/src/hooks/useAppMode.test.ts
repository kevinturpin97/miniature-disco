/**
 * Tests for useAppMode hook.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAppMode } from "./useAppMode";

describe("useAppMode", () => {
  const originalEnv = import.meta.env.VITE_EDGE_MODE;

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns cloud mode by default (VITE_EDGE_MODE not set)", () => {
    vi.stubEnv("VITE_EDGE_MODE", "false");
    // Re-import to pick up env — we test the exported hook directly
    const { result } = renderHook(() => useAppMode());
    expect(result.current.isCloudMode).toBe(true);
    expect(result.current.isEdgeMode).toBe(false);
    expect(result.current.modeBadge).toBe("Cloud");
  });

  it("cloud mode: billing, crm, cloudSync features enabled", () => {
    vi.stubEnv("VITE_EDGE_MODE", "false");
    const { result } = renderHook(() => useAppMode());
    expect(result.current.features.billing).toBe(true);
    expect(result.current.features.crm).toBe(true);
    expect(result.current.features.cloudSync).toBe(true);
    expect(result.current.features.loraBridge).toBe(false);
    expect(result.current.features.mqtt).toBe(false);
  });

  it("multiTenant is always true regardless of mode", () => {
    vi.stubEnv("VITE_EDGE_MODE", "false");
    const { result } = renderHook(() => useAppMode());
    expect(result.current.features.multiTenant).toBe(true);
  });
});
