'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getSiteUrl } from '@/lib/site-url';

function value(form: FormData, key: string) { const v = form.get(key); return typeof v === 'string' ? v.trim() : ''; }
function done(message: string): never { revalidatePath('/admin'); redirect(`/admin?notice=${encodeURIComponent(message)}`); }
function fail(): never { redirect(`/admin?notice=${encodeURIComponent('No se pudo guardar. Revisa los datos y vuelve a intentarlo.')}`); }
function positiveInt(raw: string): number | null { const number = Number(raw); return Number.isSafeInteger(number) && number > 0 ? number : null; }
function moneyCents(raw: string, allowZero = false): number | null {
  if (allowZero && (raw === '' || raw === '0' || raw === '0.00')) return 0;
  const match = /^(\d{1,7})(?:\.(\d{1,2}))?$/.exec(raw);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0') || 0);
  return cents > 0 && cents <= 100_000_000 ? cents : null;
}

export async function saveBranch(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const name = value(form, 'name'); const address = value(form, 'address');
  if (!name || name.length > 120) fail();
  const { error } = await supabase.from('branches').insert({ name, address: address || null });
  if (error) fail(); done('Sucursal creada.');
}

export async function toggleBranch(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const id = value(form, 'id'); const active = value(form, 'active') === 'true';
  const { error } = await supabase.from('branches').update({ is_active: active }).eq('id', id);
  if (error) fail(); done(active ? 'Sucursal activada.' : 'Sucursal desactivada.');
}

export async function saveReward(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const name = value(form, 'name'); const description = value(form, 'description');
  const points = positiveInt(value(form, 'points_cost')); const rawStock = value(form, 'stock');
  const stock = rawStock === '' ? null : Number(rawStock);
  if (!name || name.length > 120 || !points || (stock !== null && (!Number.isSafeInteger(stock) || stock < 0))) fail();
  const { error } = await supabase.from('rewards').insert({ name, description: description || null, points_cost: points, stock });
  if (error) fail(); done('Recompensa creada.');
}

export async function toggleReward(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const active = value(form, 'active') === 'true';
  const { error } = await supabase.from('rewards').update({ is_active: active }).eq('id', value(form, 'id'));
  if (error) fail(); done(active ? 'Recompensa activada.' : 'Recompensa desactivada.');
}

export async function saveSettings(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const centsPerPoint = moneyCents(value(form, 'cents_per_point'));
  const pointValue = moneyCents(value(form, 'point_value'));
  const minimum = moneyCents(value(form, 'minimum'), true);
  if (!centsPerPoint || !pointValue || minimum === null) fail();
  const accrual = value(form, 'accrual') === 'on';
  const { data: current, error: readError } = await supabase.from('loyalty_settings').select('id').is('branch_id', null).maybeSingle();
  if (readError) fail();
  const settings = { cents_per_point: centsPerPoint, point_value_cents: pointValue, min_purchase_cents: minimum, accrual_enabled: accrual };
  const result = current
    ? await supabase.from('loyalty_settings').update(settings).eq('id', current.id)
    : await supabase.from('loyalty_settings').insert({ ...settings, branch_id: null });
  if (result.error) fail(); done('Reglas globales actualizadas.');
}

export async function inviteEmployee(form: FormData) {
  await requireRole(['admin']);
  const email = value(form, 'email').toLowerCase(); const fullName = value(form, 'full_name'); const branchId = value(form, 'branch_id');
  if (!/^\S+@\S+\.\S+$/.test(email) || !fullName || fullName.length > 120 || !branchId) fail();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName }, redirectTo: `${await getSiteUrl()}/auth/callback?next=/staff`,
  });
  if (error || !data.user) fail();
  const supabase = await createClient();
  const { error: roleError } = await supabase.rpc('admin_set_user_role', { p_user_id: data.user.id, p_role: 'employee' });
  if (roleError) fail();
  const { error: assignmentError } = await supabase.from('employee_branches').upsert({ employee_id: data.user.id, branch_id: branchId, is_active: true });
  if (assignmentError) fail(); done('Invitación enviada y sucursal asignada.');
}

export async function changeUserRole(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const id = value(form, 'id'); const role = value(form, 'role'); const branchId = value(form, 'branch_id');
  if (!['customer', 'employee'].includes(role)) fail();
  const { error } = await supabase.rpc('admin_set_user_role', { p_user_id: id, p_role: role });
  if (error) fail();
  if (role === 'employee' && branchId) {
    const { error: assignmentError } = await supabase.from('employee_branches').upsert({ employee_id: id, branch_id: branchId, is_active: true });
    if (assignmentError) fail();
  } else if (role === 'customer') {
    const { error: assignmentError } = await supabase.from('employee_branches').update({ is_active: false }).eq('employee_id', id);
    if (assignmentError) fail();
  }
  done('Rol actualizado.');
}

export async function toggleUserActive(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const active = value(form, 'active') === 'true';
  const { error } = await supabase.rpc('admin_set_user_active', { p_user_id: value(form, 'id'), p_active: active });
  if (error) fail(); done(active ? 'Cuenta activada.' : 'Cuenta desactivada.');
}

export async function adjustCustomerPoints(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const points = Number(value(form, 'points')); const note = value(form, 'note'); const id = value(form, 'customer_id');
  if (!Number.isSafeInteger(points) || points === 0 || Math.abs(points) > 1_000_000 || note.length < 3) fail();
  const { error } = await supabase.rpc('admin_adjust_points', { p_customer_id: id, p_points: points, p_note: note, p_client_request_id: crypto.randomUUID() });
  if (error) fail(); done('Ajuste de puntos registrado.');
}

export async function voidOperation(form: FormData) {
  await requireRole(['admin']); const supabase = await createClient();
  const kind = value(form, 'kind'); const id = value(form, 'id'); const reason = value(form, 'reason');
  if (!['purchase', 'redemption'].includes(kind) || reason.length < 3) fail();
  const { error } = await supabase.rpc('void_operation', { p_kind: kind, p_id: id, p_reason: reason });
  if (error) fail(); done('Operación anulada con su movimiento compensatorio.');
}
