import 'server-only';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Cliente con service role: IGNORA RLS. Solo para código de servidor y únicamente
 * después de verificar que el usuario autenticado es administrador (p. ej. invitar trabajadores).
 * `server-only` hace fallar el build si alguien lo importa desde un componente de navegador.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.');
  return createSupabaseClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
