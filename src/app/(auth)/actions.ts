'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/site-url';
import type { FormState } from '@/lib/form-state';
import { isEmail, normalizeFullName, safeNext, validateFullName, validatePassword } from '@/lib/validation';

const LOGIN_ERROR = 'Correo o contraseña incorrectos.';
const WEAK_PASSWORD_ERROR =
  'La contraseña es demasiado débil. Usa al menos 8 caracteres, combinando letras y números.';
const RATE_LIMIT_ERROR = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
const RESET_MESSAGE =
  'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña. Revisa tu bandeja de entrada y la carpeta de spam.';

type AuthErrorLike = { code?: string; status?: number; message?: string } | null;

function readText(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value : '';
}

function isRateLimited(error: AuthErrorLike): boolean {
  return error?.status === 429 || error?.code === 'over_email_send_rate_limit' || error?.code === 'over_request_rate_limit';
}

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = readText(formData, 'email').trim().toLowerCase();
  const password = readText(formData, 'password');
  const next = safeNext(readText(formData, 'next'));

  if (!email || !password) {
    return { error: 'Escribe tu correo y tu contraseña.', email };
  }
  if (!isEmail(email)) {
    return { error: 'Escribe un correo válido.', email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.code === 'email_not_confirmed') {
      return {
        error:
          'Tu correo aún no está verificado. Abre el enlace que te enviamos (revisa también la carpeta de spam) y vuelve a intentarlo.',
        email,
      };
    }
    if (isRateLimited(error)) {
      return { error: RATE_LIMIT_ERROR, email };
    }
    return { error: LOGIN_ERROR, email };
  }

  redirect(next);
}

export async function register(_prevState: FormState, formData: FormData): Promise<FormState> {
  const fullName = normalizeFullName(readText(formData, 'full_name'));
  const email = readText(formData, 'email').trim().toLowerCase();
  const password = readText(formData, 'password');
  const confirm = readText(formData, 'confirm');

  const nameError = validateFullName(fullName);
  if (nameError) return { error: nameError, email, fullName };
  if (!isEmail(email)) return { error: 'Escribe un correo válido.', email, fullName };
  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError, email, fullName };
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.', email, fullName };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    // El rol NUNCA se envía: lo fija el trigger de la base de datos en 'customer'.
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${siteUrl}/auth/callback?next=/app`,
    },
  });

  // Respuesta siempre idéntica exista o no la cuenta (no revelar correos registrados).
  const sentMessage = `Te enviamos un correo a ${email} para verificar tu cuenta. Abre el enlace y después inicia sesión. Si no lo ves, revisa la carpeta de spam.`;

  if (error) {
    if (error.code === 'weak_password') return { error: WEAK_PASSWORD_ERROR, email, fullName };
    if (isRateLimited(error)) return { error: RATE_LIMIT_ERROR, email, fullName };
    if (error.code === 'email_exists' || error.code === 'user_already_exists') {
      return { message: sentMessage, email, fullName };
    }
    return { error: 'No pudimos crear tu cuenta. Inténtalo de nuevo.', email, fullName };
  }

  // Con "Confirm email" activado no hay sesión: falta verificar el correo.
  if (data.session) redirect('/app');
  return { message: sentMessage, email, fullName };
}

export async function requestPasswordReset(_prevState: FormState, formData: FormData): Promise<FormState> {
  const email = readText(formData, 'email').trim().toLowerCase();

  if (!email) return { error: 'Escribe tu correo.', email };
  if (!isEmail(email)) return { error: 'Escribe un correo válido.', email };

  const supabase = await createClient();
  const siteUrl = await getSiteUrl();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/restablecer`,
  });

  // Mismo mensaje siempre: no se revela si el correo existe ni si se alcanzó el límite.
  return { message: RESET_MESSAGE, email };
}

export async function resetPassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const password = readText(formData, 'password');
  const confirm = readText(formData, 'confirm');

  const passwordError = validatePassword(password);
  if (passwordError) return { error: passwordError };
  if (password !== confirm) return { error: 'Las contraseñas no coinciden.' };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/recuperar?error=expired');

  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === 'same_password') {
      return { error: 'La nueva contraseña debe ser distinta a la actual.' };
    }
    if (error.code === 'weak_password') return { error: WEAK_PASSWORD_ERROR };
    return { error: 'No pudimos actualizar tu contraseña. Inténtalo de nuevo.' };
  }

  // La sesión sigue activa; "/" lleva a la pantalla de inicio según el rol.
  redirect('/');
}

export async function logout(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
