'use client';

import { useActionState, useState } from 'react';
import { requestPasswordReset } from '@/app/(auth)/actions';
import { Alert } from '@/components/alert';
import { Field } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { EMPTY_FORM_STATE } from '@/lib/form-state';

export function RequestResetForm() {
  const [state, formAction] = useActionState(requestPasswordReset, EMPTY_FORM_STATE);
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert kind="success">{state.message}</Alert> : null}

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

      <SubmitButton label="Enviar enlace" pendingLabel="Enviando…" />
    </form>
  );
}
