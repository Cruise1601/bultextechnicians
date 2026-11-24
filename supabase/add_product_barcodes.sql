alter table public.inventory_products
  add column if not exists barcode text;

create unique index if not exists inventory_products_barcode_unique_idx
  on public.inventory_products (btrim(barcode))
  where nullif(btrim(barcode), '') is not null;
