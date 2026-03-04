/**
 * Skeleton loading placeholder component.
 */

import { clsx } from "clsx";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded-md bg-gray-200 dark:bg-gray-700",
        className,
      )}
    />
  );
}

/** Card-shaped skeleton for dashboard grids. */
export function SkeletonCard() {
  return (
    <div className="rounded-lg border bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
      <Skeleton className="mb-3 h-4 w-1/3" />
      <Skeleton className="mb-2 h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
