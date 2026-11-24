create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'technician' check (role in ('technician', 'shop_admin')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
grant select on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, role)
  values (new.id, 'technician')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.profiles (id, role)
select id, 'technician'
from auth.users
on conflict (id) do nothing;

create or replace function public.is_shop_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'shop_admin'
  );
$$;

revoke all on function public.is_shop_admin() from public;
grant execute on function public.is_shop_admin() to authenticated;

create table if not exists public.records (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date date not null,
  client_equipment text not null,
  activity text not null,
  work_status text not null check (work_status in ('Completed', 'Pending', 'In Progress')),
  issue_fixed text not null default '',
  spare_name text not null default '',
  spare_source text not null default '',
  spare_cost numeric(12, 2) not null default 0 check (spare_cost >= 0),
  receipt_number text not null default '',
  service_item text not null default '',
  amount_paid numeric(12, 2) not null default 0 check (amount_paid >= 0),
  payment_method text not null default '',
  payment_notes text not null default ''
);

create index if not exists records_created_at_idx
  on public.records (created_at desc);

alter table public.records enable row level security;
grant select, insert, update, delete on public.records to authenticated;

drop policy if exists "Authenticated users can read records" on public.records;
drop policy if exists "Authenticated users can create records" on public.records;
drop policy if exists "Authenticated users can update records" on public.records;
drop policy if exists "Authenticated users can delete records" on public.records;
drop policy if exists "Staff can read records" on public.records;
drop policy if exists "Staff can create records" on public.records;
drop policy if exists "Staff can update records" on public.records;
drop policy if exists "Staff can delete records" on public.records;

create policy "Staff can read records"
  on public.records for select to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid())));

create policy "Staff can create records"
  on public.records for insert to authenticated
  with check (exists (select 1 from public.profiles where id = (select auth.uid())));

create policy "Staff can update records"
  on public.records for update to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid())))
  with check (exists (select 1 from public.profiles where id = (select auth.uid())));

create policy "Staff can delete records"
  on public.records for delete to authenticated
  using (exists (select 1 from public.profiles where id = (select auth.uid())));

create table if not exists public.inventory_products (
  id uuid primary key default gen_random_uuid(),
  sku text not null unique,
  barcode text,
  name text not null,
  brand text not null default '',
  model text not null default '',
  description text not null default '',
  category text not null,
  cost_price numeric(12, 2) not null default 0 check (cost_price >= 0),
  selling_price numeric(12, 2) not null default 0 check (selling_price >= 0),
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  low_stock_threshold integer not null default 2 check (low_stock_threshold >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.inventory_products
  add column if not exists barcode text;
alter table public.inventory_products
  add column if not exists brand text not null default '',
  add column if not exists model text not null default '',
  add column if not exists description text not null default '';

create unique index if not exists inventory_products_barcode_unique_idx
  on public.inventory_products (btrim(barcode))
  where nullif(btrim(barcode), '') is not null;

create index if not exists inventory_products_name_idx
  on public.inventory_products (name);

alter table public.inventory_products enable row level security;
grant select, insert, update, delete on public.inventory_products to authenticated;

drop policy if exists "Shop admins can manage products" on public.inventory_products;
create policy "Shop admins can manage products"
  on public.inventory_products for all to authenticated
  using ((select public.is_shop_admin()))
  with check ((select public.is_shop_admin()));

create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.inventory_products (id) on delete restrict,
  movement_type text not null check (movement_type in ('received', 'sale', 'adjustment')),
  quantity_delta integer not null check (quantity_delta <> 0),
  note text not null default '',
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  check (
    (movement_type = 'received' and quantity_delta > 0)
    or (movement_type = 'sale' and quantity_delta < 0)
    or movement_type = 'adjustment'
  )
);

create index if not exists inventory_transactions_created_at_idx
  on public.inventory_transactions (created_at desc);
create index if not exists inventory_transactions_product_id_idx
  on public.inventory_transactions (product_id);

alter table public.inventory_transactions enable row level security;
grant select, insert on public.inventory_transactions to authenticated;

drop policy if exists "Shop admins can view stock activity" on public.inventory_transactions;
create policy "Shop admins can view stock activity"
  on public.inventory_transactions for select to authenticated
  using ((select public.is_shop_admin()));

drop policy if exists "Shop admins can add stock activity" on public.inventory_transactions;
create policy "Shop admins can add stock activity"
  on public.inventory_transactions for insert to authenticated
  with check (
    (select public.is_shop_admin())
    and created_by = (select auth.uid())
  );

create or replace function public.apply_inventory_transaction()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_shop_admin() or new.created_by is distinct from auth.uid() then
    raise exception 'Only shop admins can record stock activity';
  end if;

  update public.inventory_products
  set stock_quantity = stock_quantity + new.quantity_delta,
      updated_at = now()
  where id = new.product_id
    and stock_quantity + new.quantity_delta >= 0;

  if not found then
    raise exception 'Product not found or sale exceeds available stock';
  end if;

  return new;
end;
$$;

drop trigger if exists inventory_transaction_updates_stock on public.inventory_transactions;
create trigger inventory_transaction_updates_stock
  before insert on public.inventory_transactions
  for each row execute procedure public.apply_inventory_transaction();
