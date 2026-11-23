/**
 * Tipos mínimos escritos a mano para el módulo 0.
 * Cuando tengas tu proyecto, genera los reales (sustituyen a este archivo):
 *   npx supabase gen types typescript --project-id TU_ID > src/types/database.ts
 */
export type UserRole = 'admin' | 'employee' | 'customer';
export type OperationStatus = 'completed' | 'voided';
export type PointsTxType =
  | 'purchase_earn' | 'purchase_payment' | 'redemption'
  | 'admin_adjust_positive' | 'admin_adjust_negative' | 'reversal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
