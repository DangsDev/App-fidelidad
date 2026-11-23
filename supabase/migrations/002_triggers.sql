-- =============================================================================
-- 002_triggers.sql — Perfiles automáticos, saldo, inmutabilidad y auditoría
-- =============================================================================

-- --------------------------------------------------------- updated_at -------
create function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger profiles_touch  before update on public.profiles  for each row execute function public.touch_updated_at();
create trigger branches_touch  before update on public.branches  for each row execute function public.touch_updated_at();
create trigger rewards_touch   before update on public.rewards   for each row execute function public.touch_updated_at();

create function public.settings_stamp()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;
create trigger loyalty_settings_stamp before insert or update on public.loyalty_settings
  for each row execute function public.settings_stamp();

-- ------------------------------------------- alta automática de perfil -------
-- El rol SIEMPRE es 'customer'. Se ignora cualquier "role" enviado en los metadatos.
create function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public, extensions as $$
begin
  insert into public.profiles (id, full_name, email)
  values (
    new.id,
    left(coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(new.email, '@', 1), 'Cliente'), 120),
    coalesce(new.email, '')
  )
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.sync_user_email()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = coalesce(new.email, '') where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.sync_user_email();

-- ------------------------- protección de columnas sensibles de profiles ------
-- Defensa en profundidad: además de los GRANT por columna, un usuario con rol
-- de API (authenticated/anon) nunca puede cambiar estos campos directamente.
-- Las funciones SECURITY DEFINER corren como su dueño y sí pueden.
create function public.protect_profile_columns()
returns trigger language plpgsql as $$
begin
  if current_user in ('authenticated', 'anon') then
    if new.id             is distinct from old.id
    or new.role           is distinct from old.role
    or new.email          is distinct from old.email
    or new.qr_token       is distinct from old.qr_token
    or new.points_balance is distinct from old.points_balance
    or new.is_active      is distinct from old.is_active
    or new.created_at     is distinct from old.created_at then
      raise exception 'No tienes permiso para modificar este campo.'
        using errcode = '42501', detail = 'forbidden';
    end if;
  end if;
  return new;
end $$;

create trigger profiles_protect before update on public.profiles
  for each row execute function public.protect_profile_columns();

-- --------------------------------------- empleado solo con rol 'employee' ----
create function public.employee_branches_check_role()
returns trigger language plpgsql as $$
begin
  if not exists (select 1 from public.profiles where id = new.employee_id and role = 'employee') then
    raise exception 'Solo usuarios con rol trabajador pueden asignarse a una sucursal.'
      using errcode = 'P0001', detail = 'not_an_employee';
  end if;
  return new;
end $$;

create trigger employee_branches_role_check before insert or update of employee_id on public.employee_branches
  for each row execute function public.employee_branches_check_role();

-- ----------------------------------------------- saldo = suma del ledger -----
-- Único punto donde cambia points_balance. Si un movimiento dejara el saldo
-- negativo, el CHECK de profiles aborta toda la transacción.
create function public.ledger_apply_balance()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles
     set points_balance = points_balance + new.points
   where id = new.customer_id;
  return new;
end $$;

create trigger points_tx_apply_balance after insert on public.points_transactions
  for each row execute function public.ledger_apply_balance();

-- ----------------------------------- tablas de solo inserción (ledger/audit) -
create function public.block_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'La tabla % es de solo inserción: las correcciones se hacen con movimientos compensatorios.', tg_table_name
    using errcode = '42501', detail = 'immutable';
end $$;

create trigger points_tx_immutable_row before update or delete on public.points_transactions
  for each row execute function public.block_mutation();
create trigger points_tx_immutable_stmt before truncate on public.points_transactions
  for each statement execute function public.block_mutation();
create trigger audit_immutable_row before update or delete on public.audit_logs
  for each row execute function public.block_mutation();
create trigger audit_immutable_stmt before truncate on public.audit_logs
  for each statement execute function public.block_mutation();

-- ------------- compras y canjes: solo se puede pasar completed -> voided -----
create function public.guard_operation_update()
returns trigger language plpgsql as $$
declare
  v_skip text[] := array['status', 'voided_at', 'voided_by', 'void_reason'];
begin
  if tg_op = 'DELETE' then
    raise exception 'Las operaciones no se pueden eliminar; solo anular.'
      using errcode = '42501', detail = 'immutable';
  end if;
  if old.status = 'voided' then
    raise exception 'La operación ya está anulada.' using errcode = 'P0001', detail = 'already_voided';
  end if;
  if new.status <> 'voided'
     or (to_jsonb(new) - v_skip) is distinct from (to_jsonb(old) - v_skip) then
    raise exception 'Las operaciones registradas no se pueden editar; solo anular.'
      using errcode = '42501', detail = 'immutable';
  end if;
  return new;
end $$;

create trigger purchases_guard   before update or delete on public.purchases
  for each row execute function public.guard_operation_update();
create trigger redemptions_guard before update or delete on public.redemptions
  for each row execute function public.guard_operation_update();

-- -------------------------------------------------------------- auditoría ---
create function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) - 'qr_token' end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) - 'qr_token' end;
  v_row jsonb := coalesce(v_new, v_old);
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
  values (
    auth.uid(),
    lower(tg_op),
    tg_argv[0],
    coalesce(v_row ->> 'id', concat_ws(':', v_row ->> 'employee_id', v_row ->> 'branch_id')),
    v_old,
    v_new
  );
  return coalesce(new, old);
end $$;

create trigger branches_audit          after insert or update or delete on public.branches
  for each row execute function public.audit_row_change('branches');
create trigger loyalty_settings_audit  after insert or update or delete on public.loyalty_settings
  for each row execute function public.audit_row_change('loyalty_settings');
create trigger rewards_audit           after insert or update or delete on public.rewards
  for each row execute function public.audit_row_change('rewards');
create trigger employee_branches_audit after insert or update or delete on public.employee_branches
  for each row execute function public.audit_row_change('employee_branches');
-- En perfiles solo se audita cambio de rol o de estado (no el saldo).
create trigger profiles_audit after update on public.profiles
  for each row when (old.role is distinct from new.role or old.is_active is distinct from new.is_active)
  execute function public.audit_row_change('profiles');
