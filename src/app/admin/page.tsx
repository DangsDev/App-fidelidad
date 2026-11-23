import { Alert } from '@/components/alert';
import { Field } from '@/components/field';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { formatDateTime, formatSignedPoints, movementLabel } from '@/lib/format';
import { formatMXN } from '@/lib/money';
import { adjustCustomerPoints, changeUserRole, inviteEmployee, saveBranch, saveReward, saveSettings, toggleBranch, toggleReward, toggleUserActive, voidOperation } from './actions';

type Row = Record<string, any>;
const card = 'space-y-4 rounded-2xl border border-stone-200 bg-white p-4 sm:p-5';

export default async function AdminHomePage({ searchParams }: { searchParams: Promise<{ notice?: string }> }) {
  await requireRole(['admin']);
  const { notice } = await searchParams;
  const supabase = await createClient();
  const [{ data: branches }, { data: rewards }, { data: settings }, { data: users }, { data: transactions }, { data: purchases }, { data: redemptions }] = await Promise.all([
    supabase.from('branches').select('id, name, address, is_active').order('name'),
    supabase.from('rewards').select('id, name, description, points_cost, stock, is_active').order('points_cost'),
    supabase.from('loyalty_settings').select('cents_per_point, point_value_cents, min_purchase_cents, accrual_enabled').is('branch_id', null).maybeSingle(),
    supabase.from('profiles').select('id, full_name, email, role, is_active, points_balance').order('created_at', { ascending: false }).limit(100),
    supabase.from('points_transactions').select('id, customer_id, points, type, note, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('purchases').select('id, customer_id, total_cents, cash_cents, points_earned, status, created_at').order('created_at', { ascending: false }).limit(12),
    supabase.from('redemptions').select('id, customer_id, reward_name_snapshot, points_spent, status, created_at').order('created_at', { ascending: false }).limit(12),
  ]);
  const branchRows = (branches ?? []) as Row[];
  const userRows = (users ?? []) as Row[];
  const activeBranches = branchRows.filter((branch) => branch.is_active);

  return <div className="space-y-6">
    <div><h1 className="text-2xl font-bold">Administración</h1><p className="mt-1 text-sm text-stone-600">Gestiona sucursales, reglas, recompensas, equipo y movimientos.</p></div>
    {notice ? <Alert kind="success">{notice}</Alert> : null}

    <section className={card}>
      <div><h2 className="text-lg font-semibold">Regla global de puntos</h2><p className="text-sm text-stone-600">Las sucursales sin una regla propia usan estos valores.</p></div>
      <form action={saveSettings} className="grid gap-3 sm:grid-cols-2">
        <Field label="Pesos pagados por punto ganado" name="cents_per_point" type="number" min="0.01" step="0.01" required defaultValue={settings ? (settings.cents_per_point / 100).toFixed(2) : '10.00'} />
        <Field label="Valor de un punto al pagar (MXN)" name="point_value" type="number" min="0.01" step="0.01" required defaultValue={settings ? (settings.point_value_cents / 100).toFixed(2) : '1.00'} />
        <Field label="Compra mínima (MXN)" name="minimum" type="number" min="0" step="0.01" required defaultValue={settings ? (settings.min_purchase_cents / 100).toFixed(2) : '0.00'} />
        <label className="flex min-h-touch items-center gap-3 rounded-lg border border-stone-200 px-3 text-sm"><input type="checkbox" name="accrual" defaultChecked={settings?.accrual_enabled ?? true} className="h-5 w-5 accent-brand-600" />Acumulación de puntos activa</label>
        <button className="min-h-touch rounded-lg bg-brand-600 px-4 font-semibold text-white sm:col-span-2">Guardar reglas</button>
      </form>
    </section>

    <section className={card}>
      <div><h2 className="text-lg font-semibold">Sucursales</h2><p className="text-sm text-stone-600">Las sucursales activas pueden recibir operaciones.</p></div>
      <form action={saveBranch} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
        <Field label="Nombre" name="name" required maxLength={120} />
        <Field label="Dirección (opcional)" name="address" maxLength={300} />
        <button className="min-h-touch self-end rounded-lg bg-brand-600 px-4 font-semibold text-white">Agregar</button>
      </form>
      <ul className="divide-y divide-stone-100">{branchRows.map((branch) => <li key={branch.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{branch.name}</p><p className="text-sm text-stone-500">{branch.address || 'Sin dirección'} · {branch.is_active ? 'Activa' : 'Inactiva'}</p></div><form action={toggleBranch}><input type="hidden" name="id" value={branch.id} /><input type="hidden" name="active" value={String(!branch.is_active)} /><button className="min-h-touch rounded-lg border px-3 text-sm">{branch.is_active ? 'Desactivar' : 'Activar'}</button></form></li>)}</ul>
    </section>

    <section className={card}>
      <div><h2 className="text-lg font-semibold">Recompensas</h2><p className="text-sm text-stone-600">El stock vacío significa ilimitado. Las recompensas inactivas no se pueden canjear.</p></div>
      <form action={saveReward} className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre" name="name" required maxLength={120} />
        <Field label="Costo en puntos" name="points_cost" type="number" min="1" step="1" required />
        <Field label="Descripción (opcional)" name="description" maxLength={500} />
        <Field label="Existencias (vacío = ilimitadas)" name="stock" type="number" min="0" step="1" />
        <button className="min-h-touch rounded-lg bg-brand-600 px-4 font-semibold text-white sm:col-span-2">Crear recompensa</button>
      </form>
      <ul className="divide-y divide-stone-100">{((rewards ?? []) as Row[]).map((reward) => <li key={reward.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{reward.name}</p><p className="text-sm text-stone-500">{reward.points_cost} puntos · {reward.stock === null ? 'stock ilimitado' : `${reward.stock} disponibles`} · {reward.is_active ? 'Activa' : 'Inactiva'}</p></div><form action={toggleReward}><input type="hidden" name="id" value={reward.id} /><input type="hidden" name="active" value={String(!reward.is_active)} /><button className="min-h-touch rounded-lg border px-3 text-sm">{reward.is_active ? 'Desactivar' : 'Activar'}</button></form></li>)}</ul>
    </section>

    <section className={card}>
      <div><h2 className="text-lg font-semibold">Invitar trabajador</h2><p className="text-sm text-stone-600">Se enviará un enlace para crear contraseña y se asignará la sucursal elegida.</p></div>
      {activeBranches.length ? <form action={inviteEmployee} className="grid gap-3 sm:grid-cols-2"><Field label="Nombre completo" name="full_name" required maxLength={120} /><Field label="Correo" name="email" type="email" required /><label className="text-sm font-medium">Sucursal<select name="branch_id" required className="mt-1 min-h-touch w-full rounded-lg border border-stone-300 bg-white px-3">{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label><button className="min-h-touch self-end rounded-lg bg-brand-600 px-4 font-semibold text-white">Enviar invitación</button></form> : <Alert>Activa una sucursal antes de invitar personal.</Alert>}
    </section>

    <section className={card}>
      <div><h2 className="text-lg font-semibold">Cuentas</h2><p className="text-sm text-stone-600">Se muestran hasta las 100 cuentas más recientes.</p></div>
      <ul className="divide-y divide-stone-100">{userRows.map((user) => <li key={user.id} className="space-y-2 py-3"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-medium">{user.full_name}</p><p className="truncate text-sm text-stone-500">{user.email} · {user.role} · {user.is_active ? 'Activa' : 'Inactiva'}{user.role === 'customer' ? ` · ${user.points_balance} puntos` : ''}</p></div><form action={toggleUserActive}><input type="hidden" name="id" value={user.id} /><input type="hidden" name="active" value={String(!user.is_active)} /><button className="min-h-touch shrink-0 rounded-lg border px-3 text-sm">{user.is_active ? 'Desactivar' : 'Activar'}</button></form></div>
        {user.role !== 'admin' ? <form action={changeUserRole} className="flex flex-wrap items-center gap-2"><input type="hidden" name="id" value={user.id} /><select name="role" defaultValue={user.role} className="min-h-touch rounded-lg border border-stone-300 bg-white px-2 text-sm"><option value="customer">Cliente</option><option value="employee">Trabajador</option></select><select name="branch_id" className="min-h-touch max-w-48 rounded-lg border border-stone-300 bg-white px-2 text-sm"><option value="">Elegir sucursal…</option>{activeBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select><button className="min-h-touch rounded-lg border px-3 text-sm">Actualizar rol/asignación</button></form> : null}
        {user.role === 'customer' ? <details><summary className="cursor-pointer py-1 text-sm text-brand-800">Ajustar puntos</summary><form action={adjustCustomerPoints} className="mt-2 grid gap-2 sm:grid-cols-[1fr_2fr_auto]"><input type="hidden" name="customer_id" value={user.id} /><Field label="Puntos (+ o −)" name="points" type="number" step="1" required /><Field label="Motivo" name="note" minLength={3} required /><button className="min-h-touch self-end rounded-lg border px-3 text-sm">Registrar ajuste</button></form></details> : null}
      </li>)}</ul>
    </section>

    <section className={card}>
      <h2 className="text-lg font-semibold">Actividad y anulaciones</h2>
      <div className="space-y-4">
        <div><h3 className="font-medium">Compras recientes</h3><ul className="divide-y divide-stone-100">{((purchases ?? []) as Row[]).map((purchase) => <li key={purchase.id} className="py-3"><div className="flex justify-between gap-2 text-sm"><span>{formatDateTime(purchase.created_at)} · {formatMXN(purchase.total_cents)} · ganó {purchase.points_earned} puntos</span><strong>{purchase.status === 'voided' ? 'Anulada' : 'Completada'}</strong></div>{purchase.status === 'completed' ? <form action={voidOperation} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="kind" value="purchase" /><input type="hidden" name="id" value={purchase.id} /><input name="reason" required minLength={3} placeholder="Motivo de anulación" className="min-h-touch min-w-48 flex-1 rounded-lg border px-3 text-sm" /><button className="min-h-touch rounded-lg border border-red-300 px-3 text-sm text-red-800">Anular</button></form> : null}</li>)}</ul></div>
        <div><h3 className="font-medium">Canjes recientes</h3><ul className="divide-y divide-stone-100">{((redemptions ?? []) as Row[]).map((redemption) => <li key={redemption.id} className="py-3"><div className="flex justify-between gap-2 text-sm"><span>{formatDateTime(redemption.created_at)} · {redemption.reward_name_snapshot} · {redemption.points_spent} puntos</span><strong>{redemption.status === 'voided' ? 'Anulado' : 'Completado'}</strong></div>{redemption.status === 'completed' ? <form action={voidOperation} className="mt-2 flex flex-wrap gap-2"><input type="hidden" name="kind" value="redemption" /><input type="hidden" name="id" value={redemption.id} /><input name="reason" required minLength={3} placeholder="Motivo de anulación" className="min-h-touch min-w-48 flex-1 rounded-lg border px-3 text-sm" /><button className="min-h-touch rounded-lg border border-red-300 px-3 text-sm text-red-800">Anular</button></form> : null}</li>)}</ul></div>
      </div>
    </section>

    <section className={card}><h2 className="text-lg font-semibold">Movimientos recientes</h2><ul className="divide-y divide-stone-100">{((transactions ?? []) as Row[]).map((tx) => { const user = userRows.find((item) => item.id === tx.customer_id); return <li key={tx.id} className="flex justify-between gap-3 py-3 text-sm"><span>{user?.full_name ?? 'Cliente'} · {movementLabel(tx.type)}{tx.note ? ` · ${tx.note}` : ''}<span className="block text-xs text-stone-500">{formatDateTime(tx.created_at)}</span></span><strong className="shrink-0">{formatSignedPoints(tx.points)}</strong></li>; })}</ul></section>
  </div>;
}
