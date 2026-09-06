import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Wallet } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Daily Expense Screen
  Part 5.1/5.2: category-driven entry, auto Fixed/Variable classification
  (the user never picks this), category-specific fields, and a small
  dashboard summarizing today/week/month spend by classification.

  BACKEND STATUS: fully wired to real Supabase (expense_entries). Staff
  Salary and Supplier Payment also post a matching ledger_entries credit
  (same account_type/id convention as Ledger's Supplier "Outgoing"), so
  paying a salary or a supplier bill here shows up on their ledger too.
  Bus/Rickshaw Fare intentionally have no ledger entry — the module spec
  says these are logged against the supplier's delivery only, no ledger
  of their own. Transport Payment has no ledger tab yet (see Ledger's
  note on the Transport tab), so its code is just stored as free text.
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
      <input {...props} className="w-full border-0 border-b-2 rounded-t-lg px-2.5 pt-2 pb-2 text-[15px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }} />
    </div>
  );
}
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>{children}</div>;
}
function Stitch({ className = "" }) {
  return <div className={`w-full h-px ${className}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }} />;
}
const money = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

const CATEGORIES = [
  { id: "bus_fare", label: "Bus Fare", classification: "variable" },
  { id: "rickshaw_fare", label: "Rickshaw Fare", classification: "variable" },
  { id: "supplier_payment", label: "Supplier Payment", classification: "variable" },
  { id: "tiffin", label: "Tiffin Expense", classification: "fixed" },
  { id: "transport_payment", label: "Transport Payment", classification: "variable" },
  { id: "staff_salary", label: "Staff Salary", classification: "fixed" },
  { id: "shop_expense", label: "Shop Expense", classification: "fixed" },
];

// Nothing left here to seed — entries load from Supabase.

export default function BonikDailyExpenseScreen() {
  const { businessId, memberId } = useSession();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [screen, setScreen] = useState("list"); // list | entry
  const [form, setForm] = useState({ category: null, amount: "", code: "", description: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const loadEntries = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_entries")
      .select("*, supplier:suppliers(supplier_code), staff:business_members(staff_code)")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (!error) {
      setEntries((data || []).map((e) => ({
        id: e.id, entryNo: e.entry_number, category: e.category, classification: e.classification,
        amount: Number(e.amount), description: e.description,
        code: e.supplier?.supplier_code || e.staff?.staff_code || e.transport_code || "",
        date: new Date(e.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        createdAt: e.created_at,
      })));
    }
    setLoading(false);
  }, [businessId]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const cat = CATEGORIES.find((c) => c.id === form.category);
  const todayStr = new Date().toDateString();
  const todayEntries = entries.filter((e) => new Date(e.createdAt).toDateString() === todayStr);
  const todayTotal = todayEntries.reduce((s, e) => s + e.amount, 0);
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const weekTotal = entries.filter((e) => new Date(e.createdAt).getTime() >= weekAgo).reduce((s, e) => s + e.amount, 0);
  const fixedTotal = entries.filter((e) => e.classification === "fixed").reduce((s, e) => s + e.amount, 0);
  const variableTotal = entries.filter((e) => e.classification === "variable").reduce((s, e) => s + e.amount, 0);

  const needsCode = ["supplier_payment", "transport_payment", "staff_salary", "bus_fare", "rickshaw_fare"].includes(form.category);
  const needsDescription = form.category === "shop_expense";
  const canSubmit = form.category && form.amount && (!needsCode || form.code) && (!needsDescription || form.description);

  const submit = async () => {
    if (!canSubmit || !businessId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const amount = parseFloat(form.amount) || 0;
      let supplierId = null, staffMemberId = null, transportCode = null;

      if (["supplier_payment", "bus_fare", "rickshaw_fare"].includes(form.category)) {
        const { data: sup } = await supabase.from("suppliers").select("id").eq("business_id", businessId).eq("supplier_code", form.code.toUpperCase()).maybeSingle();
        if (!sup) throw new Error("Supplier code not found");
        supplierId = sup.id;
      } else if (form.category === "staff_salary") {
        const { data: staff } = await supabase.from("business_members").select("id").eq("business_id", businessId).eq("staff_code", form.code.toUpperCase()).maybeSingle();
        if (!staff) throw new Error("Staff code not found");
        staffMemberId = staff.id;
      } else if (form.category === "transport_payment") {
        transportCode = form.code.toUpperCase();
      }

      const { count } = await supabase.from("expense_entries").select("id", { count: "exact", head: true }).eq("business_id", businessId);
      const entryNumber = `EXP-${String((count || 0) + 1).padStart(6, "0")}`;

      const { error: expErr } = await supabase.from("expense_entries").insert({
        business_id: businessId, entry_number: entryNumber, category: form.category, classification: cat.classification,
        amount, supplier_id: supplierId, transport_code: transportCode, staff_member_id: staffMemberId,
        description: form.description || null, created_by: memberId,
      });
      if (expErr) throw expErr;

      // Salary paid / supplier bill paid also shows up on their ledger — see BACKEND STATUS note above.
      if (form.category === "staff_salary") {
        await supabase.from("ledger_entries").insert({ business_id: businessId, account_type: "staff", account_id: staffMemberId, direction: "credit", amount, source_type: "salary", source_id: staffMemberId, note: `Salary — ${entryNumber}` });
      } else if (form.category === "supplier_payment") {
        await supabase.from("ledger_entries").insert({ business_id: businessId, account_type: "supplier", account_id: supplierId, direction: "credit", amount, source_type: "expense", source_id: supplierId, note: `Payment — ${entryNumber}` });
      }

      setForm({ category: null, amount: "", code: "", description: "" });
      setScreen("list");
      loadEntries();
    } catch (e) {
      setSubmitError(e.message || "Could not save expense.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- New Entry ----------
  if (screen === "entry") {
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Daily Expense Entry</h2>

        <div className="mb-5">
          <FieldLabel>Category</FieldLabel>
          <div className="flex flex-wrap gap-2 mt-1">
            {CATEGORIES.map((c) => (
              <button key={c.id} onClick={() => setForm((f) => ({ ...f, category: c.id, code: "", description: "" }))}
                className="px-3 py-2 rounded-2xl border-2 font-mono text-[11px]"
                style={{ borderColor: form.category === c.id ? TOKENS.saffron : TOKENS.line, background: form.category === c.id ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>
                {c.label}
              </button>
            ))}
          </div>
          {cat && (
            <div className="font-mono text-[9.5px] mt-2" style={{ color: cat.classification === "fixed" ? TOKENS.saffronDeep : TOKENS.blue }}>
              auto-classified as {cat.classification === "fixed" ? "Fixed Expense" : "Variable Expense"} — you don't need to choose this
            </div>
          )}
        </div>

        <TextInput label="Amount" type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="₹0" />

        {needsCode && (
          <TextInput
            label={
              form.category === "transport_payment" ? "Transport / Driver Code"
              : form.category === "staff_salary" ? "Staff Code"
              : "Supplier Code"  // supplier_payment, bus_fare, rickshaw_fare — tied to that supplier's delivery
            }
            value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
            placeholder={form.category === "transport_payment" ? "TRN-002" : form.category === "staff_salary" ? "STF-004" : "SUP-006"}
          />
        )}
        {needsDescription && (
          <TextInput label="Description" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Electricity, furniture, internet…" />
        )}

        <div className="mt-6">
          {submitError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{submitError}</div>}
          <button disabled={!canSubmit || submitting} onClick={submit} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            {submitting ? "Saving…" : "Save Expense"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- List / Dashboard ----------
  return (
    <Shell>
      <div className="font-display font-bold text-lg mb-5" style={{ color: TOKENS.ink }}>Daily Expense</div>

      <div className="grid grid-cols-2 gap-2.5 mb-3">
        <Card className="px-4 py-3.5"><div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.ink, opacity: 0.72 }}>Today</div><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(todayTotal)}</div></Card>
        <Card className="px-4 py-3.5"><div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.ink, opacity: 0.72 }}>This Week</div><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(weekTotal)}</div></Card>
      </div>
      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <Card className="px-4 py-3.5"><div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.saffronDeep }}>Fixed</div><div className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.saffronDeep }}>{money(fixedTotal)}</div></Card>
        <Card className="px-4 py-3.5"><div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.blue }}>Variable</div><div className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.blue }}>{money(variableTotal)}</div></Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.72 }}>Recent Entries</span>
        <Stitch className="flex-1 mx-3" />
      </div>
      <div className="space-y-2 mb-24">
        {loading && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
        {entries.map((e) => {
          const c = CATEGORIES.find((x) => x.id === e.category);
          return (
            <div key={e.id} className="px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{c?.label}{e.description ? ` — ${e.description}` : ""}</span>
                <span className="font-mono text-sm tabular-nums" style={{ color: TOKENS.due }}>−{money(e.amount)}</span>
              </div>
              <div className="font-mono text-[9.5px] flex flex-wrap items-center gap-x-2" style={{ color: TOKENS.ink, opacity: 0.68 }}>
                <span>{e.entryNo}</span>
                <span style={{ color: e.classification === "fixed" ? TOKENS.saffronDeep : TOKENS.blue, opacity: 1 }}>· {e.classification === "fixed" ? "Fixed" : "Variable"}</span>
                {e.code && <span>· {e.code}</span>}
              </div>
              <div className="font-mono text-[9.5px] mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>{e.date}</div>
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
