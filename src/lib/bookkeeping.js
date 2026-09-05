// BONIK by PCP — Bookkeeping service layer
//
// Core app rule: "One Entry → Multiple Automatic Updates". A single
// user action (confirming a bill, receiving stock, paying an expense)
// must always update every dependent table together. These functions
// are the ONE place that happens, so no screen ever writes half of a
// transaction and forgets the rest.
//
// NOTE: Supabase's JS client doesn't expose multi-table SQL
// transactions directly, so each function below runs its inserts in
// careful order (parent row first, then children) and throws on the
// first failure so the calling screen can show an error instead of
// silently leaving a half-written bill. Moving this into a single
// Postgres RPC function later (a real transaction) is the natural next
// upgrade once the basic flow is proven — noted in ARCHITECTURE.md.

import { supabase } from "./supabaseClient";

async function nextSequenceNumber(businessId, table, column, prefix) {
  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);
  if (error) throw error;
  const n = (count || 0) + 1;
  return `${prefix}-${String(n).padStart(5, "0")}`;
}

// ---------------------------------------------------------------------
// BILLING: confirm a bill -> bills + bill_items + bill_payments
//          + stock_movements (deduct sold qty) + ledger_entries (if due)
// ---------------------------------------------------------------------
export async function confirmBill({
  businessId,
  memberId,
  customerId,      // null allowed for walk-in/no-customer bills
  lines,           // [{ productId, qty, rate }]
  subtotal,
  discountTotal,
  paidCash,
  paidOnline,
  paidBank,
  dueAmount,
  fullPaymentTick,
}) {
  if (!businessId) throw new Error("No active business in session.");
  if (!lines?.length) throw new Error("Bill has no items.");

  const grandTotal = subtotal - discountTotal;
  const billNumber = await nextSequenceNumber(businessId, "bills", "bill_number", "BILL");

  // 1) bills
  const { data: bill, error: billErr } = await supabase
    .from("bills")
    .insert({
      business_id: businessId,
      bill_number: billNumber,
      customer_id: customerId,
      status: "confirmed",
      subtotal,
      discount_total: discountTotal,
      grand_total: grandTotal,
      paid_cash: paidCash,
      paid_online: paidOnline,
      paid_bank: paidBank,
      due_amount: dueAmount,
      full_payment_tick: fullPaymentTick,
      confirmed_at: new Date().toISOString(),
      created_by: memberId,
    })
    .select()
    .single();
  if (billErr) throw billErr;

  // 2) bill_items
  const itemRows = lines.map((l) => ({
    bill_id: bill.id,
    product_id: l.productId,
    quantity: l.qty,
    unit_price: l.rate,
    discount: 0,
    total: l.qty * l.rate,
  }));
  const { error: itemsErr } = await supabase.from("bill_items").insert(itemRows);
  if (itemsErr) throw itemsErr;

  // 3) bill_payments — one row per method actually used
  const paymentRows = [];
  if (paidCash > 0) paymentRows.push({ bill_id: bill.id, method: "cash", routed_to: "company", amount: paidCash });
  if (paidOnline > 0) paymentRows.push({ bill_id: bill.id, method: "online", routed_to: "company", amount: paidOnline });
  if (paidBank > 0) paymentRows.push({ bill_id: bill.id, method: "bank", routed_to: "company", amount: paidBank });
  if (paymentRows.length) {
    const { error: payErr } = await supabase.from("bill_payments").insert(paymentRows);
    if (payErr) throw payErr;
  }

  // 4) stock_movements — negative quantity = stock going out
  const stockRows = lines.map((l) => ({
    business_id: businessId,
    product_id: l.productId,
    quantity: -Math.abs(l.qty),
    source_type: "bill",
    source_id: bill.id,
    created_by: memberId,
  }));
  const { error: stockErr } = await supabase.from("stock_movements").insert(stockRows);
  if (stockErr) throw stockErr;

  // 4b) keep products.current_stock (cached column) in sync
  for (const l of lines) {
    const { error: rpcErr } = await supabase.rpc("decrement_product_stock", {
      p_product_id: l.productId,
      p_qty: Math.abs(l.qty),
    });
    if (rpcErr) throw rpcErr;
  }

  // 5) ledger_entries — only if this customer now owes money on this bill
  if (customerId && dueAmount > 0) {
    const { error: ledgerErr } = await supabase.from("ledger_entries").insert({
      business_id: businessId,
      account_type: "customer",
      account_id: customerId,
      direction: "debit", // customer owes the business
      amount: dueAmount,
      source_type: "bill",
      source_id: bill.id,
      note: `Bill ${billNumber} due`,
    });
    if (ledgerErr) throw ledgerErr;
  }

  return bill;
}
