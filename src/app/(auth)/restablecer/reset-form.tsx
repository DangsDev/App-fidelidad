'use client';

import { useActionState } from 'react';
import { resetPassword } from '@/app/(auth)/actions';
import { Alert } from '@/components/alert';
import { Field } from '@/components/field';
import { SubmitButton } from '@/components/submit-button';
import { EMPTY_FORM_STATE } from '@/lib/form-state';

export function ResetForm() {
  const [state, formAction] = useActionState(resetPassword, EMPTY_FORM_STATE);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.error ? <Alert>{state.error}</Alert> : null}

      <Field
        label="Nueva contraseña"
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

      <SubmitButton label="Guardar contraseña" pendingLabel="Guardando…" />
    </form>
  );
}
