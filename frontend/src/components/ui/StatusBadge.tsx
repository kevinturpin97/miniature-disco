/**
 * Status badge component for online/offline indicators.
 */

interface StatusBadgeProps {
  online: boolean;
  className?: string;
}

export function StatusBadge({ online, className = "" }: StatusBadgeProps) {
  return (
    <span className={`badge ${online ? "badge-success" : "badge-error"} gap-1.5 ${className}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-success" : "bg-error"}`} />
      {online ? "Online" : "Offline"}
    </span>
  );
}
