import type { ReactNode } from 'react';

type AlertKind = 'error' | 'success' | 'info';

const STYLES: Record<AlertKind, string> = {
  error: 'border-berry-100 bg-berry-50 text-berry-700',
  success: 'border-leaf-500/30 bg-leaf-100 text-[#365530]',
  info: 'border-brand-100 bg-brand-50 text-brand-900',
};

const TITLES: Record<AlertKind, string> = {
  error: 'No se pudo completar',
  success: 'Listo',
  info: 'Información',
};

/** Mensaje para la persona usuaria. `error` usa role="alert"; el resto, role="status". */
export function Alert({ kind = 'error', children }: { kind?: AlertKind; children: ReactNode }) {
  return (
    <div
      role={kind === 'error' ? 'alert' : 'status'}
      className={`rounded-lg border px-3 py-2 text-sm leading-relaxed ${STYLES[kind]}`}
    >
      <span className="sr-only">{TITLES[kind]}: </span>
      {children}
    </div>
  );
}
