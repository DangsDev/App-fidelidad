/** Estado compartido por los formularios con `useActionState` (React 19). */
export type FormState = {
  /** Error para mostrar (mensaje en español, nunca técnico). */
  error?: string;
  /** Mensaje de éxito o informativo. */
  message?: string;
  /** Se devuelve para no borrar lo que la persona ya escribió. */
  email?: string;
  fullName?: string;
};

export const EMPTY_FORM_STATE: FormState = {};
