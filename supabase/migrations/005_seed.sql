-- =============================================================================
-- 005_seed.sql — Configuración inicial mínima (NO son datos ficticios)
-- Una sucursal editable desde el panel y la regla global de puntos.
-- =============================================================================

insert into public.branches (name, address)
select 'Sucursal principal', null
where not exists (select 1 from public.branches);

-- 1 punto por cada $10 MXN pagados; 1 punto equivale a $1 MXN al pagar.
insert into public.loyalty_settings (branch_id, cents_per_point, point_value_cents, min_purchase_cents, accrual_enabled)
select null, 1000, 100, 0, true
where not exists (select 1 from public.loyalty_settings where branch_id is null);
