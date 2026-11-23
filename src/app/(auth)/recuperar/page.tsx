import Link from 'next/link';
import { Alert } from '@/components/alert';
import { RequestResetForm } from './request-reset-form';

type RecuperarSearchParams = {
  error?: string;
};

export default async function RecuperarPage({ searchParams }: { searchParams: Promise<RecuperarSearchParams> }) {
  const params = await searchParams;
  const expired = params.error === 'expired';

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-stone-900">Recuperar contraseña</h1>
        <p className="text-sm text-stone-600">
          Escribe tu correo y te enviaremos un enlace para crear una nueva contraseña.
        </p>
      </div>

      {expired ? (
        <Alert kind="error">El enlace expiró o ya se usó. Solicita uno nuevo.</Alert>
      ) : null}

      <RequestResetForm />

      <Link
        href="/login"
        className="flex min-h-touch items-center justify-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
      >
        Volver a entrar
      </Link>
    </div>
  );
}
