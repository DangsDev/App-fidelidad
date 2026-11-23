import { redirect } from 'next/navigation';
import { getSessionProfile, ROLE_HOME } from '@/lib/auth';

/** La raíz lleva a la pantalla de inicio del rol (o a /login si no hay sesión). */
export default async function Home() {
  const profile = await getSessionProfile();
  if (!profile) redirect('/login');
  redirect(ROLE_HOME[profile.role]);
}
