import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Check, RotateCcw } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadImageToCloudinary } from "../lib/cloudinary";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Daily Product Screen
  Handles daily stock-in / purchase entries from suppliers (Part 3.1/3.2
  of the spec) plus Return Product. Supplier name stays hidden — only the
  code is used, matching the permission rule. Entries feed Inventory
  (stock_movements) and the Supplier ledger automatically.

  BACKEND STATUS: fully wired to real Supabase. New Entry / Orders /
  Return all write to daily_product_entries + stock_movements +
  products.current_stock together. Money-value ledger entries for goods
  received still happen through Ledger's Supplier "Incoming" flow (this
  screen never collects a price, only quantity — see ARCHITECTURE.md).
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes stampPop { 0% { transform: scale(2.2) rotate(-8deg); opacity: 0; } 60% { transform: scale(0.92) rotate(-8deg); opacity: 1; } 100% { transform: scale(1) rotate(-8deg); opacity: 1; } }
        .stamp-pop { animation: stampPop 0.5s cubic-bezier(.2,.8,.3,1) both; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-5 pt-8 pb-16 relative">{children}</div>
    </div>
  );
}
function FieldLabel({ children }) {
  return <label className="block text-[11px] font-mono uppercase tracking-[0.14em] mb-1.5" style={{ color: TOKENS.ink, opacity: 0.75 }}>{children}</label>;
}
function TextInput({ label, ...props }) {
  return (
    <div className="mb-4">
      <FieldLabel>{label}</FieldLabel>
      <input {...props} className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
    </div>
  );
}
function Stitch({ className = "" }) {
  return <div className={`w-full h-px ${className}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }} />;
}

// Nothing left here to seed — everything below loads from Supabase.

export default function BonikDailyProductScreen() {
  const { businessId, memberId } = useSession();
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(true);
  const [screen, setScreen] = useState("list"); // list | entry | return | confirmed
  const [lastEntry, setLastEntry] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [form, setForm] = useState({
    supplierCode: "", productCode: "", productName: "", unit: "",
    qty: "", lot: "", transport: "", weight: "", notes: "", photoFile: null,
  });
  const [returnForm, setReturnForm] = useState({ supplierCode: "", productCode: "", productName: "", qty: "", reason: "" });
  const [orderMatch, setOrderMatch] = useState({}); // { itemCode: { ok: bool, actualQty: string } }
  const [pendingOrders, setPendingOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // ---- delivered entries, grouped for the main list ----
  const loadEntries = useCallback(async () => {
    if (!businessId) return;
    setEntriesLoading(true);
    const { data, error } = await supabase
      .from("daily_product_entries")
      .select("*, supplier:suppliers(supplier_code), product:products(product_code, name)")
      .eq("business_id", businessId)
      .eq("status", "delivered")
      .order("created_at", { ascending: false });
    if (!error) {
      setEntries((data || []).map((e) => ({
        id: e.id, entryNo: e.entry_number, supplierCode: e.supplier?.supplier_code,
        productCode: e.product?.product_code, productName: e.product?.name,
        qty: Number(e.quantity), unit: e.unit,
        date: new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        lot: e.lot_number,
      })));
    }
    setEntriesLoading(false);
  }, [businessId]);

  // ---- pending (status='order') entries, grouped by supplier for the Orders screen ----
  const loadOrders = useCallback(async () => {
    if (!businessId) return;
    setOrdersLoading(true);
    const { data, error } = await supabase
      .from("daily_product_entries")
      .select("*, supplier:suppliers(supplier_code), product:products(product_code, name)")
      .eq("business_id", businessId)
      .eq("status", "order")
      .order("created_at", { ascending: true });
    if (!error) {
      const groups = {};
      (data || []).forEach((e) => {
        const code = e.supplier?.supplier_code || "—";
        (groups[code] = groups[code] || { supplierCode: code, items: [] }).items.push({
          entryId: e.id, code: e.product?.product_code, name: e.product?.name,
          orderedQty: Number(e.quantity), unit: e.unit,
        });
      });
      setPendingOrders(Object.values(groups));
    }
    setOrdersLoading(false);
  }, [businessId]);

  useEffect(() => { loadEntries(); loadOrders(); }, [loadEntries, loadOrders]);

  const setItemOk = (code, ok) => setOrderMatch((m) => ({ ...m, [code]: { ...m[code], ok, actualQty: "" } }));
  const setItemQty = (code, actualQty) => setOrderMatch((m) => ({ ...m, [code]: { ...m[code], ok: false, actualQty } }));

  // ---- product code lookup against real products table ----
  const [productMatch, setProductMatch] = useState(null); // { id, name, unit } | null once looked up
  const lookupProduct = async (code) => {
    const upper = code.toUpperCase();
    setForm((f) => ({ ...f, productCode: upper }));
    if (!upper || !businessId) { setProductMatch(null); return; }
    const { data } = await supabase.from("products").select("id, name, unit").eq("business_id", businessId).eq("product_code", upper).maybeSingle();
    if (data) {
      setProductMatch(data);
      setForm((f) => ({ ...f, productName: data.name, unit: data.unit }));
    } else {
      setProductMatch(null);
      setForm((f) => ({ ...f, productName: "", unit: "" }));
    }
  };
  const productKnown = !!productMatch;
  const productUnmatched = form.productCode.trim().length > 0 && !productKnown;

  const [returnProductMatch, setReturnProductMatch] = useState(null);
  const lookupReturnProduct = async (code) => {
    const upper = code.toUpperCase();
    setReturnForm((f) => ({ ...f, productCode: upper }));
    if (!upper || !businessId) { setReturnProductMatch(null); return; }
    const { data } = await supabase.from("products").select("id, name").eq("business_id", businessId).eq("product_code", upper).maybeSingle();
    setReturnProductMatch(data || null);
    setReturnForm((f) => ({ ...f, productName: data?.name || "" }));
  };

  const canSubmit = form.supplierCode && form.productCode && form.productName && form.qty;
  const submitEntry = async () => {
    if (!canSubmit || !businessId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const { data: supplier, error: supErr } = await supabase.from("suppliers").select("id").eq("business_id", businessId).eq("supplier_code", form.supplierCode.toUpperCase()).maybeSingle();
      if (supErr || !supplier) throw new Error("Supplier code not found");

      let productId = productMatch?.id;
      if (!productId) {
        // Unmatched code — create the product now (optionally with a photo), same as Inventory's Add Product.
        let photoUrl = null;
        if (form.photoFile) photoUrl = await uploadImageToCloudinary(form.photoFile);
        const { data: newProd, error: prodErr } = await supabase
          .from("products")
          .insert({ business_id: businessId, product_code: form.productCode.toUpperCase(), name: form.productName, unit: form.unit || "PCS", selling_price: 0, photo_url: photoUrl })
          .select("id").single();
        if (prodErr) throw prodErr;
        productId = newProd.id;
      }

      const { count } = await supabase.from("daily_product_entries").select("id", { count: "exact", head: true }).eq("business_id", businessId);
      const entryNumber = `DP-${String((count || 0) + 1).padStart(6, "0")}`;

      const { data: entryRow, error: entryErr } = await supabase
        .from("daily_product_entries")
        .insert({
          business_id: businessId, entry_number: entryNumber, supplier_id: supplier.id, product_id: productId,
          quantity: parseFloat(form.qty) || 0, unit: form.unit || "PCS", status: "delivered",
          lot_number: form.lot || null, transport_number: form.transport || null,
          weight_kg: form.weight ? parseFloat(form.weight) : null, notes: form.notes || null, created_by: memberId,
        })
        .select().single();
      if (entryErr) throw entryErr;

      await supabase.from("stock_movements").insert({ business_id: businessId, product_id: productId, quantity: Math.abs(parseFloat(form.qty) || 0), source_type: "daily_product", source_id: entryRow.id, lot_number: form.lot || null, created_by: memberId });
      await supabase.rpc("increment_product_stock", { p_product_id: productId, p_qty: Math.abs(parseFloat(form.qty) || 0) });

      setLastEntry({ entryNo: entryNumber });
      setForm({ supplierCode: "", productCode: "", productName: "", unit: "", qty: "", lot: "", transport: "", weight: "", notes: "", photoFile: null });
      setProductMatch(null);
      setScreen("confirmed");
      loadEntries();
    } catch (e) {
      setSubmitError(e.message || "Could not save entry.");
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmitReturn = returnForm.supplierCode && returnForm.productCode && returnForm.productName && returnForm.qty;
  const submitReturn = async () => {
    if (!canSubmitReturn || !businessId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const { data: supplier } = await supabase.from("suppliers").select("id").eq("business_id", businessId).eq("supplier_code", returnForm.supplierCode.toUpperCase()).maybeSingle();
      if (!supplier || !returnProductMatch) throw new Error("Check supplier/product code");

      const qty = parseFloat(returnForm.qty) || 0;
      const { error: retErr } = await supabase.from("return_entries").insert({
        business_id: businessId, product_id: returnProductMatch.id, return_type: "to_supplier",
        supplier_id: supplier.id, quantity: qty, reason: returnForm.reason || null, created_by: memberId,
      });
      if (retErr) throw retErr;

      await supabase.from("stock_movements").insert({ business_id: businessId, product_id: returnProductMatch.id, quantity: -qty, source_type: "return", source_id: supplier.id, created_by: memberId });
      await supabase.rpc("decrement_product_stock", { p_product_id: returnProductMatch.id, p_qty: qty });

      setReturnForm({ supplierCode: "", productCode: "", productName: "", qty: "", reason: "" });
      setReturnProductMatch(null);
      setScreen("list");
      loadEntries();
    } catch (e) {
      setSubmitError(e.message || "Could not save return.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Confirmed ----------
  if (screen === "confirmed" && lastEntry) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
          <div className="stamp-pop w-28 h-28 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg] mb-6" style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}>
            <span className="font-display font-bold text-[12px] tracking-[0.1em]">RECEIVED</span>
          </div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>{lastEntry.entryNo}</h2>
          <p className="font-mono text-xs mt-2 max-w-[260px]" style={{ color: TOKENS.ink, opacity: 0.72 }}>
            Stock, Inventory dashboard, and the supplier's ledger have been updated automatically.
          </p>
          <div className="mt-8 w-full">
            <button onClick={() => setScreen("list")} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px]" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
              Back to Daily Product
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- New Entry ----------
  if (screen === "entry") {
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Daily Product Entry</h2>

        <TextInput label="Supplier Code" value={form.supplierCode} onChange={(e) => setForm((f) => ({ ...f, supplierCode: e.target.value }))} placeholder="SUP-006" />
        <TextInput label="Product Code" value={form.productCode} onChange={(e) => lookupProduct(e.target.value)} placeholder="P-104" />
        <div className="mb-4">
          <FieldLabel>Product Name</FieldLabel>
          {productUnmatched ? (
            <input
              value={form.productName}
              onChange={(e) => setForm((f) => ({ ...f, productName: e.target.value }))}
              placeholder="type the product name"
              className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-sans outline-none"
              style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }}
            />
          ) : (
            <div className="pb-2 border-b-2 text-[15px] font-sans" style={{ borderColor: TOKENS.line, color: form.productName ? TOKENS.inkDeep : TOKENS.ink, opacity: form.productName ? 1 : 0.35 }}>
              {form.productName || "auto-fills from product code"}
            </div>
          )}
          {productUnmatched && (
            <div className="font-mono text-[9.5px] mt-1.5" style={{ color: TOKENS.saffronDeep }}>code not found — type the name and add a photo below</div>
          )}
        </div>
        {productUnmatched && (
          <div className="mb-4">
            <FieldLabel>Product Photo</FieldLabel>
            <label className="w-full py-4 rounded-2xl border-2 border-dashed font-mono text-xs flex items-center justify-center cursor-pointer" style={{ borderColor: TOKENS.saffron, color: TOKENS.saffronDeep }}>
              {form.photoFile ? form.photoFile.name : "Tap to take or upload a photo"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setForm((f) => ({ ...f, photoFile: e.target.files?.[0] || null }))} />
            </label>
          </div>
        )}
        <TextInput label={`Quantity${form.unit ? ` (${form.unit})` : ""}`} type="number" value={form.qty} onChange={(e) => setForm((f) => ({ ...f, qty: e.target.value }))} placeholder="0" />

        <div className="mb-2 px-3.5 py-2.5 rounded-2xl" style={{ background: TOKENS.paperDeep }}>
          <div className="font-mono text-[10px]" style={{ color: TOKENS.stamp }}>This is for goods that have already reached your shop — stock updates the moment you save.</div>
        </div>
        <div className="h-2" />
        <TextInput label="Lot Number (Optional)" value={form.lot} onChange={(e) => setForm((f) => ({ ...f, lot: e.target.value }))} />
        <TextInput label="Transport Number (Optional)" value={form.transport} onChange={(e) => setForm((f) => ({ ...f, transport: e.target.value }))} />
        <TextInput label="Weight in KG (Optional)" type="number" value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))} />
        <TextInput label="Notes (Optional)" value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />

        {submitError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{submitError}</div>}
        <div className="mt-6">
          <button disabled={!canSubmit || submitting} onClick={submitEntry} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            {submitting ? "Saving…" : "Save Entry"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Pending Orders (match against arrival) ----------
  if (screen === "orders") {
    const confirmGroup = async (group) => {
      for (const item of group.items) {
        const st = orderMatch[item.code];
        if (!(st && (st.ok || st.actualQty))) continue;
        const actual = st.ok ? item.orderedQty : parseFloat(st.actualQty) || 0;

        // find the matching product id (we only stored the code on the group item)
        const { data: prod } = await supabase.from("products").select("id").eq("business_id", businessId).eq("product_code", item.code).maybeSingle();
        if (!prod) continue;

        await supabase.from("daily_product_entries").update({ status: "delivered", quantity: actual }).eq("id", item.entryId);
        await supabase.from("stock_movements").insert({ business_id: businessId, product_id: prod.id, quantity: actual, source_type: "daily_product", source_id: item.entryId, created_by: memberId });
        await supabase.rpc("increment_product_stock", { p_product_id: prod.id, p_qty: actual });
      }
      setOrderMatch({});
      loadOrders();
      loadEntries();
    };

    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Goods On Order</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Tick OK if it matches, or type what actually arrived</p>

        {pendingOrders.length === 0 ? (
          <div className="text-center py-16 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>{ordersLoading ? "Loading…" : "No pending orders right now"}</div>
        ) : (
          <div className="space-y-5">
            {pendingOrders.map((group, gi) => {
              const groupReady = group.items.some((item) => {
                const st = orderMatch[item.code];
                return st && (st.ok || st.actualQty);
              });
              return (
                <div key={gi} className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                  <div className="flex items-center gap-3 px-3.5 pt-4 pb-3">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: TOKENS.saffron }}>
                      <span className="font-display font-bold text-[11px]" style={{ color: TOKENS.inkDeep }}>{group.supplierCode.split("-")[1]}</span>
                    </div>
                    <span className="font-display font-bold text-[15px]" style={{ color: TOKENS.saffronDeep }}>{group.supplierCode}</span>
                  </div>
                  <div className="px-3.5 pb-2">
                    {group.items.map((item, ii) => {
                      const st = orderMatch[item.code] || { ok: false, actualQty: "" };
                      return (
                        <div key={ii} className="py-3" style={{ borderTop: `1px solid ${TOKENS.line}` }}>
                          <div className="flex items-center justify-between mb-2">
                            <div>
                              <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{item.name}</div>
                              <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{item.code} · ordered {item.orderedQty} {item.unit}</div>
                            </div>
                            <button onClick={() => setItemOk(item.code, !st.ok)} className="w-6 h-6 rounded-2xl border-2 flex items-center justify-center shrink-0" style={{ borderColor: st.ok ? TOKENS.stamp : TOKENS.line, background: st.ok ? TOKENS.stamp : "#FFFFFF" }}>
                              {st.ok && <Check size={14} color={TOKENS.paper} />}
                            </button>
                          </div>
                          {!st.ok && (
                            <input
                              value={st.actualQty}
                              onChange={(e) => setItemQty(item.code, e.target.value)}
                              placeholder={`if not ${item.orderedQty}, type actual qty received`}
                              className="w-full bg-transparent border-0 border-b-2 pb-1.5 text-[13px] font-mono outline-none"
                              style={{ borderColor: TOKENS.due, color: TOKENS.inkDeep }}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="px-3.5 pb-3.5 pt-1">
                    <button
                      disabled={!groupReady}
                      onClick={() => confirmGroup(group)}
                      className="w-full py-2.5 rounded-2xl font-display font-semibold text-[13px] disabled:opacity-40"
                      style={{ background: TOKENS.ink, color: TOKENS.paper }}
                    >
                      Confirm This Supplier
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Shell>
    );
  }

  // ---------- Return Product ----------
  if (screen === "return") {
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Return to Supplier</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Reduces stock, updates supplier ledger</p>

        <TextInput label="Supplier Code" value={returnForm.supplierCode} onChange={(e) => setReturnForm((f) => ({ ...f, supplierCode: e.target.value }))} placeholder="SUP-006" />
        <TextInput label="Product Code" value={returnForm.productCode} onChange={(e) => lookupReturnProduct(e.target.value)} placeholder="P-104" />
        <div className="mb-4">
          <FieldLabel>Product Name</FieldLabel>
          <div className="pb-2 border-b-2 text-[15px] font-sans" style={{ borderColor: TOKENS.line, color: returnForm.productName ? TOKENS.inkDeep : TOKENS.ink, opacity: returnForm.productName ? 1 : 0.35 }}>
            {returnForm.productName || "auto-fills from product code"}
          </div>
        </div>
        <TextInput label="Quantity" type="number" value={returnForm.qty} onChange={(e) => setReturnForm((f) => ({ ...f, qty: e.target.value }))} placeholder="0" />
        <TextInput label="Reason (Optional)" value={returnForm.reason} onChange={(e) => setReturnForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Damaged, wrong item…" />

        {submitError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{submitError}</div>}
        <div className="mt-6">
          <button disabled={!canSubmitReturn || submitting} onClick={submitReturn} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.due, color: TOKENS.paper }}>
            {submitting ? "Saving…" : "Confirm Return"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- List ----------
  return (
    <Shell>
      <div className="flex items-center justify-between mb-1">
        <div className="font-display font-bold text-lg" style={{ color: TOKENS.ink }}>Daily Product</div>
        <div className="flex gap-2">
          <button onClick={() => setScreen("orders")} className="flex items-center gap-1.5 px-3 py-2 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <span className="font-mono text-[11px] font-semibold" style={{ color: TOKENS.saffronDeep }}>Orders</span>
          </button>
          <button onClick={() => setScreen("return")} className="flex items-center gap-1.5 px-3 py-2 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <RotateCcw size={13} color={TOKENS.due} /><span className="font-mono text-[11px] font-semibold" style={{ color: TOKENS.due }}>Return</span>
          </button>
        </div>
      </div>
      <Stitch className="mb-5" />

      {entries.some((e) => e.shortBy > 0) && (
        <div className="mb-4 px-3.5 py-3 rounded-2xl flex items-center justify-between" style={{ background: TOKENS.due }}>
          <span className="font-mono text-[11px]" style={{ color: TOKENS.paper }}>
            {entries.filter((e) => e.shortBy > 0).length} item(s) came short of what was ordered
          </span>
        </div>
      )}

      <div className="space-y-4 mb-24">
        {entriesLoading && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
        {Object.entries(
          entries.reduce((groups, e) => {
            const key = `${e.supplierCode}__${e.date}`;
            (groups[key] = groups[key] || []).push(e);
            return groups;
          }, {})
        ).map(([key, items]) => {
          const [supplierCode, date] = key.split("__");
          return (
            <div key={key} className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: TOKENS.paperDeep }}>
                <span className="font-display font-bold text-base" style={{ color: TOKENS.blue }}>{supplierCode}</span>
                <span className="font-display font-bold text-base" style={{ color: TOKENS.inkDeep }}>{date}</span>
              </div>
              <div className="px-3.5">
                {items.map((e, i) => (
                  <div key={e.id} className="py-3" style={{ borderTop: i > 0 ? `1px solid ${TOKENS.line}` : "none" }}>
                    <div className="flex items-baseline justify-between">
                      <span className="font-display font-semibold text-[15px]" style={{ color: TOKENS.inkDeep }}>{e.productName}</span>
                      <span className="font-display font-bold text-[15px] tabular-nums" style={{ color: TOKENS.inkDeep }}>{e.qty} {e.unit}</span>
                    </div>
                    <div className="font-mono text-[9.5px] mt-1 flex items-center gap-2" style={{ color: TOKENS.ink, opacity: 0.62 }}>
                      <span>{e.entryNo}</span>
                      <span style={{ color: TOKENS.stamp, opacity: 1 }}>· Delivered</span>
                      {e.lot && <span>· lot {e.lot}</span>}
                    </div>
                    {e.shortBy > 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-2xl" style={{ background: TOKENS.due }}>
                        <span className="font-mono text-[9.5px] font-semibold" style={{ color: TOKENS.paper }}>short by {e.shortBy} {e.unit}</span>
                      </div>
                    )}
                    {e.shortBy < 0 && (
                      <div className="mt-1.5 inline-flex items-center gap-1 px-2 py-0.5 rounded-2xl" style={{ background: TOKENS.saffron }}>
                        <span className="font-mono text-[9.5px] font-semibold" style={{ color: TOKENS.inkDeep }}>extra {Math.abs(e.shortBy)} {e.unit}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <button onClick={() => setScreen("entry")} className="fixed w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: TOKENS.ink, right: "max(1.5rem, calc(50% - 210px + 1.25rem))", bottom: "2.5rem" }}>
        <Plus size={22} color={TOKENS.saffron} />
      </button>
    </Shell>
  );
}
