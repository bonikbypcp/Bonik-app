-- ============================================================================
-- BONIK by PCP — Schema additions (run once in Supabase SQL Editor,
-- same way as schema.sql / rls.sql / functions.sql were run)
-- ============================================================================

-- Online Shop needs to record the delivery date the owner sets when
-- approving an order, and whether the customer picked delivery or pickup.
alter table shop_orders add column if not exists delivery_date date;
alter table shop_orders add column if not exists fulfillment_type text; -- 'delivery' | 'pickup'

-- Settings: shared app-wide text size (1-20 slider, drives CSS zoom on
-- every screen) and the invoice print-format toggles. Both live directly
-- on businesses since they're one-per-business, not worth a new table.
alter table businesses add column if not exists text_size integer default 10;
alter table businesses add column if not exists print_format jsonb default '{"logo":true,"gst":true,"address":true,"ownerName":true}';

-- ============================================================================
-- Bill Scan (OCR) — photo of any bill -> auto-extracted line items
-- ============================================================================
create table if not exists bill_scans (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  image_url     text not null,
  status        text not null default 'pending', -- pending | reviewed
  created_by    uuid references business_members(id),
  created_at    timestamptz not null default now()
);

create table if not exists bill_scan_items (
  id            uuid primary key default uuid_generate_v4(),
  scan_id       uuid not null references bill_scans(id),
  business_id   uuid not null references businesses(id),
  raw_name      text not null,   -- what OCR originally read, kept for reference
  name          text not null,   -- current name — starts equal to raw_name, changes when corrected
  quantity      numeric(12,2),
  rate          numeric(12,2),
  amount        numeric(12,2),
  created_at    timestamptz not null default now()
);

create index if not exists bill_scan_items_business_name on bill_scan_items (business_id, name);

-- RLS: same business-scoped pattern as every other table (see rls.sql)
alter table bill_scans enable row level security;
alter table bill_scan_items enable row level security;

create policy "bill_scans_business_isolation" on bill_scans
  for all using (business_id in (select business_id from business_members where user_id = auth.uid()));

create policy "bill_scan_items_business_isolation" on bill_scan_items
  for all using (business_id in (select business_id from business_members where user_id = auth.uid()));
