import { Alert } from '@/components/alert';
import { StaffConsole } from '@/components/staff-console';
import { requireRole } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

export default async function StaffHomePage() {
  const profile = await requireRole(['employee', 'admin']);
  const supabase = await createClient();
  let branches: { id: string; name: string }[] = [];
  if (profile.role === 'admin') {
    const { data } = await supabase.from('branches').select('id, name').eq('is_active', true).order('name');
    branches = data ?? [];
  } else {
    const { data: assignments } = await supabase.from('employee_branches').select('branch_id').eq('employee_id', profile.id).eq('is_active', true);
    const ids = (assignments ?? []).map((assignment) => assignment.branch_id);
    if (ids.length) {
      const { data } = await supabase.from('branches').select('id, name').in('id', ids).eq('is_active', true).order('name');
      branches = data ?? [];
    }
  }
  const { data: rewards, error } = await supabase.from('rewards').select('id, name, points_cost, stock').eq('is_active', true).order('points_cost');

  return <div className="space-y-4">
    <div><h1 className="text-2xl font-bold">Atención en sucursal</h1><p className="mt-1 text-sm text-stone-600">Busca la tarjeta del cliente, revisa el cálculo y confirma la operación con él.</p></div>
    {error ? <Alert>No se pudieron cargar las recompensas.</Alert> : null}
    <StaffConsole branches={branches} rewards={rewards ?? []} />
  </div>;
}
