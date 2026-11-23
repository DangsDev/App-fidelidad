'use client';

import { useCallback, useState } from 'react';
import { Alert } from '@/components/alert';
import { QrScanner } from '@/components/qr-scanner';
import { createClient } from '@/lib/supabase/client';
import { formatMXN, parsePesosToCents } from '@/lib/money';
import { toRpcError } from '@/lib/rpc-error';

type Branch = { id: string; name: string };
type Reward = { id: string; name: string; points_cost: number; stock: number | null };
type Customer = { id: string; full_name: string; points_balance: number; email_verified?: boolean; email_masked?: string };
type Preview = { points_redeemed: number; redeemed_cents: number; cash_cents: number; points_earned: number };

export function StaffConsole({ branches, rewards }: { branches: Branch[]; rewards: Reward[] }) {
  const supabase = createClient();
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<Customer[]>([]);
  const [token, setToken] = useState('');
  const [amount, setAmount] = useState('');
  const [points, setPoints] = useState('0');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [notice, setNotice] = useState<{ kind: 'error' | 'success' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);

  const lookupToken = useCallback(async (value: string) => {
    setScannerOpen(false); setNotice(null); setBusy(true);
    const { data, error } = await supabase.rpc('lookup_customer_by_qr', { p_token: value.trim() });
    setBusy(false);
    const parsed = toRpcError(error);
    if (parsed) { setNotice({ kind: 'error', text: parsed.message }); return; }
    setCustomer(data as Customer); setToken(value.trim()); setPreview(null); setNotice({ kind: 'success', text: 'Cliente identificado.' });
  }, [supabase]);

  async function searchCustomers(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null);
    if (query.trim().length < 3) { setNotice({ kind: 'info', text: 'Escribe al menos 3 caracteres para buscar.' }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('search_customers', { p_query: query.trim() });
    setBusy(false);
    const parsed = toRpcError(error);
    if (parsed) { setNotice({ kind: 'error', text: parsed.message }); return; }
    setMatches((data ?? []) as Customer[]);
  }

  async function createPreview(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setNotice(null); setPreview(null);
    if (!customer || !branchId) return;
    const cents = parsePesosToCents(amount);
    const pointsToUse = Number(points);
    if (!cents || !Number.isSafeInteger(pointsToUse) || pointsToUse < 0) { setNotice({ kind: 'error', text: 'Revisa el importe y los puntos.' }); return; }
    setBusy(true);
    const { data, error } = await supabase.rpc('preview_purchase', { p_branch_id: branchId, p_total_cents: cents, p_points_to_redeem: pointsToUse });
    setBusy(false);
    const parsed = toRpcError(error);
    if (parsed) { setNotice({ kind: 'error', text: parsed.message }); return; }
    setPreview(data as Preview);
  }

  async function registerPurchase() {
    if (!customer || !branchId || !preview) return;
    const cents = parsePesosToCents(amount); if (!cents) return;
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc('register_purchase', {
      p_customer_id: customer.id, p_branch_id: branchId, p_total_cents: cents,
      p_points_to_redeem: Number(points), p_client_request_id: crypto.randomUUID(),
    });
    setBusy(false);
    const parsed = toRpcError(error);
    if (parsed) { setNotice({ kind: 'error', text: parsed.message }); return; }
    const result = data as { balance: number; points_earned: number; cash_cents: number };
    setCustomer({ ...customer, points_balance: result.balance }); setPreview(null); setAmount(''); setPoints('0');
    setNotice({ kind: 'success', text: `Compra registrada. Ganó ${result.points_earned} puntos y su saldo es ${result.balance}. Pago en efectivo: ${formatMXN(result.cash_cents)}.` });
  }

  async function redeem(reward: Reward) {
    if (!customer || !branchId) return;
    if (!window.confirm(`¿Confirmas entregar “${reward.name}” por ${reward.points_cost} puntos?`)) return;
    setBusy(true); setNotice(null);
    const { data, error } = await supabase.rpc('redeem_reward', {
      p_customer_id: customer.id, p_reward_id: reward.id, p_branch_id: branchId, p_client_request_id: crypto.randomUUID(),
    });
    setBusy(false);
    const parsed = toRpcError(error);
    if (parsed) { setNotice({ kind: 'error', text: parsed.message }); return; }
    const result = data as { balance: number };
    setCustomer({ ...customer, points_balance: result.balance });
    setNotice({ kind: 'success', text: `Canje registrado: ${reward.name}. Saldo restante: ${result.balance} puntos.` });
  }

  return <div className="space-y-5">
    {notice ? <Alert kind={notice.kind}>{notice.text}</Alert> : null}
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <label className="text-sm font-medium" htmlFor="branch">Sucursal</label>
      <select id="branch" className="mt-1 min-h-touch w-full rounded-lg border border-stone-300 bg-white px-3" value={branchId} onChange={(e) => setBranchId(e.target.value)}>
        {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
      </select>
      {!branches.length ? <p className="mt-2 text-sm text-red-700">No tienes sucursales activas asignadas.</p> : null}
    </section>

    <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="font-semibold">Identificar cliente</h2>
      <div className="flex gap-2"><input aria-label="Código QR" value={token} onChange={(e) => setToken(e.target.value)} placeholder="Pega el código QR" className="min-h-touch min-w-0 flex-1 rounded-lg border border-stone-300 px-3" />
        <button type="button" disabled={busy} onClick={() => lookupToken(token)} className="min-h-touch rounded-lg bg-brand-600 px-4 font-medium text-white disabled:opacity-50">Buscar QR</button></div>
      <button type="button" disabled={busy} onClick={() => setScannerOpen(true)} className="min-h-touch w-full rounded-lg border border-stone-300 px-4 font-medium">Abrir cámara para escanear</button>
      <form onSubmit={searchCustomers} className="flex gap-2 border-t border-stone-100 pt-3">
        <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Buscar por nombre o correo" placeholder="Buscar por nombre o correo" className="min-h-touch min-w-0 flex-1 rounded-lg border border-stone-300 px-3" />
        <button disabled={busy} className="min-h-touch rounded-lg border border-stone-300 px-4 font-medium">Buscar</button>
      </form>
      {matches.length ? <ul className="divide-y rounded-lg border">{matches.map((match) => <li key={match.id} className="flex items-center justify-between gap-2 p-3 text-sm"><span>{match.full_name}<span className="block text-xs text-stone-500">{match.email_masked} · {match.points_balance} puntos</span></span><button type="button" onClick={() => { setCustomer(match); setMatches([]); setPreview(null); setNotice({ kind: 'info', text: 'Cliente seleccionado. Confirma su identidad antes de continuar.' }); }} className="min-h-touch rounded-lg bg-stone-100 px-3">Elegir</button></li>)}</ul> : null}
      {customer ? <div className="rounded-lg bg-brand-50 p-3"><p className="font-semibold">{customer.full_name}</p><p className="text-sm">Saldo: {customer.points_balance} puntos {customer.email_verified === false ? '· correo sin verificar' : ''}</p><button type="button" onClick={() => { setCustomer(null); setPreview(null); setNotice(null); }} className="mt-2 text-sm text-brand-800 underline">Cambiar cliente</button></div> : null}
    </section>

    {customer ? <>
      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Registrar compra</h2>
        <form onSubmit={createPreview} className="space-y-3">
          <label className="block text-sm font-medium">Total pagado (MXN)<input value={amount} onChange={(e) => { setAmount(e.target.value); setPreview(null); }} inputMode="decimal" placeholder="150.00" className="mt-1 min-h-touch w-full rounded-lg border border-stone-300 px-3 text-base" /></label>
          <label className="block text-sm font-medium">Puntos para usar como pago<input type="number" min="0" max={customer.points_balance} value={points} onChange={(e) => { setPoints(e.target.value); setPreview(null); }} className="mt-1 min-h-touch w-full rounded-lg border border-stone-300 px-3 text-base" /></label>
          <button disabled={busy || !branchId} className="min-h-touch w-full rounded-lg border border-brand-700 px-4 font-semibold text-brand-800 disabled:opacity-50">Calcular pago y puntos</button>
        </form>
        {preview ? <div className="space-y-2 rounded-lg bg-stone-50 p-3 text-sm"><p>Total: <strong>{formatMXN(parsePesosToCents(amount) ?? 0)}</strong></p><p>Descuento con puntos: <strong>{formatMXN(preview.redeemed_cents)}</strong></p><p>Pago restante: <strong>{formatMXN(preview.cash_cents)}</strong></p><p>Puntos que gana: <strong>{preview.points_earned}</strong></p><button type="button" disabled={busy} onClick={registerPurchase} className="min-h-touch w-full rounded-lg bg-brand-600 px-4 font-semibold text-white disabled:opacity-50">Confirmar compra</button></div> : null}
      </section>

      <section className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="font-semibold">Canjear recompensa</h2>
        {customer.email_verified === false ? <p className="text-sm text-amber-800">El cliente debe verificar su correo antes de usar puntos.</p> : null}
        {rewards.length ? rewards.map((reward) => <div key={reward.id} className="flex items-center justify-between gap-3 border-t border-stone-100 pt-3"><span className="text-sm"><strong>{reward.name}</strong><span className="block text-stone-500">{reward.points_cost} puntos · {reward.stock === null ? 'stock ilimitado' : `${reward.stock} disponibles`}</span></span><button type="button" disabled={busy || customer.points_balance < reward.points_cost || reward.stock === 0 || customer.email_verified === false} onClick={() => redeem(reward)} className="min-h-touch rounded-lg bg-brand-600 px-3 text-sm font-semibold text-white disabled:bg-stone-300">Canjear</button></div>) : <p className="text-sm text-stone-600">No hay recompensas activas.</p>}
      </section>
    </> : null}
    {scannerOpen ? <QrScanner onToken={lookupToken} onClose={() => setScannerOpen(false)} /> : null}
  </div>;
}
