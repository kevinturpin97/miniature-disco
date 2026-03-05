/**
 * Largest Triangle Three Buckets (LTTB) downsampling algorithm.
 *
 * Reduces a large time-series dataset to a target number of points
 * while preserving the visual shape of the data. This is the
 * client-side TypeScript implementation mirroring the Python version
 * in ``backend/apps/iot/data_pipeline.py``.
 */

export interface TimeSeriesPoint {
  timestamp: number;
  value: number;
  /** Preserve any extra fields from the original data point. */
  [key: string]: unknown;
}

/**
 * Downsample a time-series array using the LTTB algorithm.
 *
 * @param data - Array of points with numeric ``timestamp`` and ``value``.
 * @param targetPoints - Desired number of output points (minimum 3).
 * @returns Downsampled array preserving visual shape.
 */
export function lttbDownsample<T extends TimeSeriesPoint>(
  data: T[],
  targetPoints: number,
): T[] {
  const n = data.length;
  if (n <= targetPoints || targetPoints < 3) {
    return data;
  }

  const sampled: T[] = [data[0]];

  const bucketSize = (n - 2) / (targetPoints - 2);

  let aIndex = 0;

  for (let i = 1; i < targetPoints - 1; i++) {
    const bucketStart = Math.floor((i - 1) * bucketSize) + 1;
    const bucketEnd = Math.min(Math.floor(i * bucketSize) + 1, n - 1);

    // Calculate next bucket average
    const nextBucketStart = Math.floor(i * bucketSize) + 1;
    const nextBucketEnd = Math.min(
      Math.floor((i + 1) * bucketSize) + 1,
      n,
    );

    let avgX = 0;
    let avgY = 0;
    const nextCount = nextBucketEnd - nextBucketStart;
    if (nextCount > 0) {
      for (let j = nextBucketStart; j < nextBucketEnd; j++) {
        avgX += data[j].timestamp;
        avgY += data[j].value;
      }
      avgX /= nextCount;
      avgY /= nextCount;
    }

    // Find point with largest triangle area in current bucket
    let maxArea = -1;
    let maxIndex = bucketStart;

    const pointAX = data[aIndex].timestamp;
    const pointAY = data[aIndex].value;

    for (let j = bucketStart; j < bucketEnd; j++) {
      const area =
        Math.abs(
          (pointAX - avgX) * (data[j].value - pointAY) -
            (pointAX - data[j].timestamp) * (avgY - pointAY),
        ) * 0.5;

      if (area > maxArea) {
        maxArea = area;
        maxIndex = j;
      }
    }

    sampled.push(data[maxIndex]);
    aIndex = maxIndex;
  }

  sampled.push(data[n - 1]);
  return sampled;
}

/** Default threshold above which downsampling is applied. */
export const BIG_DATA_THRESHOLD = 500;

/** Default number of target points after downsampling. */
export const BIG_DATA_TARGET_POINTS = 300;
