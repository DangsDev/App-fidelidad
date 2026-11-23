import { BrandMark } from '@/components/brand-mark';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <div className="mb-5 flex items-center justify-center gap-3">
        <BrandMark size={68} />
        <div><p className="font-serif text-2xl font-bold tracking-tight text-brand-900">Aquelarre</p><p className="text-sm text-stone-600">Programa de puntos</p></div>
      </div>
      <div className="rounded-3xl border border-brand-100 bg-white/95 p-6 shadow-[0_16px_50px_-30px_rgba(76,28,104,0.42)]">{children}</div>
      <p className="mt-6 text-center text-xs text-stone-500">Fresas con crema y postres</p>
    </main>
  );
}
