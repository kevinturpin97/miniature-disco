/**
 * Skeleton loading placeholder component.
 */

import { cn } from "@/utils/cn";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} />;
}

/** Card-shaped skeleton for dashboard grids. */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Skeleton className="mb-3 h-4 w-1/3" />
      <Skeleton className="mb-2 h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}
