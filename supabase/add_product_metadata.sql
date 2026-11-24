alter table public.inventory_products
  add column if not exists brand text not null default '',
  add column if not exists model text not null default '',
  add column if not exists description text not null default '';
