/**
 * Status badge component for online/offline indicators.
 */

import { cn } from "@/utils/cn";

interface StatusBadgeProps {
  online: boolean;
  className?: string;
}

export function StatusBadge({ online, className }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        online
          ? "bg-success/10 text-success"
          : "bg-destructive/10 text-destructive",
        className
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          online ? "bg-success" : "bg-destructive"
        )}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
