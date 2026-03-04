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
      <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300">
        {label}
      </label>
      {children}
      {error && <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
