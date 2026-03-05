import { describe, it, expect } from "vitest";
import {
  lttbDownsample,
  BIG_DATA_THRESHOLD,
  BIG_DATA_TARGET_POINTS,
  type TimeSeriesPoint,
} from "../downsample";

describe("lttbDownsample", () => {
  it("returns input unchanged when length <= targetPoints", () => {
    const data: TimeSeriesPoint[] = [
      { timestamp: 0, value: 1 },
      { timestamp: 1, value: 2 },
      { timestamp: 2, value: 3 },
    ];
    expect(lttbDownsample(data, 10)).toEqual(data);
  });

  it("returns input unchanged when targetPoints < 3", () => {
    const data: TimeSeriesPoint[] = Array.from({ length: 100 }, (_, i) => ({
      timestamp: i,
      value: i,
    }));
    expect(lttbDownsample(data, 2)).toEqual(data);
  });

  it("returns empty array for empty input", () => {
    expect(lttbDownsample([], 10)).toEqual([]);
  });

  it("returns single point unchanged", () => {
    const data: TimeSeriesPoint[] = [{ timestamp: 0, value: 5 }];
    expect(lttbDownsample(data, 10)).toEqual(data);
  });

  it("always preserves first and last points", () => {
    const data: TimeSeriesPoint[] = Array.from({ length: 200 }, (_, i) => ({
      timestamp: i,
      value: Math.random() * 100,
    }));
    const result = lttbDownsample(data, 20);
    expect(result[0]).toBe(data[0]);
    expect(result[result.length - 1]).toBe(data[data.length - 1]);
  });

  it("output length equals targetPoints", () => {
    const data: TimeSeriesPoint[] = Array.from({ length: 1000 }, (_, i) => ({
      timestamp: i,
      value: i,
    }));
    const result = lttbDownsample(data, 50);
    expect(result).toHaveLength(50);
  });

  it("timestamps are monotonically increasing", () => {
    const data: TimeSeriesPoint[] = Array.from({ length: 500 }, (_, i) => ({
      timestamp: i,
      value: i ** 2,
    }));
    const result = lttbDownsample(data, 30);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].timestamp).toBeGreaterThan(result[i - 1].timestamp);
    }
  });

  it("preserves extra properties on data points", () => {
    const data = Array.from({ length: 100 }, (_, i) => ({
      timestamp: i,
      value: i,
      sensor_id: 42,
      label: "temp",
    }));
    const result = lttbDownsample(data, 10);
    for (const point of result) {
      expect(point.sensor_id).toBe(42);
      expect(point.label).toBe("temp");
    }
  });

  it("preserves peaks and troughs of a sine wave", () => {
    const n = 1000;
    const data: TimeSeriesPoint[] = Array.from({ length: n }, (_, i) => ({
      timestamp: i,
      value: Math.sin((2 * Math.PI * i) / 100),
    }));
    const result = lttbDownsample(data, 50);
    const values = result.map((p) => p.value);
    expect(Math.max(...values)).toBeGreaterThan(0.9);
    expect(Math.min(...values)).toBeLessThan(-0.9);
  });

  it("handles large dataset (10000 -> 100)", () => {
    const data: TimeSeriesPoint[] = Array.from({ length: 10000 }, (_, i) => ({
      timestamp: i,
      value: i % 50,
    }));
    const result = lttbDownsample(data, 100);
    expect(result).toHaveLength(100);
    expect(result[0].timestamp).toBe(0);
    expect(result[result.length - 1].timestamp).toBe(9999);
  });
});

describe("constants", () => {
  it("exports BIG_DATA_THRESHOLD as 500", () => {
    expect(BIG_DATA_THRESHOLD).toBe(500);
  });

  it("exports BIG_DATA_TARGET_POINTS as 300", () => {
    expect(BIG_DATA_TARGET_POINTS).toBe(300);
  });
});
