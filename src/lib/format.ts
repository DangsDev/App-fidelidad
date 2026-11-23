import type { PointsTxType } from '@/types/database';

/** Etiqueta en español para cada tipo de movimiento de puntos. */
export const MOVEMENT_LABELS: Record<PointsTxType, string> = {
  purchase_earn: 'Compra',
  purchase_payment: 'Pago con puntos',
  redemption: 'Canje',
  admin_adjust_positive: 'Ajuste a tu favor',
  admin_adjust_negative: 'Ajuste',
  reversal: 'Anulación',
};

export function movementLabel(type: string): string {
  return (MOVEMENT_LABELS as Record<string, string>)[type] ?? 'Movimiento';
}

/** Puntos con signo explícito (no se depende del color): "+15", "−10". */
export function formatSignedPoints(points: number): string {
  const abs = Math.abs(points);
  return points < 0 ? `\u2212${abs}` : `+${abs}`;
}

const DATE_TIME = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

/** Fecha y hora en la zona del negocio (America/Mexico_City). */
export function formatDateTime(value: string | Date): string {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return 'Fecha no disponible';
  return DATE_TIME.format(date);
}
