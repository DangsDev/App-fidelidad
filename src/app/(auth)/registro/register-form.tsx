'use client';

import { useActionState, useState } from 'react';
import { register } from '@/app/(auth)/actions';
import { Alert } from '@/components/alert';
import { Field } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { EMPTY_FORM_STATE } from '@/lib/form-state';

export function RegisterForm() {
  const [state, formAction] = useActionState(register, EMPTY_FORM_STATE);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}
      {state.message ? <Alert kind="success">{state.message}</Alert> : null}

      <Field
        label="Nombre completo"
        name="full_name"
        type="text"
        autoComplete="name"
        placeholder="Ana López"
        required
        minLength={2}
        maxLength={120}
        value={fullName}
        onChange={(event) => setFullName(event.target.value)}
      />

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
        autoComplete="new-password"
        hint="Mínimo 8 caracteres."
        required
        minLength={8}
      />

      <Field
        label="Repite la contraseña"
        name="confirm"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
      />

      <SubmitButton label="Crear cuenta" pendingLabel="Creando cuenta…" />
    </form>
  );
}
