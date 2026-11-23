-- =============================================================================
-- 003_functions.sql — Lógica de negocio atómica (RPC)
--
-- Convención de errores: el MENSAJE es texto en español para mostrar al usuario
-- y DETAIL es un código estable (p. ej. 'insufficient_points') para que el
-- frontend decida qué hacer. supabase-js lo expone como error.details.
-- =============================================================================

-- Evita que las funciones nuevas queden ejecutables por anon/authenticated/PUBLIC.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

-- ------------------------------------------------------------ utilidades ----
create function public._fail(p_code text, p_message text, p_errcode text default 'P0001')
returns void language plpgsql as $$
begin
  raise exception '%', p_message using errcode = p_errcode, detail = p_code;
end $$;

create function public.current_user_role()
returns public.user_role language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;

create function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() = 'admin', false)
$$;

create function public.is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.current_user_role() in ('admin', 'employee'), false)
$$;

-- Admin: cualquier sucursal activa. Trabajador: solo las asignadas y activas.
create function public.can_operate_at_branch(p_branch_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.branches b where b.id = p_branch_id and b.is_active)
     and (
       public.is_admin()
       or (
         public.current_user_role() = 'employee'
         and exists (
           select 1 from public.employee_branches eb
            where eb.employee_id = auth.uid() and eb.branch_id = p_branch_id and eb.is_active
         )
       )
     )
$$;

create function public._email_verified(p_user_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select email_confirmed_at is not null from auth.users where id = p_user_id), false)
$$;

-- Regla vigente: la de la sucursal si existe, si no la global.
create function public._effective_settings(p_branch_id uuid)
returns public.loyalty_settings language sql stable security definer set search_path = public as $$
  select s.* from public.loyalty_settings s
   where s.branch_id = p_branch_id or s.branch_id is null
   order by s.branch_id nulls last
   limit 1
$$;

-- Cálculo único (lo usan la vista previa y el registro, para que nunca diverjan).
create function public._compute_purchase(
  p_branch_id        uuid,
  p_total_cents      integer,
  p_points_to_redeem integer,
  out point_value_cents integer,
  out redeemed_cents    integer,
  out cash_cents        integer,
  out points_earned     integer,
  out cents_per_point   integer
) language plpgsql stable security definer set search_path = public as $$
declare
  s public.loyalty_settings;
begin
  if p_total_cents is null or p_total_cents <= 0 or p_total_cents > 100000000 then
    perform public._fail('invalid_amount', 'El importe debe ser mayor a $0 y menor o igual a $1,000,000.');
  end if;
  if p_points_to_redeem is null or p_points_to_redeem < 0 then
    perform public._fail('invalid_points', 'La cantidad de puntos a usar no es válida.');
  end if;

  s := public._effective_settings(p_branch_id);
  if s.id is null then
    perform public._fail('no_settings', 'No hay una regla de puntos configurada.');
  end if;

  point_value_cents := s.point_value_cents;
  cents_per_point   := s.cents_per_point;
  redeemed_cents    := p_points_to_redeem * s.point_value_cents;

  if redeemed_cents > p_total_cents then
    perform public._fail('points_exceed_total', 'Los puntos a usar superan el importe de la compra.');
  end if;

  cash_cents := p_total_cents - redeemed_cents;
  -- Solo el dinero efectivamente pagado genera puntos; división entera = redondeo hacia abajo.
  points_earned := case
    when s.accrual_enabled and cash_cents > 0 and cash_cents >= s.min_purchase_cents
      then cash_cents / s.cents_per_point
    else 0
  end;
end $$;

-- ------------------------------------------------- búsqueda de clientes -----
create function public.lookup_customer_by_qr(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c public.profiles;
  v_token text := btrim(coalesce(p_token, ''));
begin
  if not public.is_staff() then
    perform public._fail('forbidden', 'No tienes permiso para esta acción.', '42501');
  end if;
  if v_token = '' or char_length(v_token) > 64 then
    perform public._fail('customer_not_found', 'Código QR no reconocido.');
  end if;

  select * into c from public.profiles where qr_token = v_token and role = 'customer';
  if not found then
    perform public._fail('customer_not_found', 'Código QR no reconocido.');
  end if;
  if not c.is_active then
    perform public._fail('customer_inactive', 'La cuenta de este cliente está desactivada.');
  end if;

  return jsonb_build_object(
    'id', c.id,
    'full_name', c.full_name,
    'points_balance', c.points_balance,
    'email_verified', public._email_verified(c.id)
  );
end $$;

create function public.search_customers(p_query text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_q text := btrim(coalesce(p_query, ''));
  v_pattern text;
  v_result jsonb;
begin
  if not public.is_staff() then
    perform public._fail('forbidden', 'No tienes permiso para esta acción.', '42501');
  end if;
  if char_length(v_q) < 3 then
    perform public._fail('query_too_short', 'Escribe al menos 3 caracteres para buscar.');
  end if;

  v_pattern := '%' || replace(replace(replace(lower(v_q), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  select coalesce(jsonb_agg(r), '[]'::jsonb) into v_result from (
    select p.id,
           p.full_name,
           -- correo enmascarado: lo justo para distinguir homónimos
           left(split_part(p.email, '@', 1), 1) || '***@' || split_part(p.email, '@', 2) as email_masked,
           p.points_balance
      from public.profiles p
     where p.role = 'customer' and p.is_active
       and (lower(p.full_name) like v_pattern or lower(p.email) like v_pattern)
     order by p.full_name
     limit 15
  ) r;
  return v_result;
end $$;

-- --------------------------------------------------- vista previa (sin escribir)
create function public.preview_purchase(p_branch_id uuid, p_total_cents integer, p_points_to_redeem integer default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
begin
  if not public.can_operate_at_branch(p_branch_id) then
    perform public._fail('branch_not_allowed', 'No tienes acceso a esta sucursal.', '42501');
  end if;
  select * into c from public._compute_purchase(p_branch_id, p_total_cents, coalesce(p_points_to_redeem, 0));
  return jsonb_build_object(
    'total_cents', p_total_cents,
    'points_redeemed', coalesce(p_points_to_redeem, 0),
    'redeemed_cents', c.redeemed_cents,
    'cash_cents', c.cash_cents,
    'points_earned', c.points_earned,
    'cents_per_point', c.cents_per_point,
    'point_value_cents', c.point_value_cents
  );
end $$;

-- ------------------------------------------------------ registrar compra ----
create function public._purchase_json(p public.purchases, p_duplicate boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'duplicate', p_duplicate,
    'purchase_id', p.id,
    'customer_id', p.customer_id,
    'branch_id', p.branch_id,
    'total_cents', p.total_cents,
    'points_redeemed', p.points_redeemed,
    'redeemed_cents', p.redeemed_cents,
    'cash_cents', p.cash_cents,
    'points_earned', p.points_earned,
    'status', p.status,
    'created_at', p.created_at,
    'balance', (select points_balance from public.profiles where id = p.customer_id)
  )
$$;

create function public.register_purchase(
  p_customer_id       uuid,
  p_branch_id         uuid,
  p_total_cents       integer,
  p_points_to_redeem  integer,
  p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_points   integer := coalesce(p_points_to_redeem, 0);
  v_customer public.profiles;
  v_existing public.purchases;
  v_calc     record;
  v_purchase public.purchases;
begin
  if not public.is_staff() then
    perform public._fail('forbidden', 'No tienes permiso para registrar compras.', '42501');
  end if;
  if p_client_request_id is null then
    perform public._fail('missing_request_id', 'Falta el identificador de la operación.');
  end if;
  if not public.can_operate_at_branch(p_branch_id) then
    perform public._fail('branch_not_allowed', 'No tienes acceso a esta sucursal o está inactiva.', '42501');
  end if;

  -- Bloqueo del cliente: serializa operaciones concurrentes sobre el mismo saldo.
  select * into v_customer from public.profiles
   where id = p_customer_id and role = 'customer' for update;
  if not found then
    perform public._fail('customer_not_found', 'Cliente no encontrado.');
  end if;
  if not v_customer.is_active then
    perform public._fail('customer_inactive', 'La cuenta de este cliente está desactivada.');
  end if;

  -- Idempotencia: el mismo request_id nunca aplica dos veces.
  select * into v_existing from public.purchases where client_request_id = p_client_request_id;
  if found then
    if v_existing.employee_id = v_uid and v_existing.customer_id = p_customer_id
       and v_existing.branch_id = p_branch_id and v_existing.total_cents = p_total_cents
       and v_existing.points_redeemed = v_points then
      return public._purchase_json(v_existing, true);
    end if;
    perform public._fail('request_id_conflict', 'Este identificador de operación ya se usó con otros datos.');
  end if;

  if v_points > 0 then
    if not public._email_verified(p_customer_id) then
      perform public._fail('email_not_verified', 'El cliente debe verificar su correo para usar puntos.');
    end if;
    if v_customer.points_balance < v_points then
      perform public._fail('insufficient_points',
        format('Puntos insuficientes: el cliente tiene %s y se intentan usar %s.', v_customer.points_balance, v_points));
    end if;
  end if;

  select * into v_calc from public._compute_purchase(p_branch_id, p_total_cents, v_points);

  insert into public.purchases (
    customer_id, employee_id, branch_id, total_cents,
    points_redeemed, point_value_cents_snapshot, redeemed_cents, cash_cents,
    points_earned, cents_per_point_snapshot, client_request_id
  ) values (
    p_customer_id, v_uid, p_branch_id, p_total_cents,
    v_points, v_calc.point_value_cents, v_calc.redeemed_cents, v_calc.cash_cents,
    v_calc.points_earned, v_calc.cents_per_point, p_client_request_id
  ) returning * into v_purchase;

  if v_points > 0 then
    insert into public.points_transactions (customer_id, points, type, purchase_id, created_by, branch_id)
    values (p_customer_id, -v_points, 'purchase_payment', v_purchase.id, v_uid, p_branch_id);
  end if;
  if v_calc.points_earned > 0 then
    insert into public.points_transactions (customer_id, points, type, purchase_id, created_by, branch_id)
    values (p_customer_id, v_calc.points_earned, 'purchase_earn', v_purchase.id, v_uid, p_branch_id);
  end if;

  return public._purchase_json(v_purchase, false);
end $$;

-- ---------------------------------------------------- canjear recompensa ----
create function public._redemption_json(r public.redemptions, p_duplicate boolean)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'duplicate', p_duplicate,
    'redemption_id', r.id,
    'customer_id', r.customer_id,
    'reward_id', r.reward_id,
    'reward_name', r.reward_name_snapshot,
    'branch_id', r.branch_id,
    'points_spent', r.points_spent,
    'status', r.status,
    'created_at', r.created_at,
    'balance', (select points_balance from public.profiles where id = r.customer_id)
  )
$$;

create function public.redeem_reward(
  p_customer_id       uuid,
  p_reward_id         uuid,
  p_branch_id         uuid,
  p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_customer public.profiles;
  v_reward   public.rewards;
  v_existing public.redemptions;
  v_red      public.redemptions;
begin
  if not public.is_staff() then
    perform public._fail('forbidden', 'No tienes permiso para procesar canjes.', '42501');
  end if;
  if p_client_request_id is null then
    perform public._fail('missing_request_id', 'Falta el identificador de la operación.');
  end if;
  if not public.can_operate_at_branch(p_branch_id) then
    perform public._fail('branch_not_allowed', 'No tienes acceso a esta sucursal o está inactiva.', '42501');
  end if;

  -- Orden de bloqueo fijo (cliente -> recompensa) para evitar interbloqueos.
  select * into v_customer from public.profiles
   where id = p_customer_id and role = 'customer' for update;
  if not found then
    perform public._fail('customer_not_found', 'Cliente no encontrado.');
  end if;
  if not v_customer.is_active then
    perform public._fail('customer_inactive', 'La cuenta de este cliente está desactivada.');
  end if;

  select * into v_existing from public.redemptions where client_request_id = p_client_request_id;
  if found then
    if v_existing.employee_id = v_uid and v_existing.customer_id = p_customer_id
       and v_existing.reward_id = p_reward_id and v_existing.branch_id = p_branch_id then
      return public._redemption_json(v_existing, true);
    end if;
    perform public._fail('request_id_conflict', 'Este identificador de operación ya se usó con otros datos.');
  end if;

  if not public._email_verified(p_customer_id) then
    perform public._fail('email_not_verified', 'El cliente debe verificar su correo para canjear recompensas.');
  end if;

  select * into v_reward from public.rewards where id = p_reward_id for update;
  if not found or not v_reward.is_active then
    perform public._fail('reward_unavailable', 'La recompensa no está disponible.');
  end if;
  if v_reward.stock is not null and v_reward.stock <= 0 then
    perform public._fail('out_of_stock', 'La recompensa está agotada.');
  end if;
  if v_customer.points_balance < v_reward.points_cost then
    perform public._fail('insufficient_points',
      format('Puntos insuficientes: el cliente tiene %s y la recompensa cuesta %s.', v_customer.points_balance, v_reward.points_cost));
  end if;

  insert into public.redemptions (
    customer_id, reward_id, employee_id, branch_id, points_spent, reward_name_snapshot, client_request_id
  ) values (
    p_customer_id, p_reward_id, v_uid, p_branch_id, v_reward.points_cost, v_reward.name, p_client_request_id
  ) returning * into v_red;

  insert into public.points_transactions (customer_id, points, type, redemption_id, created_by, branch_id)
  values (p_customer_id, -v_reward.points_cost, 'redemption', v_red.id, v_uid, p_branch_id);

  if v_reward.stock is not null then
    update public.rewards set stock = stock - 1 where id = v_reward.id;
  end if;

  return public._redemption_json(v_red, false);
end $$;

-- ------------------------------------------------------ ajustes manuales ----
create function public.admin_adjust_points(
  p_customer_id       uuid,
  p_points            integer,
  p_note              text,
  p_client_request_id uuid
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_customer public.profiles;
  v_note     text := btrim(coalesce(p_note, ''));
  v_existing public.points_transactions;
  v_tx       public.points_transactions;
begin
  if not public.is_admin() then
    perform public._fail('forbidden', 'Solo un administrador puede ajustar puntos.', '42501');
  end if;
  if p_client_request_id is null then
    perform public._fail('missing_request_id', 'Falta el identificador de la operación.');
  end if;
  if p_points is null or p_points = 0 or abs(p_points) > 1000000 then
    perform public._fail('invalid_points', 'El ajuste debe ser distinto de cero y de máximo 1,000,000 puntos.');
  end if;
  if char_length(v_note) < 3 then
    perform public._fail('note_required', 'Escribe el motivo del ajuste (mínimo 3 caracteres).');
  end if;

  select * into v_customer from public.profiles
   where id = p_customer_id and role = 'customer' for update;
  if not found then
    perform public._fail('customer_not_found', 'Cliente no encontrado.');
  end if;

  select * into v_existing from public.points_transactions where client_request_id = p_client_request_id;
  if found then
    if v_existing.customer_id = p_customer_id and v_existing.points = p_points then
      return jsonb_build_object('duplicate', true, 'transaction_id', v_existing.id,
                                'balance', (select points_balance from public.profiles where id = p_customer_id));
    end if;
    perform public._fail('request_id_conflict', 'Este identificador de operación ya se usó con otros datos.');
  end if;

  if v_customer.points_balance + p_points < 0 then
    perform public._fail('insufficient_points',
      format('El ajuste dejaría el saldo en negativo (saldo actual: %s).', v_customer.points_balance));
  end if;

  insert into public.points_transactions (customer_id, points, type, created_by, note, client_request_id)
  values (p_customer_id, p_points,
          case when p_points > 0 then 'admin_adjust_positive' else 'admin_adjust_negative' end::public.points_tx_type,
          v_uid, v_note, p_client_request_id)
  returning * into v_tx;

  insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
  values (v_uid, 'points_adjustment', 'profiles', p_customer_id::text,
          jsonb_build_object('points_balance', v_customer.points_balance),
          jsonb_build_object('points_balance', v_customer.points_balance + p_points,
                             'points', p_points, 'note', v_note, 'transaction_id', v_tx.id));

  return jsonb_build_object('duplicate', false, 'transaction_id', v_tx.id,
                            'balance', v_customer.points_balance + p_points);
end $$;

-- ----------------------------------------------------- anular operaciones ---
-- Genera movimientos compensatorios; nunca edita ni borra el historial.
create function public.void_operation(p_kind text, p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_reason   text := btrim(coalesce(p_reason, ''));
  v_customer uuid;
  v_net      integer;
  v_balance  integer;
  v_purchase public.purchases;
  v_red      public.redemptions;
  r          record;
begin
  if not public.is_admin() then
    perform public._fail('forbidden', 'Solo un administrador puede anular operaciones.', '42501');
  end if;
  if char_length(v_reason) < 3 then
    perform public._fail('reason_required', 'Escribe el motivo de la anulación (mínimo 3 caracteres).');
  end if;
  if p_kind not in ('purchase', 'redemption') then
    perform public._fail('invalid_kind', 'Tipo de operación no válido.');
  end if;

  -- Primero se bloquea al cliente (mismo orden que register/redeem), luego la operación.
  if p_kind = 'purchase' then
    select customer_id into v_customer from public.purchases where id = p_id;
  else
    select customer_id into v_customer from public.redemptions where id = p_id;
  end if;
  if v_customer is null then
    perform public._fail('operation_not_found', 'Operación no encontrada.');
  end if;
  select points_balance into v_balance from public.profiles where id = v_customer for update;

  if p_kind = 'purchase' then
    select * into v_purchase from public.purchases where id = p_id for update;
    if v_purchase.status = 'voided' then
      perform public._fail('already_voided', 'La compra ya fue anulada.');
    end if;

    select coalesce(sum(-points), 0) into v_net from public.points_transactions
     where purchase_id = p_id and type in ('purchase_earn', 'purchase_payment');
    if v_balance + v_net < 0 then
      perform public._fail('cannot_void_insufficient_balance',
        'No se puede anular: el cliente ya usó los puntos que ganó con esta compra. Haz un ajuste manual si corresponde.');
    end if;

    update public.purchases
       set status = 'voided', voided_at = now(), voided_by = v_uid, void_reason = v_reason
     where id = p_id;

    -- Primero los positivos (devolver puntos pagados), luego los negativos.
    for r in
      select * from public.points_transactions
       where purchase_id = p_id and type in ('purchase_earn', 'purchase_payment')
       order by points asc
    loop
      insert into public.points_transactions
        (customer_id, points, type, purchase_id, reverses_transaction_id, created_by, branch_id, note)
      values (r.customer_id, -r.points, 'reversal', p_id, r.id, v_uid, v_purchase.branch_id, v_reason);
    end loop;

    insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
    values (v_uid, 'void_purchase', 'purchases', p_id::text,
            jsonb_build_object('status', 'completed'),
            jsonb_build_object('status', 'voided', 'reason', v_reason, 'points_delta', v_net));
  else
    select * into v_red from public.redemptions where id = p_id for update;
    if v_red.status = 'voided' then
      perform public._fail('already_voided', 'El canje ya fue anulado.');
    end if;

    update public.redemptions
       set status = 'voided', voided_at = now(), voided_by = v_uid, void_reason = v_reason
     where id = p_id;

    for r in
      select * from public.points_transactions where redemption_id = p_id and type = 'redemption'
    loop
      insert into public.points_transactions
        (customer_id, points, type, redemption_id, reverses_transaction_id, created_by, branch_id, note)
      values (r.customer_id, -r.points, 'reversal', p_id, r.id, v_uid, v_red.branch_id, v_reason);
    end loop;

    -- Devuelve la existencia solo si la recompensa lleva control de stock.
    update public.rewards set stock = stock + 1 where id = v_red.reward_id and stock is not null;

    insert into public.audit_logs (actor_id, action, entity, entity_id, old_data, new_data)
    values (v_uid, 'void_redemption', 'redemptions', p_id::text,
            jsonb_build_object('status', 'completed'),
            jsonb_build_object('status', 'voided', 'reason', v_reason, 'points_delta', v_red.points_spent));
  end if;

  return jsonb_build_object(
    'voided', true,
    'kind', p_kind,
    'id', p_id,
    'balance', (select points_balance from public.profiles where id = v_customer)
  );
end $$;

-- ------------------------------------------- administración de usuarios -----
create function public.admin_set_user_role(p_user_id uuid, p_role public.user_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    perform public._fail('forbidden', 'Solo un administrador puede cambiar roles.', '42501');
  end if;
  if p_user_id = auth.uid() then
    perform public._fail('self_change', 'No puedes cambiar tu propio rol.');
  end if;
  update public.profiles set role = p_role where id = p_user_id;
  if not found then
    perform public._fail('user_not_found', 'Usuario no encontrado.');
  end if;
end $$;

create function public.admin_set_user_active(p_user_id uuid, p_active boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    perform public._fail('forbidden', 'Solo un administrador puede activar o desactivar usuarios.', '42501');
  end if;
  if p_user_id = auth.uid() then
    perform public._fail('self_change', 'No puedes desactivar tu propia cuenta.');
  end if;
  update public.profiles set is_active = coalesce(p_active, false) where id = p_user_id;
  if not found then
    perform public._fail('user_not_found', 'Usuario no encontrado.');
  end if;
end $$;

-- --------------------------------------------- verificación del saldo ---------
-- El saldo en caché siempre debe coincidir con la suma del ledger.
create function public.admin_find_balance_discrepancies()
returns table (customer_id uuid, cached_balance integer, ledger_balance bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then
    perform public._fail('forbidden', 'No tienes permiso para esta acción.', '42501');
  end if;
  return query
    select p.id, p.points_balance, coalesce(sum(t.points), 0)::bigint
      from public.profiles p
      left join public.points_transactions t on t.customer_id = p.id
     where p.role = 'customer'
     group by p.id, p.points_balance
    having p.points_balance <> coalesce(sum(t.points), 0);
end $$;

-- ------------------------------------------------------------ permisos ------
revoke execute on all functions in schema public from public, anon, authenticated;

-- Usadas por las políticas RLS (se evalúan con el rol del usuario).
grant execute on function public.current_user_role()          to authenticated;
grant execute on function public.is_admin()                   to authenticated;
grant execute on function public.is_staff()                   to authenticated;
grant execute on function public.can_operate_at_branch(uuid)  to authenticated;

-- API pública (RPC). Cada una valida rol y sucursal internamente.
grant execute on function public.lookup_customer_by_qr(text)                             to authenticated;
grant execute on function public.search_customers(text)                                  to authenticated;
grant execute on function public.preview_purchase(uuid, integer, integer)                to authenticated;
grant execute on function public.register_purchase(uuid, uuid, integer, integer, uuid)   to authenticated;
grant execute on function public.redeem_reward(uuid, uuid, uuid, uuid)                   to authenticated;
grant execute on function public.admin_adjust_points(uuid, integer, text, uuid)          to authenticated;
grant execute on function public.void_operation(text, uuid, text)                        to authenticated;
grant execute on function public.admin_set_user_role(uuid, public.user_role)             to authenticated;
grant execute on function public.admin_set_user_active(uuid, boolean)                    to authenticated;
grant execute on function public.admin_find_balance_discrepancies()                      to authenticated;
