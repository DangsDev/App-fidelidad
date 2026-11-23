-- =============================================================================
-- Pruebas de seguridad y consistencia. Se ejecutan como superusuario y cambian
-- de rol con t.as_user(), igual que lo haría PostgREST con el JWT del usuario.
-- Cualquier aserción fallida aborta con "FALLÓ: ...".
-- =============================================================================
create schema t;
grant usage on schema t to anon, authenticated;

create function t.pass(p_msg text) returns void language plpgsql as $$
begin raise notice 'ok  - %', p_msg; end $$;

create function t.ok(p_cond boolean, p_msg text) returns void language plpgsql as $$
begin
  if p_cond is not true then raise exception 'FALLÓ: %', p_msg; end if;
  perform t.pass(p_msg);
end $$;

create function t.eq(p_actual bigint, p_expected bigint, p_msg text) returns void language plpgsql as $$
begin
  if p_actual is distinct from p_expected then
    raise exception 'FALLÓ: % (esperado %, obtenido %)', p_msg, p_expected, p_actual;
  end if;
  perform t.pass(p_msg);
end $$;

create function t.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', p::text, true);
  execute 'set local role authenticated';
end $$;

create function t.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', '', true);
  execute 'set local role anon';
end $$;

create function t.as_super() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claim.sub', '', true);
end $$;

-- Ejecuta SQL (bajo el rol actual) y exige que falle con ese código (DETAIL o SQLSTATE).
create function t.fails(p_sql text, p_expected text, p_msg text) returns void language plpgsql as $$
declare d text; s text;
begin
  begin
    execute p_sql;
  exception when others then
    get stacked diagnostics d = pg_exception_detail;
    s := sqlstate;
    if p_expected in (coalesce(d, ''), s) then
      perform t.pass(p_msg);
      return;
    end if;
    raise exception 'FALLÓ: % — esperaba %, obtuvo detail=% sqlstate=% (%)', p_msg, p_expected, d, s, sqlerrm;
  end;
  raise exception 'FALLÓ: % — no hubo error', p_msg;
end $$;

-- Cuenta filas visibles para el rol actual (aplica RLS).
create function t.n(p_sql text) returns bigint language plpgsql as $$
declare c bigint;
begin execute p_sql into c; return c; end $$;

-- Lecturas con privilegios del dueño (no dependen del rol activo).
create function t.sn(p_sql text) returns bigint language plpgsql security definer as $$
declare c bigint;
begin execute p_sql into c; return c; end $$;
create function t.bal(p uuid) returns integer language sql security definer as
  $$ select points_balance from public.profiles where id = p $$;
create function t.ledger_sum(p uuid) returns bigint language sql security definer as
  $$ select coalesce(sum(points), 0) from public.points_transactions where customer_id = p $$;
create function t.stock(p uuid) returns integer language sql security definer as
  $$ select stock from public.rewards where id = p $$;
create function t.qr(p uuid) returns text language sql security definer as
  $$ select qr_token from public.profiles where id = p $$;

do $$
declare
  adm  uuid := '00000000-0000-0000-0000-0000000000a0';
  emp1 uuid := '00000000-0000-0000-0000-0000000000e1';
  emp2 uuid := '00000000-0000-0000-0000-0000000000e2';
  c1   uuid := '00000000-0000-0000-0000-0000000000c1';
  c2   uuid := '00000000-0000-0000-0000-0000000000c2';
  b1 uuid; b2 uuid;
  rA uuid; rB uuid; rC uuid; rD uuid;
  r jsonb; r2 jsonb;
  req uuid; req2 uuid;
  p5 uuid; p_c2 uuid; red_a uuid; red_d uuid;
  n bigint;
begin
  raise notice '--- Preparación ---';
  insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data) values
    (adm,  'admin@test.mx', now(), '{"full_name":"Admin"}'),
    (emp1, 'emp1@test.mx',  now(), '{"full_name":"Empleado Uno"}'),
    (emp2, 'emp2@test.mx',  now(), '{"full_name":"Empleado Dos"}'),
    (c1,   'ana@test.mx',   now(), '{"full_name":"Ana Pérez","role":"admin"}'),   -- intenta colarse como admin
    (c2,   'beto@test.mx',  null,  '{"full_name":"Beto Ruiz"}');                  -- sin verificar

  perform t.ok((select role from public.profiles where id = c1) = 'customer',
               'el rol enviado en metadatos se ignora: el registro siempre es customer');
  perform t.eq(length(t.qr(c1)), 32, 'el QR es un token aleatorio de 128 bits (32 hex)');
  perform t.ok(t.qr(c1) <> t.qr(c2), 'cada cliente tiene un QR distinto');
  perform t.ok(t.qr(c1) !~* 'ana|perez|test', 'el QR no contiene datos personales');

  update public.profiles set role = 'admin'    where id = adm;
  update public.profiles set role = 'employee' where id in (emp1, emp2);
  select id into b1 from public.branches order by created_at limit 1;
  insert into public.branches (name, address) values ('Sucursal Norte', 'Av. Norte 100') returning id into b2;
  insert into public.employee_branches (employee_id, branch_id) values (emp1, b1), (emp2, b2);
  perform t.fails(format('insert into public.employee_branches (employee_id, branch_id) values (%L, %L)', c1, b1),
                  'not_an_employee', 'solo un trabajador puede asignarse a una sucursal');

  raise notice '--- Un usuario no puede escalar privilegios ni tocar tablas críticas ---';
  perform t.as_user(c1);
  update public.profiles set full_name = 'Ana P.' where id = c1;
  perform t.ok((select full_name from public.profiles where id = c1) = 'Ana P.', 'el cliente puede editar su nombre');
  perform t.fails(format('update public.profiles set role = ''admin'' where id = %L', c1), '42501', 'el cliente NO puede cambiar su rol');
  perform t.fails(format('update public.profiles set points_balance = 999999 where id = %L', c1), '42501', 'el cliente NO puede cambiar su saldo');
  perform t.fails(format('update public.profiles set qr_token = ''x'' where id = %L', c1), '42501', 'el cliente NO puede cambiar su QR');
  perform t.fails(format('update public.profiles set is_active = true where id = %L', c1), '42501', 'el cliente NO puede cambiar is_active');
  perform t.fails(format($q$insert into public.purchases (customer_id, employee_id, branch_id, total_cents, point_value_cents_snapshot, cash_cents, cents_per_point_snapshot, client_request_id)
                    values (%L, %L, %L, 1000, 100, 1000, 1000, gen_random_uuid())$q$, c1, emp1, b1),
                  '42501', 'el cliente NO puede insertar compras directamente');
  perform t.fails(format($q$insert into public.points_transactions (customer_id, points, type, created_by, note)
                    values (%L, 500, 'admin_adjust_positive', %L, 'trampa')$q$, c1, c1),
                  '42501', 'el cliente NO puede insertar movimientos de puntos');
  perform t.fails('delete from public.points_transactions', '42501', 'el cliente NO puede borrar movimientos');
  perform t.fails('select public.register_purchase(''' || c1 || ''', ''' || b1 || ''', 10000, 0, gen_random_uuid())', 'forbidden', 'el cliente NO puede registrar compras (RPC)');
  perform t.fails('select public.redeem_reward(''' || c1 || ''', gen_random_uuid(), ''' || b1 || ''', gen_random_uuid())', 'forbidden', 'el cliente NO puede procesar canjes (RPC)');
  perform t.fails('select public.admin_adjust_points(''' || c1 || ''', 100, ''me regalo'', gen_random_uuid())', 'forbidden', 'el cliente NO puede ajustar puntos');
  perform t.fails('select public.void_operation(''purchase'', gen_random_uuid(), ''x'')', 'forbidden', 'el cliente NO puede anular operaciones');
  perform t.fails('select public.lookup_customer_by_qr(''' || t.qr(c2) || ''')', 'forbidden', 'el cliente NO puede consultar a otros por QR');
  perform t.fails('select public.admin_set_user_role(''' || c1 || ''', ''admin'')', 'forbidden', 'el cliente NO puede cambiar roles vía RPC');
  perform t.eq(t.n('select count(*) from public.profiles'), 1, 'el cliente solo ve su propio perfil');
  perform t.eq(t.n('select count(*) from public.audit_logs'), 0, 'el cliente no ve la auditoría');
  perform t.eq(t.n('select count(*) from public.employee_branches'), 0, 'el cliente no ve asignaciones de sucursal');

  perform t.as_anon();
  perform t.fails('select count(*) from public.profiles', '42501', 'anónimo: sin acceso a tablas');
  perform t.fails('select public.lookup_customer_by_qr(''abc'')', '42501', 'anónimo: sin acceso a funciones');

  raise notice '--- Reglas de puntos y compras ---';
  perform t.as_user(emp1);
  update public.loyalty_settings set cents_per_point = 1;
  get diagnostics n = row_count;
  perform t.eq(n, 0, 'el trabajador NO puede modificar reglas (0 filas afectadas)');
  perform t.fails('insert into public.loyalty_settings (branch_id) values (null)', '42501', 'el trabajador NO puede crear reglas');
  perform t.fails($q$insert into public.rewards (name, points_cost) values ('x', 1)$q$, '42501', 'el trabajador NO puede crear recompensas');

  r := public.lookup_customer_by_qr(t.qr(c1));
  perform t.ok((r->>'id')::uuid = c1 and (r->>'points_balance')::int = 0, 'el trabajador identifica al cliente por QR');
  perform t.ok(r ? 'full_name' and not (r ? 'email') and not (r ? 'qr_token'), 'la respuesta del QR no expone correo ni token');
  perform t.fails($q$select public.lookup_customer_by_qr('token-inexistente')$q$, 'customer_not_found', 'QR desconocido se rechaza');
  perform t.fails($q$select public.search_customers('an')$q$, 'query_too_short', 'búsqueda manual exige 3+ caracteres');
  r := public.search_customers('ana');
  perform t.ok(jsonb_array_length(r) = 1 and (r->0->>'email_masked') = 'a***@test.mx', 'búsqueda manual encuentra al cliente con correo enmascarado');
  perform t.eq(jsonb_array_length(public.search_customers('%%%')), 0, 'los comodines LIKE se escapan');

  -- $155.00 -> 15 puntos (redondeo hacia abajo)
  req := gen_random_uuid();
  r := public.register_purchase(c1, b1, 15500, 0, req);
  perform t.eq((r->>'points_earned')::int, 15, '$155.00 acumulan 15 puntos');
  perform t.eq((r->>'balance')::int, 15, 'el saldo se actualiza');
  r2 := public.register_purchase(c1, b1, 15500, 0, req);
  perform t.ok((r2->>'duplicate')::boolean and (r2->>'purchase_id') = (r->>'purchase_id'), 'reintento con el mismo request_id devuelve la misma compra');
  perform t.eq(t.bal(c1), 15, 'el reintento NO duplica puntos');
  perform t.eq(t.n($q$select count(*) from public.purchases where client_request_id = '$q$ || req || $q$'$q$), 1, 'solo existe una compra para ese request_id');
  perform t.fails(format('select public.register_purchase(%L, %L, 99900, 0, %L)', c1, b1, req), 'request_id_conflict', 'mismo request_id con otros datos se rechaza');

  r := public.register_purchase(c1, b1, 5000, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 5, '$50.00 acumulan 5 puntos');
  r := public.register_purchase(c1, b1, 4999, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 4, '$49.99 acumulan 4 puntos (floor)');
  r := public.register_purchase(c1, b1, 999, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 0, '$9.99 acumulan 0 puntos y la compra se registra');
  perform t.eq(t.bal(c1), 24, 'saldo acumulado: 15+5+4+0');

  perform t.fails(format('select public.register_purchase(%L, %L, 0, 0, gen_random_uuid())', c1, b1), 'invalid_amount', 'importe 0 rechazado');
  perform t.fails(format('select public.register_purchase(%L, %L, -500, 0, gen_random_uuid())', c1, b1), 'invalid_amount', 'importe negativo rechazado');
  perform t.fails(format('select public.register_purchase(%L, %L, 2000000000, 0, gen_random_uuid())', c1, b1), 'invalid_amount', 'importe absurdo rechazado');
  perform t.fails(format('select public.register_purchase(%L, %L, 1000, -5, gen_random_uuid())', c1, b1), 'invalid_points', 'puntos negativos rechazados');
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 0, gen_random_uuid())', gen_random_uuid(), b1), 'customer_not_found', 'cliente inexistente rechazado');
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 0, gen_random_uuid())', emp2, b1), 'customer_not_found', 'no se puede registrar compra a un no-cliente');
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 0, gen_random_uuid())', c1, b2), 'branch_not_allowed', 'el trabajador NO opera en sucursales no asignadas');

  raise notice '--- Pago mixto (1 punto = $1) ---';
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 30, gen_random_uuid())', c1, b1), 'insufficient_points', 'no se pueden usar más puntos de los disponibles');
  perform t.fails(format('select public.register_purchase(%L, %L, 500, 6, gen_random_uuid())', c1, b1), 'points_exceed_total', 'los puntos no pueden exceder el importe');
  perform t.eq(t.bal(c1), 24, 'las compras rechazadas no cambian el saldo');

  r := public.preview_purchase(b1, 10000, 10);
  perform t.ok((r->>'cash_cents')::int = 9000 and (r->>'points_earned')::int = 9 and (r->>'redeemed_cents')::int = 1000,
               'la vista previa calcula $90 en efectivo y 9 puntos');
  r := public.register_purchase(c1, b1, 10000, 10, gen_random_uuid());
  p5 := (r->>'purchase_id')::uuid;
  perform t.ok((r->>'cash_cents')::int = 9000 and (r->>'points_earned')::int = 9 and (r->>'redeemed_cents')::int = 1000,
               '$100 con 10 puntos: paga $90, gana 9 (no gana sobre lo canjeado)');
  perform t.eq(t.bal(c1), 23, 'saldo: 24 - 10 + 9');
  perform t.eq(t.sn(format('select count(*) from public.points_transactions where purchase_id = %L', p5)), 2, 'una compra mixta deja 2 movimientos (pago y acumulación)');

  r := public.register_purchase(c1, b1, 2000, 20, gen_random_uuid());
  perform t.ok((r->>'cash_cents')::int = 0 and (r->>'points_earned')::int = 0, 'compra pagada 100% con puntos: no genera puntos');
  perform t.eq(t.bal(c1), 3, 'saldo tras pago total con puntos');
  perform t.eq(t.sn(format($q$select count(*) from public.points_transactions where purchase_id = %L and type = 'purchase_earn'$q$, r->>'purchase_id')), 0, 'sin movimiento de acumulación');

  r := public.register_purchase(c1, b1, 100000, 0, gen_random_uuid());
  perform t.eq(t.bal(c1), 103, '$1,000 suman 100 puntos');

  raise notice '--- Configuración (administrador) ---';
  perform t.as_user(adm);
  insert into public.rewards (name, description, points_cost, stock) values ('Café americano', 'Chico', 50, 1) returning id into rA;
  insert into public.rewards (name, points_cost) values ('Combo familiar', 500) returning id into rB;
  insert into public.rewards (name, points_cost, is_active) values ('Descontinuada', 10, false) returning id into rC;
  insert into public.rewards (name, points_cost) values ('Galleta', 10) returning id into rD;
  perform t.fails($q$insert into public.rewards (name, points_cost) values ('malo', 0)$q$, '23514', 'costo en puntos debe ser positivo');
  perform t.fails($q$insert into public.rewards (name, points_cost, stock) values ('malo', 5, -1)$q$, '23514', 'stock no puede ser negativo');

  update public.loyalty_settings set min_purchase_cents = 5000 where branch_id is null;
  perform t.as_user(emp1);
  r := public.register_purchase(c1, b1, 4999, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 0, 'por debajo del importe mínimo no hay puntos');
  perform t.as_user(adm);
  update public.loyalty_settings set min_purchase_cents = 0, accrual_enabled = false where branch_id is null;
  perform t.as_user(emp1);
  r := public.register_purchase(c1, b1, 10000, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 0, 'acumulación desactivada: 0 puntos');
  perform t.as_user(adm);
  update public.loyalty_settings set accrual_enabled = true, cents_per_point = 500 where branch_id is null;  -- $5 = 1 punto
  perform t.as_user(emp1);
  r := public.register_purchase(c1, b1, 10000, 0, gen_random_uuid());
  perform t.eq((r->>'points_earned')::int, 20, 'regla cambiada a $5/punto: $100 = 20 puntos');
  perform t.eq((select cents_per_point_snapshot from public.purchases where id = (r->>'purchase_id')::uuid)::bigint, 500, 'la compra guarda la regla vigente (snapshot)');
  perform t.as_user(adm);
  update public.loyalty_settings set cents_per_point = 1000 where branch_id is null;
  perform t.ok(exists (select 1 from public.audit_logs where entity = 'loyalty_settings' and actor_id = adm), 'los cambios de reglas quedan en auditoría con su autor');
  -- Saldo vigente de c1 tras las pruebas: 103 + 0 + 0 + 20 = 123
  perform t.eq(t.bal(c1), 123, 'saldo de Ana antes de canjes');

  raise notice '--- Canjes ---';
  perform t.as_user(emp1);
  req := gen_random_uuid();
  r := public.redeem_reward(c1, rA, b1, req);
  red_a := (r->>'redemption_id')::uuid;
  perform t.ok((r->>'points_spent')::int = 50 and (r->>'balance')::int = 73, 'canje descuenta 50 puntos');
  perform t.eq(t.stock(rA), 0, 'el canje descuenta stock');
  r2 := public.redeem_reward(c1, rA, b1, req);
  perform t.ok((r2->>'duplicate')::boolean, 'el reintento del mismo canje se detecta como duplicado');
  perform t.eq(t.bal(c1), 73, 'el doble toque NO cobra dos veces');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c1, rA, b1), 'out_of_stock', 'sin stock no se puede canjear');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c1, rB, b1), 'insufficient_points', 'puntos insuficientes: no hay saldo negativo');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c1, rC, b1), 'reward_unavailable', 'recompensa inactiva no se canjea');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c1, gen_random_uuid(), b1), 'reward_unavailable', 'recompensa inexistente rechazada');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c1, rD, b2), 'branch_not_allowed', 'canje en sucursal no asignada rechazado');
  perform t.eq(t.bal(c1), 73, 'los canjes rechazados no cambian el saldo');

  raise notice '--- Verificación de correo ---';
  r := public.register_purchase(c2, b1, 20000, 0, gen_random_uuid());
  p_c2 := (r->>'purchase_id')::uuid;
  perform t.eq((r->>'points_earned')::int, 20, 'cliente SIN verificar sí acumula puntos');
  perform t.fails(format('select public.register_purchase(%L, %L, 5000, 5, gen_random_uuid())', c2, b1), 'email_not_verified', 'sin verificar NO puede pagar con puntos');
  perform t.fails(format('select public.redeem_reward(%L, %L, %L, gen_random_uuid())', c2, rD, b1), 'email_not_verified', 'sin verificar NO puede canjear');
  perform t.ok(not (public.lookup_customer_by_qr(t.qr(c2))->>'email_verified')::boolean, 'el escáner informa que el correo no está verificado');
  perform t.as_super();
  update auth.users set email_confirmed_at = now() where id = c2;
  perform t.as_user(emp1);
  r := public.redeem_reward(c2, rD, b1, gen_random_uuid());
  red_d := (r->>'redemption_id')::uuid;
  perform t.eq((r->>'balance')::int, 10, 'verificado: el canje procede');
  perform t.ok(t.stock(rD) is null, 'recompensa sin stock definido permanece ilimitada');

  raise notice '--- Ajustes manuales y anulaciones ---';
  perform t.fails(format('select public.admin_adjust_points(%L, 10, ''x'', gen_random_uuid())', c1), 'forbidden', 'el trabajador NO ajusta puntos');
  perform t.fails(format('select public.void_operation(''purchase'', %L, ''error de captura'')', p5), 'forbidden', 'el trabajador NO anula operaciones');
  perform t.fails(format('select public.admin_set_user_role(%L, ''admin'')', emp1), 'forbidden', 'el trabajador NO cambia roles');
  perform t.as_user(adm);
  req := gen_random_uuid();
  r := public.admin_adjust_points(c1, 10, 'Cortesía por error en pedido', req);
  perform t.eq((r->>'balance')::int, 83, 'ajuste positivo aplicado');
  r := public.admin_adjust_points(c1, 10, 'Cortesía por error en pedido', req);
  perform t.ok((r->>'duplicate')::boolean and t.bal(c1) = 83, 'ajuste duplicado no se aplica dos veces');
  r := public.admin_adjust_points(c1, -3, 'Corrección de captura', gen_random_uuid());
  perform t.eq((r->>'balance')::int, 80, 'ajuste negativo aplicado');
  perform t.fails(format('select public.admin_adjust_points(%L, -5000, ''dejaría negativo'', gen_random_uuid())', c1), 'insufficient_points', 'un ajuste no puede dejar saldo negativo');
  perform t.fails(format('select public.admin_adjust_points(%L, 5, '''', gen_random_uuid())', c1), 'note_required', 'el ajuste exige motivo');
  perform t.fails(format('select public.admin_adjust_points(%L, 0, ''nada'', gen_random_uuid())', c1), 'invalid_points', 'ajuste de 0 rechazado');
  perform t.ok(exists (select 1 from public.audit_logs where action = 'points_adjustment' and actor_id = adm and entity_id = c1::text), 'el ajuste queda en auditoría');

  -- Anular compra mixta p5 (pagó 10, ganó 9): el cliente recupera 10 y pierde 9 => +1
  r := public.void_operation('purchase', p5, 'Error de captura del importe');
  perform t.eq((r->>'balance')::int, 81, 'anular compra mixta: +1 neto (devuelve 10, retira 9)');
  perform t.eq(t.sn(format($q$select count(*) from public.points_transactions where purchase_id = %L and type = 'reversal'$q$, p5)), 2, 'la anulación crea movimientos compensatorios');
  perform t.ok((select status from public.purchases where id = p5) = 'voided', 'la compra queda anulada (no se borra)');
  perform t.fails(format('select public.void_operation(''purchase'', %L, ''otra vez'')', p5), 'already_voided', 'no se anula dos veces');
  perform t.fails(format('select public.void_operation(''purchase'', %L, '''')', p5), 'reason_required', 'la anulación exige motivo');

  -- c2 ganó 20 con p_c2 y gastó 10 en una galleta => no se puede anular la compra sin ajustar
  perform t.fails(format('select public.void_operation(''purchase'', %L, ''devolución'')', p_c2), 'cannot_void_insufficient_balance', 'no se anula una compra cuyos puntos ya se gastaron');
  r := public.void_operation('redemption', red_d, 'Cliente no recibió el producto');
  perform t.eq((r->>'balance')::int, 20, 'anular canje devuelve los puntos');
  r := public.void_operation('purchase', p_c2, 'Devolución');
  perform t.eq((r->>'balance')::int, 0, 'ya sin puntos gastados, la compra se anula');
  r := public.void_operation('redemption', red_a, 'Producto agotado en cocina');
  perform t.eq(t.stock(rA), 1, 'anular canje con stock lo devuelve');
  perform t.eq(t.bal(c1), 131, 'saldo de Ana tras devolver 50 puntos (81 + 50)');

  raise notice '--- Historial inmutable ---';
  perform t.as_super();
  perform t.fails('update public.points_transactions set points = 999', 'immutable', 'el ledger no se puede editar (ni siendo superusuario)');
  perform t.fails('delete from public.points_transactions', 'immutable', 'el ledger no se puede borrar');
  perform t.fails('truncate public.points_transactions', 'immutable', 'el ledger no se puede truncar');
  perform t.fails('update public.audit_logs set action = ''x''', 'immutable', 'la auditoría no se puede editar');
  perform t.fails('delete from public.audit_logs', 'immutable', 'la auditoría no se puede borrar');
  perform t.fails('update public.purchases set total_cents = total_cents + 1', 'immutable', 'una compra completada no se edita');
  perform t.fails('delete from public.purchases', 'immutable', 'una compra no se borra');
  perform t.fails('delete from public.redemptions', 'immutable', 'un canje no se borra');
  perform t.fails(format($q$update public.purchases set status = 'completed', voided_at = null where id = %L$q$, p5), 'already_voided', 'una anulación no se revierte');

  raise notice '--- El saldo se reconstruye desde el historial ---';
  perform t.eq(t.ledger_sum(c1), t.bal(c1), 'Ana: saldo en caché = suma del ledger');
  perform t.eq(t.ledger_sum(c2), t.bal(c2), 'Beto: saldo en caché = suma del ledger');
  perform t.as_user(adm);
  perform t.eq((select count(*) from public.admin_find_balance_discrepancies()), 0, 'no hay discrepancias de saldo');
  perform t.as_super();
  update public.profiles set points_balance = points_balance + 1 where id = c1;   -- corrupción simulada
  perform t.as_user(adm);
  perform t.eq((select count(*) from public.admin_find_balance_discrepancies()), 1, 'una discrepancia simulada se detecta');
  perform t.as_super();
  update public.profiles set points_balance = points_balance - 1 where id = c1;
  perform t.fails($q$update public.profiles set points_balance = -1 where role = 'customer' and id = '$q$ || c1 || $q$'$q$, '23514', 'el saldo negativo está prohibido por restricción');

  raise notice '--- Visibilidad por rol (RLS) ---';
  perform t.as_user(emp2);
  perform t.eq(t.n('select count(*) from public.purchases'), 0, 'un trabajador no ve compras de otros');
  perform t.eq(t.n('select count(*) from public.profiles'), 1, 'un trabajador no lista perfiles directamente');
  perform t.eq(t.n('select count(*) from public.branches'), 1, 'un trabajador solo ve sus sucursales');
  perform t.as_user(emp1);
  perform t.ok(t.n('select count(*) from public.purchases') > 0, 'un trabajador ve las compras que él registró');
  perform t.eq(t.n('select count(*) from public.purchases where employee_id <> auth.uid()'), 0, 'solo las suyas');
  perform t.as_user(c2);
  perform t.eq(t.n('select count(*) from public.purchases where customer_id <> auth.uid()'), 0, 'un cliente solo ve sus compras');
  perform t.eq(t.n($q$select count(*) from public.rewards where is_active = false$q$), 0, 'un cliente no ve recompensas inactivas');
  perform t.ok(t.n('select count(*) from public.rewards') >= 3, 'un cliente ve el catálogo activo');
  perform t.as_user(adm);
  perform t.ok(t.n('select count(*) from public.purchases') >= 8, 'el administrador ve todas las compras');
  perform t.ok(t.n('select count(*) from public.audit_logs') > 0, 'el administrador ve la auditoría');

  raise notice '--- Gestión de usuarios y sucursales ---';
  perform t.fails(format('select public.admin_set_user_role(%L, ''customer'')', adm), 'self_change', 'el admin no cambia su propio rol');
  perform t.fails(format('select public.admin_set_user_active(%L, false)', adm), 'self_change', 'el admin no se desactiva a sí mismo');
  perform public.admin_set_user_active(emp1, false);
  perform t.as_user(emp1);
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 0, gen_random_uuid())', c1, b1), 'forbidden', 'un trabajador desactivado ya no opera');
  perform t.as_user(adm);
  perform public.admin_set_user_active(emp1, true);
  update public.branches set is_active = false where id = b2;
  perform t.as_user(emp2);
  perform t.fails(format('select public.register_purchase(%L, %L, 10000, 0, gen_random_uuid())', c1, b2), 'branch_not_allowed', 'una sucursal inactiva no admite operaciones');
  perform t.as_user(adm);
  update public.branches set is_active = true where id = b2;
  perform t.ok((select count(*) from public.audit_logs where entity = 'profiles' and action = 'update') >= 2, 'cambios de estado de usuarios quedan auditados');

  raise notice '--- Storage ---';
  perform t.as_user(c1);
  perform t.fails($q$insert into storage.objects (bucket_id, name) values ('reward-images', 'x.png')$q$, '42501', 'un cliente NO sube imágenes');
  perform t.as_user(adm);
  insert into storage.objects (bucket_id, name) values ('reward-images', 'cafe.png');
  perform t.pass('el administrador sí sube imágenes de recompensas');
  perform t.as_super();

  raise notice '=== TODAS LAS PRUEBAS SQL PASARON ===';
end $$;
