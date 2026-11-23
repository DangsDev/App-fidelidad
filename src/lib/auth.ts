import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import { PROFILE_COLUMNS, ROLE_HOME, toSessionProfile, type SessionProfile } from '@/lib/profile';

export { ROLE_HOME, ROLE_LABEL } from '@/lib/profile';
export type { SessionProfile } from '@/lib/profile';

/**
 * Perfil del usuario autenticado, o null si no hay sesión, no hay perfil o está inactivo.
 * Usa auth.getUser() (valida el token contra el servidor), NUNCA getSession().
 */
export const getSessionProfile = cache(async (): Promise<SessionProfile | null> => {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  if (error) return null;

  const profile = toSessionProfile(data);
  if (!profile || !profile.isActive) return null;
  return profile;
});

/**
 * Barrera real de acceso en los layouts: el middleware es comodidad.
 * Sin sesión → /login. Rol equivocado → la pantalla de inicio de su rol.
 */
export async function requireRole(roles: readonly UserRole[]): Promise<SessionProfile> {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  if (!roles.includes(profile.role)) redirect(ROLE_HOME[profile.role]);
  return profile;
}
