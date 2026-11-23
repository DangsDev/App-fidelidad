/** Todos los importes viajan y se guardan en CENTAVOS (enteros). Estas funciones solo convierten para la UI. */

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

export function formatMXN(cents: number): string {
  return MXN.format(cents / 100);
}

/**
 * Convierte texto escrito por una persona ("155", "155.5", "1,234.50", "$99.90") a centavos.
 * Devuelve null si no es un importe válido: vacío, negativo, cero, con más de 2 decimales
 * o por encima del máximo permitido por la base de datos ($1,000,000.00).
 * Opera sobre el texto, sin flotantes, para evitar errores de precisión.
 */
export function parsePesosToCents(input: string): number | null {
  const clean = input.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  const m = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(clean);
  if (!m) return null;
  const cents = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  if (cents <= 0 || cents > 100_000_000) return null;
  return cents;
}

/** Solo para mostrar una vista previa inmediata; el servidor recalcula siempre (nunca se confía en esto). */
export function previewPoints(cashCents: number, centsPerPoint: number): number {
  return Math.floor(cashCents / centsPerPoint);
}
