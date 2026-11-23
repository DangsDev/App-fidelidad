import QRCode from 'qrcode';
import { Alert } from '@/components/alert';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatSignedPoints, movementLabel } from '@/lib/format';
import { requireRole } from '@/lib/auth';

type Row = Record<string, any>;

export default async function CustomerHomePage() {
  const session = await requireRole(['customer']);
  const supabase = await createClient();
  const [{ data: profile }, { data: transactions, error: txError }, { data: rewards, error: rewardsError }] =
    await Promise.all([
      supabase.from('profiles').select('qr_token, points_balance').eq('id', session.id).maybeSingle(),
      supabase.from('points_transactions').select('id, points, type, note, created_at').eq('customer_id', session.id).order('created_at', { ascending: false }).limit(20),
      supabase.from('rewards').select('id, name, description, points_cost, stock').eq('is_active', true).order('points_cost').limit(12),
    ]);

  const qr = profile?.qr_token ? await QRCode.toDataURL(profile.qr_token, { width: 280, margin: 2, errorCorrectionLevel: 'M' }) : null;
  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-brand-700 p-5 text-white shadow-[0_18px_45px_-24px_rgba(76,28,104,0.65)]">
        <p className="text-sm text-brand-100">Tu saldo disponible</p>
        <p className="mt-1 text-4xl font-bold">{profile?.points_balance ?? 0} <span className="text-xl font-medium">puntos</span></p>
        <p className="mt-2 text-sm text-brand-100">Muestra tu código al personal para acumular o usar puntos.</p>
      </section>

      <section className="rounded-2xl border border-stone-200 bg-white p-5 text-center">
        <h2 className="font-serif text-lg font-semibold text-brand-900">Tu tarjeta QR</h2>
        {qr ? <img className="mx-auto mt-3 h-64 w-64" src={qr} alt="Código QR de tu tarjeta de cliente" /> : <Alert>No pudimos cargar tu tarjeta. Vuelve a intentarlo.</Alert>}
        <p className="text-sm text-stone-500">Este código identifica tu cuenta; solo el personal puede registrar operaciones.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-brand-900">Recompensas disponibles</h2>
        {rewardsError ? <Alert>No se pudieron cargar las recompensas.</Alert> : rewards?.length ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {(rewards as Row[]).map((reward) => (
              <article key={reward.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <h3 className="font-semibold">{reward.name}</h3>
                {reward.description ? <p className="mt-1 text-sm text-stone-600">{reward.description}</p> : null}
                <p className="mt-3 text-sm font-medium text-brand-700">{reward.points_cost} puntos {reward.stock === null ? '· sin límite de stock' : `· ${reward.stock} disponibles`}</p>
              </article>
            ))}
          </div>
        ) : <p className="rounded-xl bg-white p-4 text-sm text-stone-600">Aún no hay recompensas activas.</p>}
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-lg font-semibold text-brand-900">Actividad reciente</h2>
        {txError ? <Alert>No se pudo cargar tu historial.</Alert> : transactions?.length ? (
          <ol className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {(transactions as Row[]).map((tx) => (
              <li key={tx.id} className="flex items-center justify-between gap-4 p-4">
                <div><p className="font-medium">{movementLabel(tx.type)}</p><p className="text-xs text-stone-500">{formatDateTime(tx.created_at)}{tx.note ? ` · ${tx.note}` : ''}</p></div>
                <span className={`shrink-0 font-semibold ${tx.points > 0 ? 'text-leaf-700' : 'text-stone-700'}`}>{formatSignedPoints(tx.points)}</span>
              </li>
            ))}
          </ol>
        ) : <p className="rounded-xl bg-white p-4 text-sm text-stone-600">Tus movimientos aparecerán aquí.</p>}
      </section>
    </div>
  );
}
