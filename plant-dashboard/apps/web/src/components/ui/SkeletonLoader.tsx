import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(...args));

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        'rounded-lg bg-white/5 overflow-hidden relative',
        className
      )}
    >
      <div
        className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
        style={{
          background:
            'linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)',
        }}
      />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] p-5 flex flex-col gap-4">
      <Skeleton className="h-5 w-2/3" />
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-4/5" />
    </div>
  );
}

export function PlantCardSkeleton() {
  return (
    <div className="rounded-2xl bg-white/[0.04] border border-white/[0.08] overflow-hidden">
      <Skeleton className="h-48 w-full rounded-none" />
      <div className="p-4 flex flex-col gap-3">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </div>
  );
}
