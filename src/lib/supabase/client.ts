import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/database';

/** Cliente para componentes de navegador. Usa solo la clave anónima; la seguridad real es RLS + RPC. */
export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
