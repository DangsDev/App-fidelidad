import 'server-only';
import { headers } from 'next/headers';

/**
 * URL pública de la app para los enlaces que envía Supabase.
 * Prioriza NEXT_PUBLIC_SITE_URL; si no está, la deduce de la petición actual.
 */
export async function getSiteUrl(): Promise<string> {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');

  const headerList = await headers();
  const host = headerList.get('x-forwarded-host') ?? headerList.get('host');
  if (!host) return 'http://localhost:3000';

  const proto =
    headerList.get('x-forwarded-proto') ??
    (host.startsWith('localhost') || host.startsWith('127.0.0.1') ? 'http' : 'https');
  return `${proto}://${host}`;
}
