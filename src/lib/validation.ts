/**
 * Validaciones puras (sin dependencias) para formularios de autenticación.
 * Se ejecutan tanto en el cliente como en el servidor: el servidor SIEMPRE vuelve a validar.
 */

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
export const FULL_NAME_MIN_LENGTH = 2;
export const FULL_NAME_MAX_LENGTH = 120;

const EMAIL_RE = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const UNSAFE_NEXT_RE = /[\\\u0000-\u001f\u007f]/;

/** Correo con forma válida (no confirma que exista). */
export function isEmail(value: string): boolean {
  const email = value.trim();
  if (email.length < 6 || email.length > 254) return false;
  if (!EMAIL_RE.test(email)) return false;
  const at = email.lastIndexOf('@');
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (local.length > 64 || local.startsWith('.') || local.endsWith('.') || local.includes('..')) {
    return false;
  }
  if (domain.length > 253 || domain.startsWith('.') || domain.endsWith('.') || domain.includes('..')) {
    return false;
  }
  const tld = domain.slice(domain.lastIndexOf('.') + 1);
  return /^[a-z]{2,63}$/i.test(tld);
}

/**
 * Ruta interna segura para `?next=`. Solo acepta rutas absolutas del propio sitio:
 * empiezan con "/", no con "//" (otro host), sin "\" ni caracteres de control/saltos de línea.
 * Evita redirecciones abiertas.
 */
export function safeNext(value: string | null | undefined, fallback = '/'): string {
  if (typeof value !== 'string') return fallback;
  if (UNSAFE_NEXT_RE.test(value)) return fallback;
  const next = value.trim();
  if (next.length === 0 || next.length > 2048) return fallback;
  if (!next.startsWith('/')) return fallback;
  if (next.startsWith('//')) return fallback;
  return next;
}

/** Devuelve el mensaje de error en español o null si la contraseña es válida. */
export function validatePassword(value: string): string | null {
  if (value.length < PASSWORD_MIN_LENGTH) {
    return `La contraseña debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`;
  }
  if (new TextEncoder().encode(value).length > PASSWORD_MAX_BYTES) {
    return `La contraseña es demasiado larga (máximo ${PASSWORD_MAX_BYTES} caracteres).`;
  }
  return null;
}

/** Normaliza espacios (varios seguidos → uno, sin extremos). */
export function normalizeFullName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/** Devuelve el mensaje de error en español o null si el nombre es válido. */
export function validateFullName(value: string): string | null {
  const name = normalizeFullName(value);
  if (name.length < FULL_NAME_MIN_LENGTH || name.length > FULL_NAME_MAX_LENGTH) {
    return `Escribe tu nombre (entre ${FULL_NAME_MIN_LENGTH} y ${FULL_NAME_MAX_LENGTH} caracteres).`;
  }
  return null;
}

export function isUserRole(value: unknown): value is 'admin' | 'employee' | 'customer' {
  return value === 'admin' || value === 'employee' || value === 'customer';
}
