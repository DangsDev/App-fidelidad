import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { UserRole } from '@/types/database';
import { PROFILE_COLUMNS, ROLE_HOME, toSessionProfile } from '@/lib/profile';

type CookieToSet = { name: string; value: string; options: CookieOptions };

const HOME_PATHS = new Set(['/', '/login', '/registro', '/recuperar']);

/** Rutas internas protegidas y los roles que pueden entrar. */
const GUARDED_AREAS: { base: string; roles: readonly UserRole[] }[] = [
  { base: '/admin', roles: ['admin'] },
  { base: '/staff', roles: ['employee', 'admin'] },
  { base: '/app', roles: ['customer'] },
];

function isUnder(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Patrón getAll/setAll de @supabase/ssr: conserva y refresca las cookies de sesión.
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list: CookieToSet[]) => {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  /** Redirige arrastrando las cookies ya refrescadas (si no, se perdería la sesión). */
  const redirectTo = (target: string) => {
    const url = request.nextUrl.clone();
    const [pathname, query] = target.split('?');
    url.pathname = pathname;
    url.search = query ? `?${query}` : '';
    const redirectResponse = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirectResponse.cookies.set(cookie));
    return redirectResponse;
  };

  const { pathname, search } = request.nextUrl;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Enlaces de correo y restablecimiento: solo se refresca la sesión; no dependen del rol.
  if (isUnder(pathname, '/auth') || isUnder(pathname, '/restablecer')) {
    return response;
  }

  if (!user) {
    const guarded = GUARDED_AREAS.find((area) => isUnder(pathname, area.base));
    if (guarded) {
      return redirectTo(`/login?next=${encodeURIComponent(pathname + search)}`);
    }
    if (pathname === '/') return redirectTo('/login');
    return response;
  }

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', user.id)
    .maybeSingle();

  // Si la consulta falla (red), se deja pasar: los layouts vuelven a validar el rol.
  if (error) return response;

  const profile = toSessionProfile(data);

  if (!profile || !profile.isActive) {
    await supabase.auth.signOut();
    return redirectTo('/login?error=inactive');
  }

  // Ya autenticado en una pantalla de entrada → a la de su rol.
  if (HOME_PATHS.has(pathname)) {
    return redirectTo(ROLE_HOME[profile.role]);
  }

  // Área protegida de otro rol → a la de su rol.
  for (const area of GUARDED_AREAS) {
    if (isUnder(pathname, area.base) && !area.roles.includes(profile.role)) {
      return redirectTo(ROLE_HOME[profile.role]);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/|images/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|map|txt|woff|woff2)$).*)',
  ],
};
