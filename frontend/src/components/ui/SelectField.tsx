/**
 * Reusable select field wrapper with label and error display.
 */

import { cn } from "@/utils/cn";

interface SelectOption {
  value: string;
  label: string;
}

interface SelectFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  error?: string;
  placeholder?: string;
  id?: string;
}

export function SelectField({ label, value, onChange, options, error, placeholder, id }: SelectFieldProps) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-foreground/80">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(
          "w-full rounded-lg border bg-background px-3 py-2 text-sm text-foreground transition-colors focus:outline-none focus:ring-2 focus:ring-ring",
          error ? "border-destructive" : "border-input"
        )}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
