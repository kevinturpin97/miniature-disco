/**
 * Reusable loading spinner.
 */

interface SpinnerProps {
  className?: string;
}

export function Spinner({ className = "" }: SpinnerProps) {
  return <span className={`loading loading-spinner text-primary ${className}`} />;
}
