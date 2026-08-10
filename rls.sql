-- ============================================================================
-- BONIK by PCP — Row Level Security (RLS) Setup
-- Run this AFTER schema.sql. This is what makes multi-tenancy actually
-- safe: without it, the anon key could read/write any business's data.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Link Supabase Auth to our own `users` table
--    Supabase Auth already handles email/password — our `users` table just
--    needs to mirror the same id so business_members can point at it.
-- ----------------------------------------------------------------------------

alter table users alter column password_hash drop not null;

create or replace function public.handle_new_auth_user()
returns trigger as $$
begin
  insert into public.users (id, full_name, mobile_number, email, email_verified_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'mobile_number', ''),
    new.email,
    new.email_confirmed_at
  );
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- ----------------------------------------------------------------------------
-- 2. Helper: which business_ids does the current logged-in user belong to?
--    Every policy below reuses this instead of repeating the join.
-- ----------------------------------------------------------------------------

create or replace function public.my_business_ids()
returns setof uuid as $$
  select business_id from business_members where user_id = auth.uid();
$$ language sql stable security definer;

-- ----------------------------------------------------------------------------
-- 3. Turn RLS on for every tenant table
-- ----------------------------------------------------------------------------

alter table businesses enable row level security;
alter table business_members enable row level security;
alter table join_requests enable row level security;
alter table permissions enable row level security;
alter table audit_log enable row level security;
alter table suppliers enable row level security;
alter table customers enable row level security;
alter table products enable row level security;
alter table stock_movements enable row level security;
alter table daily_product_entries enable row level security;
alter table return_entries enable row level security;
alter table damaged_entries enable row level security;
alter table bills enable row level security;
alter table bill_items enable row level security;
alter table bill_payments enable row level security;
alter table expense_entries enable row level security;
alter table ledger_entries enable row level security;
alter table attendance enable row level security;
alter table salary_records enable row level security;
alter table leave_requests enable row level security;
alter table tasks enable row level security;
alter table shop_profiles enable row level security;
alter table shop_orders enable row level security;
alter table shop_order_items enable row level security;
alter table notification_settings enable row level security;
alter table notifications enable row level security;

-- ----------------------------------------------------------------------------
-- 4. Policies — "you can only see/change rows that belong to your business"
--    Pattern is the same for every table: business_id in my_business_ids().
--    Tables without a direct business_id (bill_items, shop_order_items)
--    join up through their parent row instead.
-- ----------------------------------------------------------------------------

create policy "member can view own business" on businesses
  for select using (id in (select my_business_ids()));

create policy "member can view own memberships" on business_members
  for select using (business_id in (select my_business_ids()));

create policy "tenant access" on suppliers
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on customers
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on products
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on stock_movements
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on daily_product_entries
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on return_entries
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on damaged_entries
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on bills
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on expense_entries
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on ledger_entries
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on shop_orders
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on notification_settings
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on notifications
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on audit_log
  for select using (business_id in (select my_business_ids()));
create policy "tenant access" on join_requests
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on permissions
  for all using (
    business_member_id in (
      select id from business_members where business_id in (select my_business_ids())
    )
  );
create policy "tenant access" on attendance
  for all using (
    business_member_id in (
      select id from business_members where business_id in (select my_business_ids())
    )
  );
create policy "tenant access" on salary_records
  for all using (
    business_member_id in (
      select id from business_members where business_id in (select my_business_ids())
    )
  );
create policy "tenant access" on leave_requests
  for all using (
    business_member_id in (
      select id from business_members where business_id in (select my_business_ids())
    )
  );
create policy "tenant access" on tasks
  for all using (business_id in (select my_business_ids()));
create policy "tenant access" on shop_profiles
  for all using (business_id in (select my_business_ids()));

-- Child rows that hang off a parent bill/order rather than having their own business_id
create policy "tenant access via bill" on bill_items
  for all using (bill_id in (select id from bills where business_id in (select my_business_ids())));
create policy "tenant access via bill" on bill_payments
  for all using (bill_id in (select id from bills where business_id in (select my_business_ids())));
create policy "tenant access via order" on shop_order_items
  for all using (order_id in (select id from shop_orders where business_id in (select my_business_ids())));

-- ----------------------------------------------------------------------------
-- 5. Public storefront needs read access WITHOUT login (customers browsing
--    products haven't signed in). Only expose what the owner marked visible.
-- ----------------------------------------------------------------------------

create policy "public can view visible online products" on products
  for select using (online_shop_visible = true);

create policy "public can view open shop profiles" on shop_profiles
  for select using (shop_open = true);

-- Anyone (even logged-out customers) can place an order — the row itself
-- still only becomes visible to the business afterward via the policy above.
create policy "anyone can insert an order" on shop_orders
  for insert with check (true);
create policy "anyone can insert order items" on shop_order_items
  for insert with check (true);
