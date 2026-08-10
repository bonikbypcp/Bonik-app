-- ============================================================================
-- BONIK by PCP — Database functions
-- Run this once in Supabase SQL Editor, same as schema.sql and rls.sql.
-- ============================================================================

-- Atomically decrement a product's cached current_stock (used on billing).
-- Done as a DB function instead of read-then-write from the frontend so two
-- staff members billing the same product at the same second can't overwrite
-- each other's stock update (a "lost update").
create or replace function decrement_product_stock(p_product_id uuid, p_qty numeric)
returns void as $$
begin
  update products
  set current_stock = current_stock - p_qty
  where id = p_product_id;
end;
$$ language plpgsql;

-- Same idea, opposite direction (used when goods arrive — Daily Product).
create or replace function increment_product_stock(p_product_id uuid, p_qty numeric)
returns void as $$
begin
  update products
  set current_stock = current_stock + p_qty
  where id = p_product_id;
end;
$$ language plpgsql;
