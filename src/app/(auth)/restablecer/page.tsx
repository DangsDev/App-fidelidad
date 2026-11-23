import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ResetForm } from './reset-form';

export default async function RestablecerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // El enlace de recuperación abre sesión; sin sesión el enlace no es válido o expiró.
  if (!user) redirect('/recuperar?error=expired');

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-stone-900">Nueva contraseña</h1>
        <p className="text-sm text-stone-600">Elige una contraseña nueva para tu cuenta.</p>
      </div>

      <ResetForm />
    </div>
  );
}
