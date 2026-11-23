import type { InputHTMLAttributes } from 'react';

type FieldProps = {
  label: string;
  name: string;
  hint?: string;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'name' | 'className'>;

/** Etiqueta + input accesibles, con altura táctil mínima de 48 px. */
export function Field({ label, name, hint, ...inputProps }: FieldProps) {
  const id = `field-${name}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-stone-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-describedby={hintId}
        className="min-h-touch w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-200"
        {...inputProps}
      />
      {hint ? (
        <p id={hintId} className="text-xs text-stone-500">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
