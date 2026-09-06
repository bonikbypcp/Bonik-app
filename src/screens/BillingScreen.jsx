import React, { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { Search, Plus, X, Check, Printer, ArrowLeft, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";
import { confirmBill } from "../lib/bookkeeping";

/*
  BONIK by PCP — Billing Screen
  Flow: Customer List (default) -> Add Customer (if needed) -> Bill Table
  (paper-bill style, letterhead header for the specific business) -> Confirmed.
  NOTE: the letterhead always reflects the CURRENT business's own details —
  if this business is a Child Company, only its own info shows here, never
  the Parent Company's.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};

function Stitch({ className = "" }) {
  return (
    <div
      className={`w-full h-px ${className}`}
      style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }}
    />
  );
}

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes stampPop {
          0% { transform: scale(2.2) rotate(-8deg); opacity: 0; }
          60% { transform: scale(0.92) rotate(-8deg); opacity: 1; }
          100% { transform: scale(1) rotate(-8deg); opacity: 1; }
        }
        .stamp-pop { animation: stampPop 0.5s cubic-bezier(.2,.8,.3,1) both; }
        .bill-input { background: transparent; outline: none; width: 100%; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-4 pt-8 pb-16 relative">{children}</div>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label className="block text-[11px] font-mono uppercase tracking-[0.14em] mb-1.5" style={{ color: TOKENS.ink, opacity: 0.75 }}>
      {children}
    </label>
  );
}

function TextInput({ label, ...props }) {
  return (
    <div className="mb-4">
      <FieldLabel>{label}</FieldLabel>
      <input
        {...props}
        className="w-full border-0 border-b-2 rounded-t-lg px-2.5 pt-2 pb-2 text-[15px] font-sans outline-none"
        style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}
        onFocus={(e) => (e.target.style.borderColor = TOKENS.saffron)}
        onBlur={(e) => (e.target.style.borderColor = TOKENS.line)}
      />
    </div>
  );
}

export default function BonikBillingScreen() {
  const { businessId, memberId, staffCode, business } = useSession();

  const [screen, setScreen] = useState("customerList"); // customerList | addCustomer | billTable | confirmed
  const [customers, setCustomers] = useState([]);
  const [customersLoading, setCustomersLoading] = useState(true);
  const [customer, setCustomer] = useState(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [newCustomer, setNewCustomer] = useState({ name: "", mobile: "", address: "" });

  const [lines, setLines] = useState([]);
  const [draft, setDraft] = useState({ code: "", name: "", qty: "", rate: "" });
  const [stage, setStage] = useState("code");
  const [codeError, setCodeError] = useState("");
  const codeRef = useRef(null);
  const qtyRef = useRef(null);
  const rateRef = useRef(null);

  const [payments, setPayments] = useState({ cash: "", online: "", bank: "" });
  const [fullPaymentTick, setFullPaymentTick] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [confirmedBill, setConfirmedBill] = useState(null); // { bill_number } after a real confirm

  const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

  // ---- Load this business's customers (with each one's live due, from ledger_entries) ----
  const loadCustomers = useCallback(async () => {
    if (!businessId) return;
    setCustomersLoading(true);
    const { data: custRows, error: custErr } = await supabase
      .from("customers")
      .select("*")
      .eq("business_id", businessId)
      .order("name", { ascending: true });

    if (custErr) {
      setCustomersLoading(false);
      return;
    }

    const { data: dueRows } = await supabase
      .from("ledger_entries")
      .select("account_id, direction, amount")
      .eq("business_id", businessId)
      .eq("account_type", "customer");

    const dueByCustomer = {};
    (dueRows || []).forEach((r) => {
      const delta = r.direction === "debit" ? r.amount : -r.amount;
      dueByCustomer[r.account_id] = (dueByCustomer[r.account_id] || 0) + delta;
    });

    setCustomers(
      (custRows || []).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.customer_code,
        mobile: c.mobile_number,
        address: c.address,
        prevDue: dueByCustomer[c.id] || 0,
      }))
    );
    setCustomersLoading(false);
  }, [businessId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  const subtotal = useMemo(() => lines.reduce((s, l) => s + l.qty * l.rate, 0), [lines]);
  const totalPaid = (parseFloat(payments.cash) || 0) + (parseFloat(payments.online) || 0) + (parseFloat(payments.bank) || 0);
  // Full Payment ticked with nothing entered -> treat as fully paid in cash, no discount.
  // Full Payment ticked with a partial amount entered -> the shortfall becomes an automatic discount, not a due.
  // Full Payment not ticked -> normal behaviour, shortfall becomes Due.
  const discountAmount = fullPaymentTick && totalPaid > 0 && totalPaid < subtotal ? subtotal - totalPaid : 0;
  const dueAmount = fullPaymentTick ? 0 : Math.max(subtotal - totalPaid, 0);
  // "Full Payment tick with nothing entered" = the whole bill is cash, per business rule.
  const actualPaidCash = fullPaymentTick && totalPaid === 0 ? subtotal : (parseFloat(payments.cash) || 0);

  const filteredCustomers = customers.filter((c) => c.name.toLowerCase().includes(customerQuery.toLowerCase()));

  const selectCustomer = (c) => {
    setCustomer(c);
    setScreen("billTable");
  };

  const submitNewCustomer = async () => {
    if (!newCustomer.name || !newCustomer.mobile || !businessId) return;
    // customer_code: simple next-in-sequence based on how many customers this business has.
    const code = `CUST-${String(customers.length + 1).padStart(3, "0")}`;
    const { data, error } = await supabase
      .from("customers")
      .insert({
        business_id: businessId,
        customer_code: code,
        name: newCustomer.name,
        mobile_number: newCustomer.mobile,
        address: newCustomer.address || null,
      })
      .select()
      .single();
    if (error) {
      setSubmitError(error.message);
      return;
    }
    const c = { id: data.id, name: data.name, code: data.customer_code, mobile: data.mobile_number, address: data.address, prevDue: 0 };
    setCustomers((prev) => [...prev, c]);
    selectCustomer(c);
  };

  const handleCodeEnter = async () => {
    const code = draft.code.trim().toUpperCase();
    if (!code || !businessId) return;
    setCodeError("");
    const { data: p, error } = await supabase
      .from("products")
      .select("id, product_code, name, selling_price, unit")
      .eq("business_id", businessId)
      .eq("product_code", code)
      .maybeSingle();
    if (error || !p) {
      setCodeError("Product not found");
      return;
    }
    setDraft({ code: p.product_code, name: p.name, qty: 1, rate: p.selling_price, productId: p.id });
    setStage("qty");
    setTimeout(() => qtyRef.current?.focus(), 0);
  };
  const handleQtyEnter = () => { setStage("rate"); setTimeout(() => rateRef.current?.focus(), 0); };
  const handleRateEnter = () => {
    setLines((prev) => [...prev, { id: Date.now(), productId: draft.productId, code: draft.code, name: draft.name, qty: parseFloat(draft.qty) || 0, rate: parseFloat(draft.rate) || 0 }]);
    setDraft({ code: "", name: "", qty: "", rate: "" });
    setStage("code");
    setTimeout(() => codeRef.current?.focus(), 0);
  };
  const removeLine = (id) => setLines((prev) => prev.filter((l) => l.id !== id));

  const handleConfirm = async () => {
    if (lines.length === 0 || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const bill = await confirmBill({
        businessId,
        memberId,
        customerId: customer?.id || null,
        lines: lines.map((l) => ({ productId: l.productId, qty: l.qty, rate: l.rate })),
        subtotal,
        discountTotal: discountAmount,
        paidCash: actualPaidCash,
        paidOnline: parseFloat(payments.online) || 0,
        paidBank: parseFloat(payments.bank) || 0,
        dueAmount,
        fullPaymentTick,
      });
      setConfirmedBill(bill);
      setScreen("confirmed");
    } catch (e) {
      setSubmitError(e.message || "Could not confirm bill. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Customer List (default screen) ----------
  if (screen === "customerList") {
    return (
      <Shell>
        <div className="font-display font-bold text-lg mb-1 px-1" style={{ color: TOKENS.ink }}>Billing</div>
        <div className="font-mono text-[11px] mb-5 px-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>Select a customer to start</div>
        <div className="flex items-center gap-2 mb-4 px-1">
          <div className="flex-1 flex items-center gap-2 border-2 rounded-2xl px-3 py-2.5" style={{ borderColor: TOKENS.line }}>
            <Search size={15} color={TOKENS.ink} style={{ opacity: 0.68 }} />
            <input
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              placeholder="Search customer…"
              className="flex-1 bg-transparent outline-none text-sm font-sans"
              style={{ color: TOKENS.inkDeep }}
            />
          </div>
          <button onClick={() => setScreen("addCustomer")} className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: TOKENS.ink }}>
            <Plus size={18} color={TOKENS.saffron} />
          </button>
        </div>
        <div className="space-y-2 px-1">
          {filteredCustomers.map((c) => (
            <button key={c.id} onClick={() => selectCustomer(c)} className="w-full text-left px-3.5 py-3 rounded-2xl flex items-center justify-between" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div>
                <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{c.name}</div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{c.code} · {c.mobile}</div>
              </div>
              {c.prevDue > 0 && <div className="font-mono text-xs" style={{ color: TOKENS.due }}>Due ₹{c.prevDue}</div>}
            </button>
          ))}
          {filteredCustomers.length === 0 && (
            <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>
              {customersLoading ? "Loading customers…" : "No customer found — tap + to add one"}
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- Add Customer ----------
  if (screen === "addCustomer") {
    const canSubmit = newCustomer.name && newCustomer.mobile;
    return (
      <Shell>
        <button onClick={() => setScreen("customerList")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}>
          <ArrowLeft size={13} /> back
        </button>
        <h2 className="font-display font-semibold text-xl mb-6 px-1" style={{ color: TOKENS.inkDeep }}>Add Customer</h2>
        <div className="px-1">
          <TextInput label="Customer Name" value={newCustomer.name} onChange={(e) => setNewCustomer((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" />
          <TextInput label="Mobile Number" value={newCustomer.mobile} onChange={(e) => setNewCustomer((p) => ({ ...p, mobile: e.target.value }))} placeholder="98xxxxxxxx" />
          <TextInput label="Shop Address (Optional)" value={newCustomer.address} onChange={(e) => setNewCustomer((p) => ({ ...p, address: e.target.value }))} placeholder="Area / locality" />
          <div className="mt-6">
            <button
              disabled={!canSubmit}
              onClick={submitNewCustomer}
              className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] tracking-wide disabled:opacity-40"
              style={{ background: TOKENS.ink, color: TOKENS.paper }}
            >
              Add &amp; Start Billing
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- Confirmed ----------
  if (screen === "confirmed") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
          <div className="stamp-pop w-28 h-28 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg] mb-6" style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}>
            <span className="font-display font-bold text-[13px] tracking-[0.12em]">CONFIRMED</span>
          </div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Bill {confirmedBill?.bill_number} confirmed</h2>
          <p className="font-mono text-xs mt-2" style={{ color: TOKENS.ink, opacity: 0.72 }}>
            Inventory, {customer?.name}'s ledger, and reports have been updated automatically.
          </p>
          {dueAmount === 0 && discountAmount === 0 && (
            <div className="mt-8 w-full max-w-[280px]">
              <button className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px]" style={{ background: TOKENS.stamp, color: TOKENS.paper }}>Send Bill on WhatsApp</button>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="mt-8 px-4 py-3 rounded-2xl border-2 font-mono text-sm" style={{ borderColor: TOKENS.saffronDeep, color: TOKENS.saffronDeep }}>
              ₹{discountAmount.toLocaleString("en-IN")} discount given to {customer?.name}
            </div>
          )}
          {dueAmount > 0 && (
            <div className="mt-8 px-4 py-3 rounded-2xl border-2 font-mono text-sm" style={{ borderColor: TOKENS.due, color: TOKENS.due }}>
              Due ₹{dueAmount.toLocaleString("en-IN")} added to {customer?.name}'s ledger
            </div>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- Bill Table ----------
  return (
    <Shell>
      <button onClick={() => setScreen("customerList")} className="font-mono text-xs mb-4 flex items-center gap-1 px-1 rounded-full border" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}>
        <ArrowLeft size={13} /> change customer
      </button>

      {/* Letterhead — always this business's own details, never a parent company's */}
      <div className="border-2 rounded-2xl px-4 py-4 mb-4" style={{ borderColor: TOKENS.ink }}>
        <div className="flex items-start justify-between">
          <div>
            <div className="font-display font-bold text-lg" style={{ color: TOKENS.inkDeep }}>{business?.name}</div>
            <div className="font-sans text-xs mt-1" style={{ color: TOKENS.ink, opacity: 0.75 }}>{business?.address}</div>
            {business?.gst_number && (
              <div className="font-mono text-[10px] mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>GST: {business.gst_number}</div>
            )}
          </div>
          <div className="text-right shrink-0 pl-3">
            <div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.saffronDeep }}>Bill No.</div>
            <div className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>auto on confirm</div>
            <div className="font-mono text-[10px] mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>{today}</div>
            <div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.58 }}>by {staffCode}</div>
          </div>
        </div>
        <Stitch className="my-3" />
        <div className="flex items-center justify-between font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.72 }}>
          <span>Owner: <span style={{ color: TOKENS.inkDeep }}>{business?.owner?.full_name}</span></span>
          <span>{business?.mobile_number}</span>
        </div>
      </div>

      {/* Customer block */}
      <div className="mb-5 px-1 flex items-center justify-between">
        <div>
          <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{customer?.name}</div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>
            {customer?.mobile}
            {customer?.prevDue > 0 && <span style={{ color: TOKENS.due }}> · Previous due ₹{customer.prevDue}</span>}
          </div>
        </div>
        <div className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>{today}</div>
      </div>

      {/* Table */}
      <div className="border-2 rounded-2xl overflow-hidden" style={{ borderColor: TOKENS.ink }}>
        <div className="grid font-mono text-[10px] uppercase tracking-wide py-2" style={{ gridTemplateColumns: "15% 14% 12% 5% 13% 31% 10%", background: TOKENS.ink, color: TOKENS.saffron }}>
          <div className="px-2">Code</div>
          <div className="px-1.5">Name</div>
          <div className="text-center">Qty</div>
          <div></div>
          <div className="text-center">Rate</div>
          <div className="px-1.5 text-right">Amount</div>
          <div></div>
        </div>

        {lines.map((l) => (
          <div key={l.id} className="grid items-center text-[12.5px] py-2 border-t" style={{ gridTemplateColumns: "15% 14% 12% 5% 13% 31% 10%", borderColor: TOKENS.line, background: "#FFFFFF" }}>
            <div className="px-2 font-mono truncate text-[13px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>{l.code}</div>
            <div className="px-1.5 font-sans truncate text-[10px]" style={{ color: TOKENS.inkDeep }}>{l.name}</div>
            <div className="text-center font-mono text-[15px] tabular-nums" style={{ color: TOKENS.inkDeep }}>{l.qty}</div>
            <div className="text-center font-mono" style={{ color: TOKENS.ink, opacity: 0.55 }}>×</div>
            <div className="text-center font-mono text-[15px] tabular-nums" style={{ color: TOKENS.inkDeep }}>{l.rate}</div>
            <div className="px-1.5 text-right font-mono text-[15px] tabular-nums truncate" style={{ color: TOKENS.inkDeep }}>{(l.qty * l.rate).toLocaleString("en-IN")}</div>
            <div className="flex justify-center">
              <button onClick={() => removeLine(l.id)}><Trash2 size={12} color={TOKENS.due} /></button>
            </div>
          </div>
        ))}

        <div className="grid items-center text-[12.5px] py-2 border-t-2" style={{ gridTemplateColumns: "15% 14% 12% 5% 13% 31% 10%", borderColor: TOKENS.saffron, background: TOKENS.paperDeep }}>
          <div className="px-2">
            <input ref={codeRef} autoFocus value={draft.code} onChange={(e) => { setCodeError(""); setDraft((d) => ({ ...d, code: e.target.value })); }}
              onKeyDown={(e) => e.key === "Enter" && stage === "code" && handleCodeEnter()} placeholder="P-101" className="bill-input font-mono text-[13px]" style={{ color: TOKENS.inkDeep }} />
          </div>
          <div className="px-1.5 font-sans truncate text-[10px]" style={{ color: TOKENS.ink, opacity: draft.name ? 1 : 0.35 }}>{draft.name || "auto-fills"}</div>
          <div className="text-center">
            <input ref={qtyRef} value={draft.qty} disabled={stage === "code"} onChange={(e) => setDraft((d) => ({ ...d, qty: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && stage === "qty" && handleQtyEnter()} className="bill-input font-mono text-center text-[15px]" style={{ color: TOKENS.inkDeep }} />
          </div>
          <div className="text-center font-mono" style={{ color: TOKENS.ink, opacity: 0.55 }}>×</div>
          <div className="text-center">
            <input ref={rateRef} value={draft.rate} disabled={stage !== "rate"} onChange={(e) => setDraft((d) => ({ ...d, rate: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && stage === "rate" && handleRateEnter()} className="bill-input font-mono text-center text-[15px]" style={{ color: TOKENS.inkDeep }} />
          </div>
          <div className="px-1.5 text-right font-mono text-[15px] tabular-nums truncate" style={{ color: TOKENS.ink, opacity: 0.68 }}>
            {draft.qty && draft.rate ? (parseFloat(draft.qty) * parseFloat(draft.rate)).toLocaleString("en-IN") : "—"}
          </div>
          <div></div>
        </div>

        <div className="grid items-center py-3 border-t-2" style={{ gridTemplateColumns: "50% 50%", borderColor: TOKENS.ink, background: TOKENS.ink }}>
          <div className="px-3 font-mono text-xs uppercase tracking-widest" style={{ color: TOKENS.saffron, opacity: 0.85 }}>Total</div>
          <div className="px-3 text-right font-display font-bold text-xl tabular-nums truncate" style={{ color: TOKENS.paper }}>₹{subtotal.toLocaleString("en-IN")}</div>
        </div>
      </div>
      <div className="font-mono text-[10px] mt-1.5 px-1" style={{ color: codeError ? TOKENS.due : TOKENS.ink, opacity: codeError ? 1 : 0.58 }}>
        {codeError || "Type a product code, press Enter — Code → Qty → Rate → new row"}
      </div>

      <div className="mt-6 mb-3 px-1 flex items-center justify-between">
        <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.72 }}>Payment</span>
        <button onClick={() => setFullPaymentTick((v) => !v)} className="flex items-center gap-1.5 font-mono text-[11px]" style={{ color: fullPaymentTick ? TOKENS.stamp : TOKENS.ink }}>
          <span className="w-4 h-4 rounded-2xl border-2 flex items-center justify-center" style={{ borderColor: fullPaymentTick ? TOKENS.stamp : TOKENS.line, background: fullPaymentTick ? TOKENS.stamp : "#FFFFFF" }}>
            {fullPaymentTick && <Check size={11} color={TOKENS.paper} />}
          </span>
          Full Payment (Cash)
        </button>
      </div>

      {!fullPaymentTick && (
        <div className="grid grid-cols-3 gap-2 mb-6 px-1">
          {["cash", "online", "bank"].map((key) => (
            <div key={key}>
              <div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>{key}</div>
              <input type="number" value={payments[key]} onChange={(e) => setPayments((p) => ({ ...p, [key]: e.target.value }))} placeholder="₹0"
                className="w-full border-2 rounded-2xl px-2 py-2 text-sm font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "transparent" }} />
            </div>
          ))}
        </div>
      )}

      {dueAmount > 0 && (
        <div className="mb-6 mx-1 px-4 py-3 rounded-2xl border-2 flex items-center justify-between" style={{ borderColor: TOKENS.due }}>
          <span className="font-mono text-xs" style={{ color: TOKENS.due }}>Will go to Due</span>
          <span className="font-display font-semibold text-sm" style={{ color: TOKENS.due }}>₹{dueAmount.toLocaleString("en-IN")}</span>
        </div>
      )}
      {discountAmount > 0 && (
        <div className="mb-6 mx-1 px-4 py-3 rounded-2xl border-2 flex items-center justify-between" style={{ borderColor: TOKENS.saffronDeep }}>
          <span className="font-mono text-xs" style={{ color: TOKENS.saffronDeep }}>Auto-applied as Discount</span>
          <span className="font-display font-semibold text-sm" style={{ color: TOKENS.saffronDeep }}>₹{discountAmount.toLocaleString("en-IN")}</span>
        </div>
      )}

      {submitError && (
        <div className="mb-3 mx-1 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>
          {submitError}
        </div>
      )}

      <div className="flex gap-2.5 px-1">
        <button disabled={lines.length === 0 || submitting} onClick={handleConfirm} className="flex-1 py-3.5 rounded-2xl font-display font-semibold text-[15px] tracking-wide disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
          {submitting ? "Saving…" : "Confirm"}
        </button>
        <button disabled={lines.length === 0 || submitting} onClick={handleConfirm} className="w-14 rounded-2xl border-2 flex items-center justify-center disabled:opacity-40" style={{ borderColor: TOKENS.ink }}>
          <Printer size={18} color={TOKENS.ink} />
        </button>
      </div>
    </Shell>
  );
}
