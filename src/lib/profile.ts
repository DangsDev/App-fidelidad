import type { UserRole } from '@/types/database';
import { isUserRole } from '@/lib/validation';

/** Pantalla de inicio de cada rol. */
export const ROLE_HOME: Record<UserRole, string> = {
  admin: '/admin',
  employee: '/staff',
  customer: '/app',
};

/** Etiqueta en español para mostrar el rol. */
export const ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Administrador',
  employee: 'Trabajador',
  customer: 'Cliente',
};

export type SessionProfile = {
  id: string;
  fullName: string;
  email: string;
  role: UserRole;
  isActive: boolean;
};

/** Fila de public.profiles tal como la leen el middleware y los helpers de servidor. */
export type ProfileRow = {
  id: string;
  full_name: string;
  email: string;
  role: string;
  is_active: boolean;
};

export const PROFILE_COLUMNS = 'id, full_name, email, role, is_active';

/**
 * Convierte una fila de la base de datos en un perfil validado.
 * Defensa contra datos inesperados: rol desconocido o fila incompleta → null.
 */
export function toSessionProfile(row: unknown): SessionProfile | null {
  if (!row || typeof row !== 'object') return null;
  const r = row as Partial<ProfileRow>;
  if (typeof r.id !== 'string' || typeof r.full_name !== 'string' || !isUserRole(r.role)) return null;
  if (typeof r.is_active !== 'boolean') return null;
  return {
    id: r.id,
    fullName: r.full_name,
    email: typeof r.email === 'string' ? r.email : '',
    role: r.role,
    isActive: r.is_active,
  };
}
