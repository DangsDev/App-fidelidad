import Link from 'next/link';
import { Alert } from '@/components/alert';
import { safeNext } from '@/lib/validation';
import { LoginForm } from './login-form';

type LoginSearchParams = {
  next?: string;
  error?: string;
};

const NOTICES: Record<string, string> = {
  inactive: 'Tu cuenta está desactivada. Contacta al negocio para más información.',
  link: 'El enlace no es válido o ya expiró. Solicita uno nuevo.',
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<LoginSearchParams> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const notice = params.error ? NOTICES[params.error] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-stone-900">Entrar</h1>
        <p className="text-sm text-stone-600">Accede a tu cuenta para ver tus puntos y recompensas.</p>
      </div>

      {notice ? <Alert kind="error">{notice}</Alert> : null}

      <LoginForm next={next} />

      <div className="flex flex-col gap-2 border-t border-stone-200 pt-4 text-sm">
        <Link
          href="/registro"
          className="flex min-h-touch items-center justify-center rounded-lg border border-stone-300 px-4 font-medium text-stone-700 transition hover:bg-stone-100"
        >
          Crear cuenta
        </Link>
        <Link
          href="/recuperar"
          className="flex min-h-touch items-center justify-center rounded-lg px-4 font-medium text-brand-700 underline-offset-4 hover:underline"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </div>
    </div>
  );
}
