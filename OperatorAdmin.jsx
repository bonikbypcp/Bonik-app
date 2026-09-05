import React, { useState } from "react";
import { Crown, Users, IndianRupee, TrendingUp, ChevronRight, ChevronLeft } from "lucide-react";

/*
  BONIK by PCP — Operator Admin Panel
  This is NOT a business-owner or Super-Admin-of-a-parent-company screen —
  it's the control panel for whoever operates BONIK itself (you, as the
  platform's builder), completely separate from what shop owners or their
  customers ever see. Only this surface can change what subscriptions cost
  and turn premium features on/off platform-wide.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};
const money = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-5 pt-8 pb-16">{children}</div>
    </div>
  );
}
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>{children}</div>;
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className="w-9 h-5 rounded-full flex items-center px-0.5 shrink-0" style={{ background: on ? TOKENS.stamp : TOKENS.line, justifyContent: on ? "flex-end" : "flex-start" }}>
      <span className="w-4 h-4 rounded-full bg-white" />
    </button>
  );
}

const SEED_PLANS = [
  { id: "barcode", label: "Barcode System", price: 99, active: true, subscribers: 340 },
  { id: "analytics", label: "Advanced Analytics", price: 149, active: true, subscribers: 210 },
  { id: "ai", label: "AI Features", price: 199, active: false, subscribers: 0 },
  { id: "marketplace", label: "Marketplace", price: 249, active: false, subscribers: 0 },
];

export default function BonikOperatorAdmin() {
  const [screen, setScreen] = useState("main"); // main | plan
  const [plans, setPlans] = useState(SEED_PLANS);
  const [editingPlan, setEditingPlan] = useState(null);
  const [priceDraft, setPriceDraft] = useState("");

  const totalBusinesses = 1240;
  const totalRevenue = plans.reduce((s, p) => s + (p.active ? p.price * p.subscribers : 0), 0);

  const openPlan = (p) => { setEditingPlan(p); setPriceDraft(String(p.price)); setScreen("plan"); };
  const savePrice = () => {
    setPlans((prev) => prev.map((p) => p.id === editingPlan.id ? { ...p, price: parseFloat(priceDraft) || p.price } : p));
    setScreen("main");
  };
  const togglePlanActive = (id) => setPlans((prev) => prev.map((p) => p.id === id ? { ...p, active: !p.active } : p));

  // ---------- Plan editor ----------
  if (screen === "plan" && editingPlan) {
    return (
      <Shell>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ChevronLeft size={13} /> admin</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>{editingPlan.label}</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>{editingPlan.subscribers} businesses subscribed</p>

        <div className="mb-6">
          <label className="block text-[11px] font-mono uppercase tracking-[0.14em] mb-1.5" style={{ color: TOKENS.ink, opacity: 0.75 }}>Monthly Price</label>
          <div className="flex items-center gap-2">
            <span className="font-display font-bold text-2xl" style={{ color: TOKENS.inkDeep }}>₹</span>
            <input value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)} type="number"
              className="flex-1 bg-transparent border-0 border-b-2 pb-2 text-2xl font-display font-bold outline-none" style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }} />
          </div>
          <div className="font-mono text-[10px] mt-2" style={{ color: TOKENS.ink, opacity: 0.62 }}>
            Currently ₹{editingPlan.price}/mo · changing this affects new subscriptions going forward
          </div>
        </div>

        <div className="mb-6 flex items-center justify-between px-3.5 py-3 rounded-2xl" style={{ background: TOKENS.paperDeep }}>
          <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>Feature Active Platform-Wide</span>
          <Toggle on={editingPlan.active} onClick={() => { togglePlanActive(editingPlan.id); setEditingPlan((p) => ({ ...p, active: !p.active })); }} />
        </div>

        <button onClick={savePrice} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px]" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
          Save Price
        </button>
      </Shell>
    );
  }

  // ---------- Main ----------
  return (
    <Shell>
      <div className="flex items-center gap-2 mb-1">
        <Crown size={16} color={TOKENS.saffronDeep} />
        <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Operator Admin</h2>
      </div>
      <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Platform-wide — not visible to any business owner</p>

      <div className="grid grid-cols-2 gap-2.5 mb-6">
        <Card className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1"><Users size={12} color={TOKENS.saffronDeep} /><span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.ink, opacity: 0.72 }}>Businesses</span></div>
          <div className="font-display font-bold text-2xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{totalBusinesses.toLocaleString("en-IN")}</div>
        </Card>
        <Card className="px-4 py-3.5">
          <div className="flex items-center gap-1.5 mb-1"><IndianRupee size={12} color={TOKENS.saffronDeep} /><span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.ink, opacity: 0.72 }}>Subscription Revenue</span></div>
          <div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.stamp }}>{money(totalRevenue)}<span className="text-xs">/mo</span></div>
        </Card>
      </div>

      <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Subscription Plans — Set Your Own Price</div>
      <div className="space-y-2">
        {plans.map((p) => (
          <button key={p.id} onClick={() => openPlan(p)} className="w-full text-left px-3.5 py-3.5 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <div className="flex items-center justify-between mb-1">
              <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{p.label}</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-[9px] px-2 py-0.5 rounded-2xl" style={{ background: p.active ? TOKENS.paperDeep : "#FFFFFF", border: p.active ? "none" : `1px solid ${TOKENS.line}`, color: p.active ? TOKENS.stamp : TOKENS.ink, opacity: p.active ? 1 : 0.5 }}>
                  {p.active ? "Active" : "Off"}
                </span>
                <ChevronRight size={14} color={TOKENS.ink} style={{ opacity: 0.55 }} />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10.5px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>{p.subscribers} subscribed</span>
              <span className="font-display font-bold text-sm tabular-nums" style={{ color: TOKENS.saffronDeep }}>{money(p.price)}/mo</span>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-6 flex items-center gap-2 px-3.5 py-3 rounded-2xl" style={{ background: TOKENS.paperDeep }}>
        <TrendingUp size={13} color={TOKENS.ink} style={{ opacity: 0.68 }} />
        <span className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>Tap any plan to raise, lower, or switch it off — takes effect immediately for new subscribers</span>
      </div>
    </Shell>
  );
}
