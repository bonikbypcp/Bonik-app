# BONIK by PCP — System Architecture (v1)

## 1. Tenancy model

Single database, shared schema, **row-level multi-tenancy**: every business-owned
table carries a `business_id`. This is simplest to build and scale for an MVP-to-mid
scale SaaS, and keeps "One Entry → Multiple Automatic Updates" easy — everything
downstream just filters/writes by `business_id`.

Every query from the app layer must be scoped by `business_id` **and** by the
requesting user's permissions (checked server-side, never trusted from the client).

Isolation rule: a business's rows are never joinable to another business's rows,
except through the explicit `parent_business_id` relationship, and even then only
read access to pre-approved summary fields (see §3).

## 2. Identity vs. Membership (important split)

A **person** (`users`) is separate from their **role in a specific business**
(`business_members`). The same phone/email can:
- own Business A,
- be a manager in Business B,
- be a customer of Business C.

This is why registration (Part 2 of the spec) collects account info once, then
role + business is chosen per *membership*, not per user account.

## 3. Business hierarchy

`businesses.parent_business_id` self-references `businesses.id`.
- Parent Company = a business row with `is_parent = true` and children pointing
  at it.
- A parent can read a child's `business_summary_view` (rollup of sales/profit/
  expense totals) only if `parent_link_permissions.allow_summary = true` for
  that child.
- A parent can **never** write to a child's operational tables directly — there
  is no code path for it. This is enforced at the service layer, not just UI.

## 4. Join-by-approval (no business code / QR)

`join_requests`: a user applies to a business (found by name search), the
business owner/manager approves or rejects it. On approval, a `business_members`
row is created with the role and permission set the approver assigns. This
replaces the original business-code/QR idea per your correction.

## 5. Permission model

Flat, explicit, per-module-per-action rows in `permissions` (a matrix, not a
bitmask) so it stays readable and auditable:
`(business_member_id, module, action) → boolean`. Modules mirror the app's
modules (billing, inventory, ledger, daily_product, daily_expense, staff,
reports, online_shop, settings). Actions: view/add/edit/delete/export/print
(subset per module). Defaults: Staff = all false, Manager = owner-defined,
Owner = all true implicitly (never stored as rows, checked as a role shortcut).

## 6. The "One Entry → Multiple Update" mechanism

Rather than scattering update logic across the app, every state-changing action
(confirm a bill, confirm a daily-product entry, confirm an expense) writes to
its own table **and** appends to a single `ledger_entries` table and a single
`stock_movements` table through **one service-layer function per action** —
not database triggers. Triggers would match the spec's automation promise, but
service-layer functions are easier to test, log, and evolve as you add modules,
and they're what let us emit the audit log and notifications from the same
place. Reports/dashboards are then just read-queries (or materialized views
later, once real load shows up) over `ledger_entries` + `stock_movements` +
the source tables — never a second place data gets written.

## 7. Unified ledger, not five separate ledger tables

Customer/Supplier/Staff/Transport/Company "ledgers" in the spec are really one
concept — a running account — viewed through five different filters. Modeled
as one `ledger_entries` table with `account_type` + `account_id`, so Reports
and the Ledger dashboard both query one table instead of five, and adding a
6th account type later (e.g. a Franchise ledger) needs no schema change.

## 8. Stock is derived, never hand-edited

`inventory_items.current_stock` is a cached number, but the source of truth is
the sum of `stock_movements` for that product. Daily Product, Billing, Return,
Damage, and permissioned Stock Adjustment are the only five places allowed to
insert a `stock_movements` row — matching your "no manual stock edit" rule.

## 9. Offline mode & sync (flagged for later)

Every insert-able table gets a `client_generated_id` (UUID created on-device)
so offline-created rows can sync later without collision, plus `synced_at` and
`server_received_at` timestamps for conflict resolution. This is designed for
now but not built until the app shell exists — no point building sync logic
before there's a client to sync from.

## 10. Soft-delete + audit, everywhere financial

Ledger, billing, and inventory rows are **never hard-deleted**. A `status`
column (`active` / `cancelled` / `dismissed`) plus `audit_log` covers the
spec's "nothing is permanently deleted" requirement in one mechanism instead
of two.

## 11. What's deliberately not in v1

Barcode/lot tracking, online payment gateway, multi-warehouse, and AI features
are represented as nullable/optional columns or separate tables that simply
aren't populated yet — not bolted on later as migrations, since the spec
already tells us they're coming.
