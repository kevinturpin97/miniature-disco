/**
 * Status badge component for online/offline indicators.
 */

interface StatusBadgeProps {
  online: boolean;
  className?: string;
}

export function StatusBadge({ online, className = "" }: StatusBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
        online
          ? "bg-green-100 text-green-700"
          : "bg-red-100 text-red-700"
      } ${className}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          online ? "bg-green-500" : "bg-red-500"
        }`}
      />
      {online ? "Online" : "Offline"}
    </span>
  );
}
