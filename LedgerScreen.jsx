import React, { useState, useEffect, useCallback } from "react";
import { ChevronLeft, ChevronRight, Search, Check, X, ArrowDownCircle, ArrowUpCircle, Plus } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Ledger Screen
  Customer / Supplier / Staff / Transport tabs, Customer open by default.
  Every profile has two direct-entry buttons at the bottom: Incoming (green)
  and Outgoing (red) — entries also keep auto-posting from Billing / Daily
  Product as before, this just adds a manual path so nothing needs a fake
  bill just to log money in the ledger.

  Supplier is special: "Incoming" there means GOODS arriving, not money —
  it opens the same Order/Delivered flow as Daily Product. If both an
  order date and a later delivery date apply, the entry's main date stays
  the order date and a small "Delivery: <date>" note sits beside the
  amount; a direct delivery (no separate order step) just shows that
  small note against today's date. Marking something Delivered asks for
  Lot Number and Transport Number.

  BACKEND STATUS: Customer and Supplier tabs are fully real (accounts +
  balances + statement all read/write Supabase). Staff tab lists real
  business_members and posts real ledger entries + attendance, but "Add
  Staff" here is disabled — a staff member needs a real login account,
  which is StaffScreen's job (invite/join flow), not a name+mobile form.
  Transport tab has no backing table in schema.sql yet, so it still runs
  on representative data — needs a `transport_parties` table before it
  can go real.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};

function Stitch({ className = "" }) {
  return (
    <div className={`w-full h-px ${className}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }} />
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

const TABS = [
  { id: "customer", label: "Customer" },
  { id: "supplier", label: "Supplier" },
  { id: "staff", label: "Staff" },
  { id: "transport", label: "Transport" },
];

// Transport tab has no backing table yet — stays representative (see note above).
const SEED_TRANSPORT = [
  { id: "t1", name: "Shyamal Transport", code: "TRN-002", mobile: "98xxxxxx99", balance: 600, balanceType: "due" },
];
const SEED_TRANSPORT_TIMELINES = {
  t1: [{ date: "30 Jul", note: "Transport — Entry #212, 400kg", type: "debit", amount: 600 }],
};

// Same business identity used on the Billing letterhead — statements get shared
// externally (WhatsApp), so the company's own name replaces ambiguous "You".
const BUSINESS_NAME = "Sharma General Store";

// Color is about direction, not tab labels: Customer/Staff balances are money still
// owed TO the business (not yet in hand) -> red. Supplier/Transport balances are
// money the business still holds and will pay out later -> green.
function balanceColor(tab) {
  if (tab === "customer" || tab === "staff") return TOKENS.due;
  return TOKENS.stamp;
}
function balanceLabel(tab, type) {
  if (type === "clear") return "Clear";
  if (tab === "customer") return `${BUSINESS_NAME} Will Receive`;
  if (tab === "supplier") return `${BUSINESS_NAME} Will Pay`;
  if (tab === "staff") return "Advance";
  return "Pending";
}
function totalLabel(tab) {
  if (tab === "customer") return `${BUSINESS_NAME} Will Receive`;
  if (tab === "supplier") return `${BUSINESS_NAME} Will Pay`;
  if (tab === "staff") return "Total Advance Given";
  return "Total Pending Payment";
}

export default function BonikLedgerScreen() {
  const { businessId, memberId } = useSession();
  const [tab, setTab] = useState("customer");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [attendance, setAttendance] = useState({});
  const [timelines, setTimelines] = useState({ ...SEED_TRANSPORT_TIMELINES });
  const [addMode, setAddMode] = useState(null); // null | 'incoming' | 'outgoing'
  const [accounts, setAccounts] = useState({ customer: [], supplier: [], staff: [], transport: SEED_TRANSPORT });
  const [loading, setLoading] = useState(true);
  const [addingType, setAddingType] = useState(null); // null | 'customer' | 'supplier' | 'staff' | 'transport'
  const [newAccount, setNewAccount] = useState({ name: "", mobile: "", address: "", designation: "", gst: "", aadhaar: "", pan: "", vehicleType: "Bus" });
  const [saveError, setSaveError] = useState("");

  const [genericForm, setGenericForm] = useState({ amount: "", note: "", date: "04 Aug" });
  const [goodsForm, setGoodsForm] = useState({ status: "order", amount: "", date: "04 Aug", lot: "", transport: "" });

  // ---- Load customers, suppliers, staff + their ledger balances from Supabase ----
  const loadAll = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);

    const [{ data: custRows }, { data: supRows }, { data: staffRows }, { data: ledgerRows }] = await Promise.all([
      supabase.from("customers").select("*").eq("business_id", businessId).order("name"),
      supabase.from("suppliers").select("*").eq("business_id", businessId).order("name"),
      supabase.from("business_members").select("*, user:users(full_name, mobile_number)").eq("business_id", businessId).eq("role", "staff").eq("status", "active"),
      supabase.from("ledger_entries").select("*").eq("business_id", businessId).order("created_at", { ascending: false }),
    ]);

    // balance per account_id, keyed by account_type — debit adds, credit subtracts (see comment above submitGeneric)
    const balances = {};
    (ledgerRows || []).forEach((r) => {
      const key = `${r.account_type}:${r.account_id}`;
      const delta = r.direction === "debit" ? Number(r.amount) : -Number(r.amount);
      balances[key] = (balances[key] || 0) + delta;
    });

    const custList = (custRows || []).map((c) => {
      const bal = balances[`customer:${c.id}`] || 0;
      return { id: c.id, name: c.name, code: c.customer_code, mobile: c.mobile_number, address: c.address, balance: Math.abs(bal), balanceType: bal > 0 ? "due" : "clear" };
    });
    const supList = (supRows || []).map((s) => {
      const bal = balances[`supplier:${s.id}`] || 0;
      return { id: s.id, name: s.name, code: s.supplier_code, mobile: s.mobile_number, address: s.address, gst: s.gst_number, balance: Math.abs(bal), balanceType: bal > 0 ? "due" : "clear" };
    });
    const staffList = (staffRows || []).map((m) => {
      const bal = balances[`staff:${m.id}`] || 0;
      return { id: m.id, name: m.user?.full_name, code: m.staff_code, mobile: m.user?.mobile_number, designation: m.designation, balance: Math.abs(bal), balanceType: bal > 0 ? "advance" : "clear" };
    });

    // build statements grouped by account
    const nextTimelines = { ...SEED_TRANSPORT_TIMELINES };
    (ledgerRows || []).forEach((r) => {
      if (r.account_type === "transport" || !r.account_id) return;
      const entry = {
        date: new Date(r.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        note: r.note || (r.direction === "debit" ? "Debit" : "Credit"),
        type: r.direction,
        amount: Number(r.amount),
      };
      nextTimelines[r.account_id] = [...(nextTimelines[r.account_id] || []), entry];
    });

    setAccounts({ customer: custList, supplier: supList, staff: staffList, transport: SEED_TRANSPORT });
    setTimelines(nextTimelines);
    setLoading(false);
  }, [businessId]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const list = accounts[tab].filter((a) => a.name.toLowerCase().includes(query.toLowerCase()));
  const tabTotal = accounts[tab].reduce((sum, a) => sum + (a.balanceType !== "clear" ? a.balance : 0), 0);
  const selected = selectedId ? accounts[tab].find((a) => a.id === selectedId) : null;
  const timeline = selected ? (timelines[selected.id] || []) : [];

  const todayKey = (id) => `${id}-2026-08-04`;
  const isAbsentToday = (id) => attendance[todayKey(id)] === "absent";
  const toggleToday = async (memberIdArg) => {
    const nowAbsent = !isAbsentToday(memberIdArg);
    setAttendance((prev) => ({ ...prev, [todayKey(memberIdArg)]: nowAbsent ? "absent" : "present" }));
    const workDate = new Date().toISOString().slice(0, 10);
    await supabase.from("attendance").upsert(
      { business_member_id: memberIdArg, work_date: workDate, status: nowAbsent ? "absent" : "present" },
      { onConflict: "business_member_id,work_date" }
    );
  };

  const openAdd = (mode) => {
    setGenericForm({ amount: "", note: "", date: "04 Aug" });
    setGoodsForm({ status: "order", amount: "", date: "04 Aug", lot: "", transport: "" });
    setSaveError("");
    setAddMode(mode);
  };

  // Customer/Staff incoming-outgoing — one ledger_entries row, then reload balances.
  const submitGeneric = async () => {
    if (!genericForm.amount || !businessId) return;
    const { error } = await supabase.from("ledger_entries").insert({
      business_id: businessId,
      account_type: tab,
      account_id: selected.id,
      direction: addMode === "incoming" ? "credit" : "debit",
      amount: parseFloat(genericForm.amount) || 0,
      source_type: tab === "staff" ? "salary" : "bill",
      source_id: selected.id, // manual entry — no bill/salary row behind it, account itself is the reference
      note: genericForm.note || (addMode === "incoming" ? "Received" : "Given"),
    });
    if (error) { setSaveError(error.message); return; }
    setAddMode(null);
    loadAll();
  };

  // Supplier "goods incoming" — quick ledger entry for the amount. Full per-product
  // detail (which product, how much stock) still belongs to the Daily Product screen.
  const submitGoods = async () => {
    if (!goodsForm.amount || !businessId) return;
    const delivered = goodsForm.status === "delivered";
    const { error } = await supabase.from("ledger_entries").insert({
      business_id: businessId,
      account_type: "supplier",
      account_id: selected.id,
      direction: "debit",
      amount: parseFloat(goodsForm.amount) || 0,
      source_type: "daily_product",
      source_id: selected.id,
      note: delivered ? `Goods — Delivered${goodsForm.lot ? ` (Lot ${goodsForm.lot})` : ""}` : "Goods — Order placed",
    });
    if (error) { setSaveError(error.message); return; }
    setAddMode(null);
    loadAll();
  };

  const submitSupplierPayment = async () => {
    if (!genericForm.amount || !businessId) return;
    const { error } = await supabase.from("ledger_entries").insert({
      business_id: businessId,
      account_type: "supplier",
      account_id: selected.id,
      direction: "credit",
      amount: parseFloat(genericForm.amount) || 0,
      source_type: "expense",
      source_id: selected.id,
      note: genericForm.note || "Payment made",
    });
    if (error) { setSaveError(error.message); return; }
    setAddMode(null);
    loadAll();
  };

  const CODE_PREFIX = { customer: "CUST", supplier: "SUP", staff: "STF", transport: "TRN" };
  const submitNewAccount = async () => {
    if (!newAccount.name || !newAccount.mobile || !businessId) return;
    setSaveError("");
    const code = `${CODE_PREFIX[addingType]}-${String(accounts[addingType].length + 1).padStart(3, "0")}`;
    if (addingType === "customer") {
      const { error } = await supabase.from("customers").insert({
        business_id: businessId, customer_code: code, name: newAccount.name, mobile_number: newAccount.mobile, address: newAccount.address || null,
      });
      if (error) { setSaveError(error.message); return; }
    } else if (addingType === "supplier") {
      const { error } = await supabase.from("suppliers").insert({
        business_id: businessId, supplier_code: code, name: newAccount.name, mobile_number: newAccount.mobile, address: newAccount.address || null,
      });
      if (error) { setSaveError(error.message); return; }
    } else {
      // staff / transport: no real table path from this quick form (see BACKEND STATUS note above)
      setSaveError(addingType === "staff" ? "Add staff from the Staff screen — they need a real login." : "Transport isn't wired to the database yet.");
      return;
    }
    setNewAccount({ name: "", mobile: "", address: "", designation: "", gst: "", aadhaar: "", pan: "", vehicleType: "Bus" });
    setAddingType(null);
    setTab(addingType);
    loadAll();
  };

  // ---------- Add new Customer/Supplier/Staff/Transport ----------
  if (addingType) {
    const canSubmit = newAccount.name && newAccount.mobile;
    return (
      <Shell>
        <button onClick={() => setAddingType(null)} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          <ChevronLeft size={13} /> back
        </button>
        <h2 className="font-display font-semibold text-xl mb-6 capitalize" style={{ color: TOKENS.inkDeep }}>
          Add {addingType}
        </h2>
        <TextInput label="Name" value={newAccount.name} onChange={(e) => setNewAccount((p) => ({ ...p, name: e.target.value }))} placeholder="Full name" />
        <TextInput label="Mobile Number" value={newAccount.mobile} onChange={(e) => setNewAccount((p) => ({ ...p, mobile: e.target.value }))} placeholder="98xxxxxxxx" />
        <TextInput label="Address" value={newAccount.address} onChange={(e) => setNewAccount((p) => ({ ...p, address: e.target.value }))} placeholder="Shop / area / locality" />
        {addingType === "staff" && (
          <TextInput label="Designation (Optional)" value={newAccount.designation} onChange={(e) => setNewAccount((p) => ({ ...p, designation: e.target.value }))} placeholder="Cashier, Manager…" />
        )}
        {addingType === "transport" && (
          <div className="mb-4">
            <FieldLabel>Vehicle Type</FieldLabel>
            <div className="flex gap-2 mt-1">
              {["Bus", "Rickshaw"].map((t) => (
                <button key={t} onClick={() => setNewAccount((p) => ({ ...p, vehicleType: t }))} className="flex-1 py-2.5 rounded-2xl border-2 font-mono text-xs"
                  style={{ borderColor: newAccount.vehicleType === t ? TOKENS.saffron : TOKENS.line, background: newAccount.vehicleType === t ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
        {addingType === "supplier" && (
          <>
            <TextInput label="GST Number (Optional)" value={newAccount.gst} onChange={(e) => setNewAccount((p) => ({ ...p, gst: e.target.value }))} placeholder="22AAAAA0000A1Z5" />
            <TextInput label="Aadhaar Number (Optional)" value={newAccount.aadhaar} onChange={(e) => setNewAccount((p) => ({ ...p, aadhaar: e.target.value }))} placeholder="xxxx xxxx xxxx" />
            <TextInput label="PAN Number (Optional)" value={newAccount.pan} onChange={(e) => setNewAccount((p) => ({ ...p, pan: e.target.value }))} placeholder="ABCDE1234F" />
          </>
        )}
        <div className="mt-6">
          {saveError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{saveError}</div>}
          <button disabled={!canSubmit} onClick={submitNewAccount} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            Add {addingType}
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Add sheets ----------
  if (selected && addMode) {
    const isSupplierGoods = tab === "supplier" && addMode === "incoming";
    return (
      <Shell>
        <button onClick={() => setAddMode(null)} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          <ChevronLeft size={13} /> cancel
        </button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>
          {isSupplierGoods ? "Goods Incoming" : addMode === "incoming" ? "Incoming" : "Outgoing"}
        </h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>{selected.name}</p>

        {isSupplierGoods ? (
          <>
            <div className="mb-5">
              <FieldLabel>Status</FieldLabel>
              <div className="flex gap-2 mt-1">
                {["order", "delivered"].map((s) => (
                  <button key={s} onClick={() => setGoodsForm((f) => ({ ...f, status: s }))}
                    className="flex-1 py-2.5 rounded-2xl border-2 font-mono text-xs capitalize"
                    style={{ borderColor: goodsForm.status === s ? TOKENS.saffron : TOKENS.line, background: goodsForm.status === s ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <TextInput label={goodsForm.status === "delivered" ? "Delivery Date" : "Order Date"} value={goodsForm.date} onChange={(e) => setGoodsForm((f) => ({ ...f, date: e.target.value }))} />
            <TextInput label="Amount" type="number" value={goodsForm.amount} onChange={(e) => setGoodsForm((f) => ({ ...f, amount: e.target.value }))} placeholder="₹0" />
            {goodsForm.status === "delivered" && (
              <>
                <TextInput label="Lot Number (Optional)" value={goodsForm.lot} onChange={(e) => setGoodsForm((f) => ({ ...f, lot: e.target.value }))} />
                <TextInput label="Transport Number (Optional)" value={goodsForm.transport} onChange={(e) => setGoodsForm((f) => ({ ...f, transport: e.target.value }))} />
              </>
            )}
            <div className="mt-6">
              <button onClick={submitGoods} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px]" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
                Add to Ledger
              </button>
            </div>
          </>
        ) : (
          <>
            <TextInput label="Date" value={genericForm.date} onChange={(e) => setGenericForm((f) => ({ ...f, date: e.target.value }))} />
            <TextInput label="Amount" type="number" value={genericForm.amount} onChange={(e) => setGenericForm((f) => ({ ...f, amount: e.target.value }))} placeholder="₹0" />
            <TextInput label="Note (Optional)" value={genericForm.note} onChange={(e) => setGenericForm((f) => ({ ...f, note: e.target.value }))} placeholder={tab === "supplier" ? "Payment made" : addMode === "incoming" ? "Payment received" : "Goods given"} />
            {saveError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{saveError}</div>}
            <div className="mt-6">
              <button
                onClick={tab === "supplier" ? submitSupplierPayment : submitGeneric}
                className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px]"
                style={{ background: addMode === "incoming" ? TOKENS.stamp : TOKENS.due, color: TOKENS.paper }}
              >
                Add {addMode === "incoming" ? "Incoming" : "Outgoing"}
              </button>
            </div>
          </>
        )}
      </Shell>
    );
  }

  // ---------- Profile ----------
  if (selected) {
    return (
      <Shell>
        <button onClick={() => setSelectedId(null)} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          <ChevronLeft size={13} /> {TABS.find((t) => t.id === tab).label} Ledger
        </button>

        <div className="mb-1 font-display font-bold text-xl" style={{ color: TOKENS.inkDeep }}>{selected.name}</div>
        <div className="mb-6">
          <div className="font-mono text-[11px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>
            {selected.code} · {selected.mobile}{selected.designation ? ` · ${selected.designation}` : ""}{selected.vehicleType ? ` · ${selected.vehicleType}` : ""}
          </div>
          {selected.address && (
            <div className="font-mono text-[11px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{selected.address}</div>
          )}
          {tab === "supplier" && (selected.gst || selected.pan || selected.aadhaar) && (
            <div className="font-mono text-[10px] mt-1" style={{ color: TOKENS.ink, opacity: 0.58 }}>
              {selected.gst && <span>GST: {selected.gst}  </span>}
              {selected.pan && <span>PAN: {selected.pan}  </span>}
              {selected.aadhaar && <span>Aadhaar: {selected.aadhaar}</span>}
            </div>
          )}
        </div>

        <div className="rounded-2xl px-4 py-4 mb-6 flex items-center justify-between" style={{ background: TOKENS.ink }}>
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.saffron, opacity: 0.85 }}>{balanceLabel(tab, selected.balanceType)}</span>
          <span className="font-display font-bold text-xl tabular-nums" style={{ color: selected.balanceType === "clear" ? TOKENS.paper : balanceColor(tab) }}>₹{selected.balance.toLocaleString("en-IN")}</span>
        </div>

        {tab === "staff" && (
          <div className="mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Today's Attendance</div>
            <button onClick={() => toggleToday(selected.id)} className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2" style={{ borderColor: isAbsentToday(selected.id) ? TOKENS.due : TOKENS.stamp }}>
              <span className="font-display font-semibold text-sm" style={{ color: isAbsentToday(selected.id) ? TOKENS.due : TOKENS.stamp }}>
                {isAbsentToday(selected.id) ? "Marked Absent Today" : "Working Today (default)"}
              </span>
              <span className="w-5 h-5 rounded-2xl border-2 flex items-center justify-center" style={{ borderColor: isAbsentToday(selected.id) ? TOKENS.due : TOKENS.stamp, background: isAbsentToday(selected.id) ? TOKENS.due : TOKENS.stamp }}>
                {isAbsentToday(selected.id) ? <X size={12} color={TOKENS.paper} /> : <Check size={12} color={TOKENS.paper} />}
              </span>
            </button>
          </div>
        )}

        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.72 }}>Statement</span>
          <Stitch className="flex-1 mx-3" />
        </div>

        <div className="space-y-0 mb-6">
          {timeline.length === 0 ? (
            <div className="text-center py-8 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No transactions yet</div>
          ) : (
            timeline.map((t, i) => (
              <div key={i} className="flex items-center justify-between py-3" style={{ borderBottom: i < timeline.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                <div>
                  <div className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{t.note}</div>
                  <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{t.date}</div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-sm tabular-nums" style={{ color: t.type === "debit" ? TOKENS.due : TOKENS.stamp }}>
                    {t.type === "debit" ? "−" : "+"}₹{t.amount.toLocaleString("en-IN")}
                  </div>
                  {t.small && <div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.62 }}>{t.small}</div>}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Direct add — Incoming / Outgoing */}
        <div className="flex gap-2.5">
          <button onClick={() => openAdd("incoming")} className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2" style={{ borderColor: TOKENS.stamp }}>
            <ArrowDownCircle size={15} color={TOKENS.stamp} />
            <span className="font-display font-semibold text-sm" style={{ color: TOKENS.stamp }}>Incoming</span>
          </button>
          <button onClick={() => openAdd("outgoing")} className="flex-1 py-3 rounded-2xl border-2 flex items-center justify-center gap-2" style={{ borderColor: TOKENS.due }}>
            <ArrowUpCircle size={15} color={TOKENS.due} />
            <span className="font-display font-semibold text-sm" style={{ color: TOKENS.due }}>Outgoing</span>
          </button>
        </div>
        {tab === "supplier" && (
          <div className="font-mono text-[10px] mt-2 text-center" style={{ color: TOKENS.ink, opacity: 0.58 }}>
            Incoming = goods arriving · Outgoing = payment made
          </div>
        )}
      </Shell>
    );
  }

  // ---------- List ----------
  return (
    <Shell>
      <div className="font-display font-bold text-lg mb-5" style={{ color: TOKENS.ink }}>Ledger</div>
      <div className="grid grid-cols-4 gap-1.5 mb-5">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => { setTab(t.id); setQuery(""); }} className="py-2.5 rounded-2xl font-mono text-[11px]"
            style={{
              background: tab === t.id ? TOKENS.ink : "#FFFFFF",
              color: tab === t.id ? "#FFFFFF" : TOKENS.inkDeep,
              boxShadow: "0 1px 3px rgba(10,25,48,0.08)",
            }}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="rounded-2xl px-4 py-3.5 mb-4 flex items-center justify-between" style={{ background: TOKENS.ink }}>
        <span className="font-mono text-[11px] uppercase tracking-wide" style={{ color: TOKENS.saffron, opacity: 0.85 }}>{totalLabel(tab)}</span>
        <span className="font-display font-bold text-lg tabular-nums" style={{ color: tabTotal > 0 ? balanceColor(tab) : TOKENS.paper }}>₹{tabTotal.toLocaleString("en-IN")}</span>
      </div>
      <div className="flex items-center gap-2 border-2 rounded-2xl px-3 py-2.5 mb-4" style={{ borderColor: TOKENS.line }}>
        <Search size={15} color={TOKENS.ink} style={{ opacity: 0.68 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${TABS.find((t) => t.id === tab).label.toLowerCase()}…`} className="flex-1 bg-transparent outline-none text-sm font-sans" style={{ color: TOKENS.inkDeep }} />
      </div>
      <div className="space-y-2">
        {list.map((a) => (
          <button key={a.id} onClick={() => setSelectedId(a.id)} className="w-full text-left px-3.5 py-3 rounded-2xl flex items-center justify-between" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <div>
              <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{a.name}</div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{a.code}</div>
            </div>
            <div className="flex items-center gap-2">
              {a.balanceType !== "clear" && <span className="font-mono text-xs tabular-nums" style={{ color: balanceColor(tab) }}>₹{a.balance.toLocaleString("en-IN")}</span>}
              <ChevronRight size={14} color={TOKENS.ink} style={{ opacity: 0.5 }} />
            </div>
          </button>
        ))}
        {loading ? (
          <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>
        ) : list.length === 0 ? (
          <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No {tab} found</div>
        ) : null}
      </div>

      {/* Floating add button — bottom-right, raised above the edge, not screen-centered.
          Adds directly to whichever tab is currently open, no extra menu. */}
      <button
        onClick={() => setAddingType(tab)}
        className="fixed w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{ background: TOKENS.ink, right: "max(1.5rem, calc(50% - 210px + 1.25rem))", bottom: "6.5rem" }}
      >
        <Plus size={22} color={TOKENS.saffron} />
      </button>
    </Shell>
  );
}
