'use client';

import { useActionState, useState } from 'react';
import { login } from '@/app/(auth)/actions';
import { Alert } from '@/components/alert';
import { Field } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { EMPTY_FORM_STATE } from '@/lib/form-state';

export function LoginForm({ next }: { next: string }) {
  const [state, formAction] = useActionState(login, EMPTY_FORM_STATE);
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}

      <input type="hidden" name="next" value={next} />

      <Field
        label="Correo"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="tu@correo.com"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="current-password"
        required
      />

      <SubmitButton label="Entrar" pendingLabel="Entrando…" />
    </form>
  );
}
