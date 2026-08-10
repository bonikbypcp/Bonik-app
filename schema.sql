-- ============================================================================
-- BONIK by PCP — Core Database Schema (v1, PostgreSQL)
-- Companion to ARCHITECTURE.md — read that first for the reasoning.
-- ============================================================================

create extension if not exists "uuid-ossp";

-- ============================================================================
-- 1. IDENTITY
-- ============================================================================

create table users (
  id                 uuid primary key default uuid_generate_v4(),
  full_name          text not null,
  mobile_number      text not null unique,
  email              text not null unique,
  email_verified_at  timestamptz,
  password_hash      text not null,
  created_at         timestamptz not null default now()
);

-- ============================================================================
-- 2. BUSINESSES & HIERARCHY
-- ============================================================================

create table businesses (
  id                  uuid primary key default uuid_generate_v4(),
  parent_business_id  uuid references businesses(id),
  name                text not null,
  category            text not null,
  owner_user_id       uuid not null references users(id),
  mobile_number       text,
  address             text,
  gst_number          text,
  shop_photo_url      text,               -- doubles as the logo
  currency            text not null default 'INR',
  timezone            text not null default 'Asia/Kolkata',
  language            text not null default 'bn',
  is_parent           boolean not null default false,
  status              text not null default 'active', -- active | suspended
  created_at          timestamptz not null default now()
);

-- what a parent is allowed to see of a child, per child
create table parent_link_permissions (
  id                 uuid primary key default uuid_generate_v4(),
  parent_business_id uuid not null references businesses(id),
  child_business_id  uuid not null references businesses(id),
  allow_summary      boolean not null default true,
  allow_supplier_info boolean not null default false,
  allow_purchase_price boolean not null default false,
  unique (parent_business_id, child_business_id)
);

-- ============================================================================
-- 3. MEMBERSHIP, ROLES, JOIN REQUESTS, PERMISSIONS
-- ============================================================================

create type member_role as enum ('owner', 'ceo', 'manager', 'staff', 'customer', 'parent_company');

create table business_members (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  user_id       uuid not null references users(id),
  role          member_role not null,
  staff_code    text,                 -- unique per business, used across staff/expense/ledger
  designation   text,                 -- CEO / Manager / Cashier / etc, free text label
  status        text not null default 'active', -- active | inactive
  joined_at     timestamptz not null default now(),
  unique (business_id, user_id),
  unique (business_id, staff_code)
);

create table join_requests (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  user_id       uuid not null references users(id),
  requested_role member_role not null,
  status        text not null default 'pending', -- pending | approved | rejected
  decided_by    uuid references business_members(id),
  decided_at    timestamptz,
  created_at    timestamptz not null default now()
);

-- module/action permission matrix per member
create table permissions (
  id                 uuid primary key default uuid_generate_v4(),
  business_member_id uuid not null references business_members(id),
  module             text not null, -- billing | inventory | daily_product | daily_expense | ledger | staff | reports | online_shop | settings
  action             text not null, -- view | add | edit | delete | export | print | price_edit | purchase_price_view | barcode
  allowed            boolean not null default false,
  unique (business_member_id, module, action)
);

create table audit_log (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  actor_member_id uuid references business_members(id),
  action        text not null,       -- e.g. 'bill.confirm', 'product.edit'
  entity_type   text,
  entity_id     uuid,
  metadata      jsonb,
  device_info   jsonb,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 4. SUPPLIERS & CUSTOMERS
-- ============================================================================

create table suppliers (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  supplier_code text not null,
  name          text not null,     -- shown per permission
  mobile_number text,
  address       text,
  created_at    timestamptz not null default now(),
  unique (business_id, supplier_code)
);

create table customers (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  customer_code text not null,
  name          text not null,
  mobile_number text,
  address       text,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (business_id, customer_code)
);

-- ============================================================================
-- 5. PRODUCTS & INVENTORY
-- ============================================================================

create table products (
  id                 uuid primary key default uuid_generate_v4(),
  business_id        uuid not null references businesses(id),
  product_code       text not null,
  name               text not null,
  category           text,
  unit               text not null,           -- PCS | KG | Bundle | Box
  selling_price      numeric(12,2) not null,
  min_order_qty      numeric(12,2) not null default 1,
  low_stock_limit    numeric(12,2) not null default 0,
  current_stock      numeric(12,2) not null default 0,   -- cached; source of truth = stock_movements
  barcode_enabled    boolean not null default false,
  online_shop_visible boolean not null default false,
  online_show_stock  boolean not null default true,
  online_show_price  boolean not null default true,
  photo_url          text,
  status             text not null default 'active',
  created_at         timestamptz not null default now(),
  unique (business_id, product_code)
);

-- every stock change, from any module, lands here; current_stock is derived from this
create table stock_movements (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  product_id    uuid not null references products(id),
  quantity      numeric(12,2) not null,   -- positive = in, negative = out
  source_type   text not null,            -- daily_product | bill | return | damage | adjustment
  source_id     uuid not null,            -- id of the row that caused this movement
  lot_number    text,
  batch_number  text,
  created_by    uuid references business_members(id),
  created_at    timestamptz not null default now()
);

create table daily_product_entries (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references businesses(id),
  entry_number    text not null,
  supplier_id     uuid references suppliers(id),
  product_id      uuid not null references products(id),
  quantity        numeric(12,2) not null,
  unit            text not null,
  status          text not null default 'order', -- order | delivered
  lot_number      text,
  transport_number text,
  weight_kg       numeric(12,2),
  notes           text,
  created_by      uuid references business_members(id),
  created_at      timestamptz not null default now(),
  unique (business_id, entry_number)
);

create table return_entries (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  product_id    uuid not null references products(id),
  return_type   text not null,        -- to_supplier | from_customer
  supplier_id   uuid references suppliers(id),
  customer_id   uuid references customers(id),
  bill_id       uuid,                 -- set if returned against a specific bill
  quantity      numeric(12,2) not null,
  reason        text,
  created_by    uuid references business_members(id),
  created_at    timestamptz not null default now()
);

create table damaged_entries (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  product_id    uuid not null references products(id),
  quantity      numeric(12,2) not null,
  reason        text,
  loss_amount   numeric(12,2),
  created_by    uuid references business_members(id),
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- 6. BILLING
-- ============================================================================

create table bills (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references businesses(id),
  bill_number     text not null,
  customer_id     uuid references customers(id),
  status          text not null default 'pending', -- pending | confirmed | dismissed | cancelled
  subtotal        numeric(12,2) not null default 0,
  discount_total  numeric(12,2) not null default 0,
  grand_total     numeric(12,2) not null default 0,
  paid_cash       numeric(12,2) not null default 0,
  paid_online     numeric(12,2) not null default 0,
  paid_bank       numeric(12,2) not null default 0,
  due_amount      numeric(12,2) not null default 0,
  full_payment_tick boolean not null default false,
  dismissed_by    uuid references business_members(id),
  confirmed_at    timestamptz,
  created_by      uuid references business_members(id),
  created_at      timestamptz not null default now(),
  unique (business_id, bill_number)
);

create table bill_items (
  id            uuid primary key default uuid_generate_v4(),
  bill_id       uuid not null references bills(id),
  product_id    uuid not null references products(id),
  quantity      numeric(12,2) not null,
  unit_price    numeric(12,2) not null,
  discount      numeric(12,2) not null default 0,
  total          numeric(12,2) not null
);

-- a payment can route to company account, a supplier, or a staff member
create table bill_payments (
  id              uuid primary key default uuid_generate_v4(),
  bill_id         uuid not null references bills(id),
  method          text not null,          -- cash | online | bank
  routed_to       text not null default 'company', -- company | supplier | staff
  supplier_id     uuid references suppliers(id),
  staff_member_id uuid references business_members(id),
  amount          numeric(12,2) not null,
  proof_photo_url text,
  created_at      timestamptz not null default now()
);

-- ============================================================================
-- 7. DAILY EXPENSE
-- ============================================================================

create table expense_entries (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references businesses(id),
  entry_number    text not null,
  category        text not null,      -- bus_fare | rickshaw_fare | supplier_payment | tiffin | transport_payment | staff_salary | shop_expense | ...
  classification  text not null,      -- fixed | variable  (system-derived from category)
  amount          numeric(12,2) not null,
  supplier_id     uuid references suppliers(id),
  transport_code  text,
  staff_member_id uuid references business_members(id),
  description     text,
  created_by      uuid references business_members(id),
  created_at      timestamptz not null default now(),
  unique (business_id, entry_number)
);

-- ============================================================================
-- 8. UNIFIED LEDGER  (Customer / Supplier / Staff / Transport / Company)
-- ============================================================================

create table ledger_entries (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  account_type  text not null,   -- customer | supplier | staff | transport | company
  account_id    uuid,            -- points at customers.id / suppliers.id / business_members.id / transport code row / null for company
  direction     text not null,   -- debit | credit
  amount        numeric(12,2) not null,
  source_type   text not null,   -- bill | daily_product | expense | return | salary | transport_payment
  source_id     uuid not null,
  note          text,
  created_at    timestamptz not null default now()
);
-- Reports read this table filtered by account_type/account_id + date range
-- instead of five separate ledger tables.

-- ============================================================================
-- 9. STAFF MANAGEMENT
-- ============================================================================

create table attendance (
  id                uuid primary key default uuid_generate_v4(),
  business_member_id uuid not null references business_members(id),
  work_date         date not null,
  check_in          timestamptz,
  check_out         timestamptz,
  status            text not null default 'present', -- present | absent | leave
  unique (business_member_id, work_date)
);

create table salary_records (
  id                uuid primary key default uuid_generate_v4(),
  business_member_id uuid not null references business_members(id),
  period            text not null,     -- e.g. '2026-08'
  base_salary       numeric(12,2) not null,
  advance           numeric(12,2) not null default 0,
  bonus             numeric(12,2) not null default 0,
  deduction         numeric(12,2) not null default 0,
  payable           numeric(12,2) not null,
  paid_at           timestamptz,
  unique (business_member_id, period)
);

create table leave_requests (
  id                uuid primary key default uuid_generate_v4(),
  business_member_id uuid not null references business_members(id),
  start_date        date not null,
  end_date          date not null,
  paid              boolean not null default false,
  status            text not null default 'pending', -- pending | approved | rejected
  decided_by        uuid references business_members(id),
  created_at        timestamptz not null default now()
);

create table tasks (
  id                uuid primary key default uuid_generate_v4(),
  business_id       uuid not null references businesses(id),
  assigned_to       uuid references business_members(id),
  title             text not null,
  description       text,
  due_date          date,
  priority          text not null default 'medium', -- low | medium | high
  status            text not null default 'pending', -- pending | in_progress | completed
  created_by        uuid references business_members(id),
  created_at        timestamptz not null default now()
);

-- ============================================================================
-- 10. ONLINE SHOP
-- ============================================================================

create table shop_profiles (
  business_id     uuid primary key references businesses(id),
  shop_open       boolean not null default true,
  online_order_enabled boolean not null default true,
  whatsapp_order_enabled boolean not null default false,
  online_payment_enabled boolean not null default false,
  min_order_amount numeric(12,2) default 0,
  delivery_charge  numeric(12,2) default 0,
  delivery_areas   text[],
  description      text,
  business_hours   text
);

create table shop_orders (
  id              uuid primary key default uuid_generate_v4(),
  business_id     uuid not null references businesses(id),
  order_number    text not null,
  customer_name   text not null,
  customer_mobile text not null,
  delivery_address text not null,
  note            text,
  status          text not null default 'new', -- new | confirmed | packed | out_for_delivery | delivered | cancelled
  payment_method  text,                        -- cod | upi | bank_transfer
  payment_status  text default 'unpaid',
  total_amount    numeric(12,2) not null default 0,
  linked_bill_id  uuid references bills(id),   -- set once owner bills it offline
  created_at      timestamptz not null default now(),
  unique (business_id, order_number)
);

create table shop_order_items (
  id              uuid primary key default uuid_generate_v4(),
  order_id        uuid not null references shop_orders(id),
  product_id      uuid not null references products(id),
  quantity        numeric(12,2) not null,
  unit_price      numeric(12,2) not null
);

-- ============================================================================
-- 11. NOTIFICATIONS
-- ============================================================================

create table notification_settings (
  business_id       uuid primary key references businesses(id),
  low_stock_alert   boolean not null default true,
  due_reminder      boolean not null default true,
  salary_reminder   boolean not null default true,
  new_order_alert   boolean not null default true,
  daily_report      boolean not null default false,
  monthly_report    boolean not null default false
);

create table notifications (
  id            uuid primary key default uuid_generate_v4(),
  business_id   uuid not null references businesses(id),
  recipient_member_id uuid references business_members(id),
  type          text not null,
  message       text not null,
  read_at       timestamptz,
  created_at    timestamptz not null default now()
);

-- ============================================================================
-- Indexes worth adding on day one (every tenant table is queried by business_id constantly)
-- ============================================================================
create index on business_members (business_id);
create index on products (business_id);
create index on stock_movements (business_id, product_id);
create index on bills (business_id, status);
create index on ledger_entries (business_id, account_type, account_id);
create index on expense_entries (business_id, created_at);
create index on shop_orders (business_id, status);
create index on audit_log (business_id, created_at);
