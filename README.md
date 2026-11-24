# Baltex Electronics

Baltex Electronics brings the technician repair logbook and shop stock management into one website. Supabase provides staff sign-in and the shared database; the website itself is static.

## Supabase setup

1. Create a Supabase project.
2. In the Supabase SQL Editor, run [`supabase/schema.sql`](supabase/schema.sql). This sets up staff profiles, repair records, the product catalogue, stock activity and database access policies.
3. In **Project Settings → API**, copy the project URL and the **publishable key** (or legacy `anon` key) into [`supabase-config.js`](supabase-config.js).
4. In **Authentication → URL Configuration**, set the Site URL to the address where the app will run and add that address to the allowed redirect URLs. For local testing, allow the actual preview URL, such as `http://localhost:8000/**` or `http://localhost:3000/**` when using Live Server.
5. In **Authentication → Providers → Email**, configure email sign-up/confirmation and password reset.
6. Create the first staff account through the website. New accounts are Technicians by default. To grant Shop Admin access, run this in the Supabase SQL Editor, replacing the email:

   ```sql
   update public.profiles
   set role = 'shop_admin'
   where id = (select id from auth.users where email = 'shop-admin@example.com');
   ```

If the main schema was already installed before barcode scanning was added, also run [`supabase/add_product_barcodes.sql`](supabase/add_product_barcodes.sql) once in the SQL Editor. Run [`supabase/add_product_metadata.sql`](supabase/add_product_metadata.sql) to add product brand, model and description fields to an existing project.

Only use the publishable/anon key in the browser. **Never put a Supabase service-role key in this app.** Technician accounts can access repair records only. Shop Admin accounts can access shop stock management and the technician area. These permissions are also enforced by database Row Level Security, not just by hiding parts of the interface.

## Run locally

From the project folder, start a static file server. For example, with Python installed:

```powershell
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Shop stock workflows

- Add and edit products with an SKU, barcode, name, brand, model, description, category, cost price, selling price and low-stock threshold.
- Scan a UPC/EAN/GTIN in the catalogue to look up product name, brand, model, description and category. Verify results before saving; prices and stock remain manual. The free UPCitemdb trial has a limit of 100 combined requests per day and its data may be incomplete or inaccurate.
- Deploy [`supabase/functions/product-lookup/index.ts`](supabase/functions/product-lookup/index.ts) as a Supabase Edge Function named `product-lookup` (Dashboard → **Edge Functions** → **Deploy a new function** → **Via Editor**). The function requires a signed-in Shop Admin and proxies UPCitemdb to avoid browser CORS; no UPCitemdb API key is required. The UPC/EAN barcode is sent to UPCitemdb for lookup.
- QR links are displayed as clickable links and are never opened automatically; check the domain before opening. Non-UPC serial/authentication codes are not sent to the product lookup service. Manufacturer-specific authenticity and IMEI/serial verification is not provided.
- In the stock-operation form, scans select products already in the catalogue. Add a new item in Product Catalogue first; UPC/EAN scans there can populate its details.
- Camera scanning uses the browser-based `html5-qrcode` library loaded from jsDelivr. Scanning runs in the browser; open the site on `localhost` or HTTPS and allow camera access when prompted.
- Record stock received, sales, and positive or negative stock-count corrections.
- Available stock is updated atomically; sales that exceed available stock are rejected.
- Review the 50 most recent stock movements and low-stock alerts.
- Products with stock activity cannot be deleted; use an adjustment to correct the quantity instead.

## Files

- `supabase/schema.sql` — staff roles, database tables, stock update trigger and Row Level Security policies
- `supabase-config.js` — Supabase project URL and public client key
- `index.html` — Baltex Electronics interface
- `style.css` — styling
- `app.js` — authentication, repair records and shop inventory operations

Existing repair records remain in the shared records table. Browser-local data is not imported automatically.
