import type { ReactNode } from 'react';
import { logout } from '@/app/(auth)/actions';
import { ROLE_LABEL, type SessionProfile } from '@/lib/auth';
import { PwaControls } from '@/components/pwa-controls';
import { BrandMark } from '@/components/brand-mark';

/** Cabecera con la identidad del usuario y el botón "Salir". */
export function AppShell({ profile, children }: { profile: SessionProfile; children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-10 border-b border-brand-100 bg-cream-50/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <BrandMark size={44} />
            <div className="min-w-0">
              <p className="font-serif text-sm font-bold leading-tight text-brand-900">Aquelarre</p>
              <p className="truncate text-xs text-stone-600">{profile.fullName} · {ROLE_LABEL[profile.role]}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <PwaControls />
            <form action={logout}>
              <button
                type="submit"
                className="min-h-touch rounded-lg border border-stone-300 px-4 text-sm font-medium text-stone-700 transition hover:bg-stone-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
