/**
 * Las funciones SQL devuelven un mensaje en español (para mostrar) y un código estable en
 * `details` (para decidir la UI), p. ej. 'insufficient_points', 'email_not_verified'.
 */
export type RpcError = { code: string; message: string };

const FALLBACK = 'No se pudo completar la operación. Inténtalo de nuevo.';

export function toRpcError(error: { message?: string; details?: string | null; code?: string } | null): RpcError | null {
  if (!error) return null;
  // Errores de negocio (P0001) y de permisos (42501) traen mensaje seguro y en español.
  const isBusiness = error.code === 'P0001' || error.code === '42501';
  if (isBusiness && error.message) {
    return { code: error.details || (error.code === '42501' ? 'forbidden' : 'error'), message: error.message };
  }
  // Cualquier otro error (red, SQL inesperado) no se muestra crudo al usuario.
  return { code: 'unexpected', message: FALLBACK };
}
