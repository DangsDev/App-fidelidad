-- =============================================================================
-- 001_schema.sql — Tipos, tablas, restricciones e índices
-- Importes en CENTAVOS (integer). Puntos en enteros.
-- Equivalencia de puntos: loyalty_settings.point_value_cents (inicial 100 = $1 MXN).
-- =============================================================================

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------- Tipos -----
create type public.user_role        as enum ('admin', 'employee', 'customer');
create type public.operation_status as enum ('completed', 'voided');
create type public.points_tx_type   as enum (
  'purchase_earn',          -- acumulación por compra
  'purchase_payment',       -- puntos usados como pago (total o parcial) de una compra
  'redemption',             -- descuento por canje de recompensa
  'admin_adjust_positive',  -- ajuste administrativo positivo
  'admin_adjust_negative',  -- ajuste administrativo negativo
  'reversal'                -- movimiento compensatorio de una anulación
);

-- ------------------------------------------------------------- profiles -----
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  full_name      text not null check (char_length(btrim(full_name)) between 1 and 120),
  email          text not null,
  role           public.user_role not null default 'customer',
  -- Identificador aleatorio de 128 bits. Es lo único que contiene el QR.
  qr_token       text not null unique default encode(extensions.gen_random_bytes(16), 'hex'),
  -- Caché del saldo. La fuente de verdad es points_transactions.
  points_balance integer not null default 0 check (points_balance >= 0),
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index profiles_role_idx  on public.profiles (role);
create index profiles_email_idx on public.profiles (lower(email));

-- -------------------------------------------------------------- branches ----
create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 120),
  address    text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index branches_name_uidx on public.branches (lower(btrim(name)));

-- ------------------------------------------------------ employee_branches ---
create table public.employee_branches (
  employee_id uuid not null references public.profiles (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete restrict,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  primary key (employee_id, branch_id)
);
create index employee_branches_branch_idx on public.employee_branches (branch_id);

-- ------------------------------------------------------- loyalty_settings ---
-- branch_id NULL = regla global. Una fila con branch_id sobrescribe la global
-- solo para esa sucursal (preparado para reglas por sucursal).
create table public.loyalty_settings (
  id                 uuid primary key default gen_random_uuid(),
  branch_id          uuid references public.branches (id) on delete cascade,
  cents_per_point    integer not null default 1000 check (cents_per_point > 0),   -- $10 = 1 punto
  point_value_cents  integer not null default 100  check (point_value_cents > 0),  -- 1 punto = $1 al pagar
  min_purchase_cents integer not null default 0    check (min_purchase_cents >= 0),
  accrual_enabled    boolean not null default true,
  updated_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index loyalty_settings_global_uidx on public.loyalty_settings ((true)) where branch_id is null;
create unique index loyalty_settings_branch_uidx on public.loyalty_settings (branch_id) where branch_id is not null;

-- -------------------------------------------------------------- purchases ---
create table public.purchases (
  id                        uuid primary key default gen_random_uuid(),
  customer_id               uuid not null references public.profiles (id) on delete restrict,
  employee_id               uuid not null references public.profiles (id) on delete restrict,
  branch_id                 uuid not null references public.branches (id) on delete restrict,
  total_cents               integer not null check (total_cents > 0 and total_cents <= 100000000),
  points_redeemed           integer not null default 0 check (points_redeemed >= 0),
  point_value_cents_snapshot integer not null check (point_value_cents_snapshot > 0),
  redeemed_cents            integer not null default 0 check (redeemed_cents >= 0),
  cash_cents                integer not null check (cash_cents >= 0),
  points_earned             integer not null default 0 check (points_earned >= 0),
  cents_per_point_snapshot  integer not null check (cents_per_point_snapshot > 0),
  status                    public.operation_status not null default 'completed',
  client_request_id         uuid not null unique,
  voided_at                 timestamptz,
  voided_by                 uuid references public.profiles (id) on delete restrict,
  void_reason               text,
  created_at                timestamptz not null default now(),
  constraint purchases_amounts_consistent check (
    redeemed_cents = points_redeemed * point_value_cents_snapshot
    and total_cents = cash_cents + redeemed_cents
  ),
  constraint purchases_void_consistent check ((status = 'voided') = (voided_at is not null))
);
create index purchases_customer_idx on public.purchases (customer_id, created_at desc);
create index purchases_employee_idx on public.purchases (employee_id, created_at desc);
create index purchases_branch_idx   on public.purchases (branch_id, created_at desc);

-- ---------------------------------------------------------------- rewards ---
create table public.rewards (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  description text,
  image_path  text,                                   -- ruta dentro del bucket reward-images
  points_cost integer not null check (points_cost > 0),
  is_active   boolean not null default true,
  stock       integer check (stock >= 0),             -- NULL = ilimitado
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ------------------------------------------------------------- redemptions --
create table public.redemptions (
  id                   uuid primary key default gen_random_uuid(),
  customer_id          uuid not null references public.profiles (id) on delete restrict,
  reward_id            uuid not null references public.rewards (id) on delete restrict,
  employee_id          uuid not null references public.profiles (id) on delete restrict,
  branch_id            uuid not null references public.branches (id) on delete restrict,
  points_spent         integer not null check (points_spent > 0),
  reward_name_snapshot text not null,
  status               public.operation_status not null default 'completed',
  client_request_id    uuid not null unique,
  voided_at            timestamptz,
  voided_by            uuid references public.profiles (id) on delete restrict,
  void_reason          text,
  created_at           timestamptz not null default now(),
  constraint redemptions_void_consistent check ((status = 'voided') = (voided_at is not null))
);
create index redemptions_customer_idx on public.redemptions (customer_id, created_at desc);
create index redemptions_employee_idx on public.redemptions (employee_id, created_at desc);
create index redemptions_branch_idx   on public.redemptions (branch_id, created_at desc);

-- -------------------------------------------------------- points_transactions
-- Ledger de solo inserción. El saldo = suma de points por cliente.
create table public.points_transactions (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references public.profiles (id) on delete restrict,
  points                  integer not null check (points <> 0),   -- con signo
  type                    public.points_tx_type not null,
  purchase_id             uuid references public.purchases (id) on delete restrict,
  redemption_id           uuid references public.redemptions (id) on delete restrict,
  reverses_transaction_id uuid unique references public.points_transactions (id) on delete restrict,
  created_by              uuid references public.profiles (id) on delete restrict,
  branch_id               uuid references public.branches (id) on delete restrict,
  note                    text,
  client_request_id       uuid unique,                              -- idempotencia de ajustes
  created_at              timestamptz not null default now(),
  constraint points_tx_shape check (
    case type
      when 'purchase_earn'          then points > 0 and purchase_id is not null and redemption_id is null
      when 'purchase_payment'       then points < 0 and purchase_id is not null and redemption_id is null
      when 'redemption'             then points < 0 and redemption_id is not null and purchase_id is null
      when 'admin_adjust_positive'  then points > 0 and purchase_id is null and redemption_id is null
                                         and nullif(btrim(note), '') is not null
      when 'admin_adjust_negative'  then points < 0 and purchase_id is null and redemption_id is null
                                         and nullif(btrim(note), '') is not null
      when 'reversal'               then reverses_transaction_id is not null
    end
  )
);
create index points_tx_customer_idx on public.points_transactions (customer_id, created_at desc);
create unique index points_tx_one_earn_per_purchase    on public.points_transactions (purchase_id)   where type = 'purchase_earn';
create unique index points_tx_one_payment_per_purchase on public.points_transactions (purchase_id)   where type = 'purchase_payment';
create unique index points_tx_one_per_redemption       on public.points_transactions (redemption_id) where type = 'redemption';

-- ------------------------------------------------------------- audit_logs ---
create table public.audit_logs (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete restrict,   -- NULL = proceso del sistema
  action     text not null,
  entity     text not null,
  entity_id  text,
  old_data   jsonb,
  new_data   jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx  on public.audit_logs (entity, entity_id);
