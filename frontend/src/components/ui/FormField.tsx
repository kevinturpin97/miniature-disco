/**
 * Reusable form field wrapper with label and error display.
 */

interface FormFieldProps {
  label: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export function FormField({ label, error, children, htmlFor }: FormFieldProps) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-base-content/80">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-error">{error}</p>}
    </div>
  );
}
