import Link from 'next/link';
import { RegisterForm } from './register-form';

export default function RegistroPage() {
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-stone-900">Crear cuenta</h1>
        <p className="text-sm text-stone-600">
          Regístrate para acumular puntos en tus compras. Te pediremos verificar tu correo.
        </p>
      </div>

      <RegisterForm />

      <Link
        href="/login"
        className="flex min-h-touch items-center justify-center rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100"
      >
        Ya tengo cuenta
      </Link>
    </div>
  );
}
