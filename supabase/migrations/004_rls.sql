-- =============================================================================
-- 004_rls.sql — Row Level Security, privilegios por tabla/columna y Storage
--
-- Modelo: el rol de API NO escribe en tablas críticas (purchases, redemptions,
-- points_transactions, audit_logs). Solo lo hacen las funciones SECURITY DEFINER.
-- El administrador gestiona catálogos (sucursales, recompensas, reglas) por RLS.
-- =============================================================================

alter table public.profiles            enable row level security;
alter table public.branches            enable row level security;
alter table public.employee_branches   enable row level security;
alter table public.loyalty_settings    enable row level security;
alter table public.purchases           enable row level security;
alter table public.points_transactions enable row level security;
alter table public.rewards             enable row level security;
alter table public.redemptions         enable row level security;
alter table public.audit_logs          enable row level security;

-- ------------------------------------------------------------ privilegios ---
revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.branches, public.employee_branches, public.loyalty_settings,
                public.purchases, public.points_transactions, public.rewards, public.redemptions,
                public.audit_logs
  to authenticated;

-- El usuario solo puede editar su nombre (el resto lo bloquean además los triggers).
grant update (full_name) on public.profiles to authenticated;

-- Catálogos: la política RLS limita la escritura a administradores.
grant insert, update on public.branches          to authenticated;
grant insert, update on public.rewards           to authenticated;
grant insert, update on public.loyalty_settings  to authenticated;
grant insert, update on public.employee_branches to authenticated;

-- --------------------------------------------------------------- profiles ---
create policy profiles_select_own   on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_admin on public.profiles for select to authenticated
  using (public.is_admin());
create policy profiles_update_own   on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- --------------------------------------------------------------- branches ---
create policy branches_select_admin    on public.branches for select to authenticated
  using (public.is_admin());
create policy branches_select_employee on public.branches for select to authenticated
  using (exists (select 1 from public.employee_branches eb
                  where eb.branch_id = branches.id and eb.employee_id = auth.uid() and eb.is_active));
create policy branches_insert_admin    on public.branches for insert to authenticated
  with check (public.is_admin());
create policy branches_update_admin    on public.branches for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------- employee_branches --
create policy eb_select_own   on public.employee_branches for select to authenticated
  using (employee_id = auth.uid());
create policy eb_select_admin on public.employee_branches for select to authenticated
  using (public.is_admin());
create policy eb_insert_admin on public.employee_branches for insert to authenticated
  with check (public.is_admin());
create policy eb_update_admin on public.employee_branches for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------------------------------- loyalty_settings ---
create policy settings_select_all   on public.loyalty_settings for select to authenticated
  using (public.current_user_role() is not null);
create policy settings_insert_admin on public.loyalty_settings for insert to authenticated
  with check (public.is_admin());
create policy settings_update_admin on public.loyalty_settings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ---------------------------------------------------------------- rewards ---
create policy rewards_select_active on public.rewards for select to authenticated
  using (is_active and public.current_user_role() is not null);
create policy rewards_select_admin  on public.rewards for select to authenticated
  using (public.is_admin());
create policy rewards_insert_admin  on public.rewards for insert to authenticated
  with check (public.is_admin());
create policy rewards_update_admin  on public.rewards for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- -------------------------------- compras / canjes / movimientos (lectura) --
create policy purchases_select_customer on public.purchases for select to authenticated
  using (customer_id = auth.uid());
create policy purchases_select_employee on public.purchases for select to authenticated
  using (employee_id = auth.uid() and public.current_user_role() = 'employee');
create policy purchases_select_admin    on public.purchases for select to authenticated
  using (public.is_admin());

create policy redemptions_select_customer on public.redemptions for select to authenticated
  using (customer_id = auth.uid());
create policy redemptions_select_employee on public.redemptions for select to authenticated
  using (employee_id = auth.uid() and public.current_user_role() = 'employee');
create policy redemptions_select_admin    on public.redemptions for select to authenticated
  using (public.is_admin());

create policy points_tx_select_customer on public.points_transactions for select to authenticated
  using (customer_id = auth.uid());
create policy points_tx_select_admin    on public.points_transactions for select to authenticated
  using (public.is_admin());

-- -------------------------------------------------------------- auditoría ---
create policy audit_select_admin on public.audit_logs for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------- Storage ---
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('reward-images', 'reward-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Lectura pública (las imágenes del catálogo no son sensibles). Escritura solo admin.
create policy reward_images_read   on storage.objects for select
  using (bucket_id = 'reward-images');
create policy reward_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'reward-images' and public.is_admin());
create policy reward_images_update on storage.objects for update to authenticated
  using (bucket_id = 'reward-images' and public.is_admin());
create policy reward_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'reward-images' and public.is_admin());
