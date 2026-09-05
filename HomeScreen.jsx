import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useSession } from "../lib/session";
import {
  PackagePlus,
  Receipt,
  Wallet,
  Boxes,
  BookOpen,
  BarChart3,
  Users,
  ShoppingBag,
  Bell,
  ChevronRight,
  Settings,
  ScanLine,
} from "lucide-react";

/*
  BONIK by PCP — Home Screen (v2)
  Redesigned toward the reference: navy gradient header with a soft wave,
  a signboard card, and clean white module cards with navy icon badges.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};

const MODULES = [
  { id: "daily_product", label: "Daily Product", icon: PackagePlus, note: "Stock in & supplier delivery", route: "/daily-product" },
  { id: "billing", label: "Billing", icon: Receipt, note: "Create & confirm bills", route: "/billing" },
  { id: "daily_expense", label: "Daily Expense", icon: Wallet, note: "Track daily expenses", route: "/daily-expense" },
  { id: "inventory", label: "Inventory", icon: Boxes, note: "Manage stock & view reports", route: "/inventory" },
  { id: "ledger", label: "Ledger", icon: BookOpen, note: "Customer, supplier & staff accounts", route: "/ledger" },
  { id: "bill_scan", label: "Bill Scan", icon: ScanLine, note: "Photo a bill, auto-extract items", route: "/bill-scan" },
  { id: "staff", label: "Staff Management", icon: Users, note: "Team, attendance & salary", route: "/staff" },
  { id: "online_shop", label: "Online Shop", icon: ShoppingBag, note: "Your customer-facing store", route: "/online-shop" },
  { id: "settings", label: "Settings", icon: Settings, note: "Display, business & app preferences", route: "/settings" },
];

function ModuleTile({ mod, active, onClick }) {
  const Icon = mod.icon;
  return (
    <button
      onClick={() => onClick(mod.id)}
      className="text-left p-4 rounded-2xl transition-all active:scale-[0.97]"
      style={{
        background: "#FFFFFF",
        boxShadow: active === mod.id ? `0 0 0 2px ${TOKENS.saffron}` : "0 1px 3px rgba(10,25,48,0.08)",
      }}
    >
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
        style={{ background: TOKENS.ink }}
      >
        <Icon size={20} color={TOKENS.saffron} strokeWidth={2} />
      </div>
      <div className="font-display font-bold text-[14.5px] leading-tight" style={{ color: TOKENS.inkDeep }}>
        {mod.label}
      </div>
      <div className="flex items-end justify-between mt-1.5">
        <div className="font-sans text-[11px] leading-snug pr-2" style={{ color: TOKENS.slate }}>
          {mod.note}
        </div>
        <ChevronRight size={15} color={TOKENS.slate} className="shrink-0" />
      </div>
    </button>
  );
}

export default function BonikHomeScreen() {
  const navigate = useNavigate();
  const { business, role: sessionRole } = useSession();
  const businessName = business?.name || "";
  const role = sessionRole ? sessionRole.charAt(0).toUpperCase() + sessionRole.slice(1) : "";
  const [activeModule, setActiveModule] = useState(null);

  const summary = {
    todaySales: "₹8,240",
    due: "₹3,150",
    lowStock: 6,
  };

  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700;800&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>

      <div className="w-full max-w-[420px] min-h-screen relative pb-8">
        {/* Navy header with a soft wave */}
        <div className="relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${TOKENS.ink} 0%, ${TOKENS.inkDeep} 100%)` }}>
          <svg className="absolute inset-x-0 bottom-0" viewBox="0 0 420 60" preserveAspectRatio="none" style={{ width: "100%", height: 46, display: "block" }}>
            <path d="M0,20 C90,55 150,0 220,25 C300,52 360,10 420,30 L420,60 L0,60 Z" fill={TOKENS.paper} opacity="0.9" />
          </svg>
          <div className="relative flex items-center justify-between px-5 pt-6 pb-9">
            <div>
              <div className="font-display font-extrabold text-xl tracking-tight" style={{ color: "#FFFFFF" }}>
                BONIK <span className="font-semibold" style={{ color: TOKENS.saffron }}>by pcp</span>
              </div>
              <div className="font-mono text-[10px] uppercase tracking-[0.16em] mt-1" style={{ color: "#B9C4D8" }}>
                {role}
              </div>
            </div>
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center relative"
              style={{ background: "rgba(255,255,255,0.12)" }}
            >
              <Bell size={16} color="#FFFFFF" />
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: TOKENS.due, boxShadow: `0 0 0 2px ${TOKENS.ink}` }}
              />
            </button>
          </div>
        </div>

        {/* Signboard card, floating over the wave */}
        <div className="px-5 -mt-8 relative z-10">
          <div className="rounded-2xl overflow-hidden" style={{ background: TOKENS.ink, boxShadow: "0 10px 30px rgba(10,25,48,0.25)" }}>
            {/* thin gold accent line instead of a hazard-stripe */}
            <div style={{ height: 4, background: `linear-gradient(90deg, ${TOKENS.saffron}, ${TOKENS.saffronDeep})` }} />
            <div className="px-5 pt-4 pb-4">
              <div className="font-mono text-[10px] uppercase tracking-[0.18em] mb-1" style={{ color: TOKENS.saffron, opacity: 0.9 }}>
                your shop
              </div>
              <div className="font-display font-bold text-xl" style={{ color: "#FFFFFF" }}>
                {businessName}
              </div>
            </div>
            {/* summary strip */}
            <div className="grid grid-cols-3" style={{ background: "#FFFFFF" }}>
              {[
                { label: "Today's Sales", value: summary.todaySales, color: TOKENS.stamp },
                { label: "Total Due", value: summary.due, color: TOKENS.due },
                { label: "Low Stock", value: summary.lowStock, color: TOKENS.saffronDeep },
              ].map((s, i) => (
                <div key={i} className="px-2 py-4 text-center" style={{ borderLeft: i > 0 ? `1px solid ${TOKENS.line}` : "none" }}>
                  <div className="font-display font-bold text-[16px] tabular-nums" style={{ color: s.color }}>{s.value}</div>
                  <div className="font-mono text-[9px] uppercase tracking-wide mt-1" style={{ color: TOKENS.slate }}>
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Module grid */}
        <div className="px-5 mt-7">
          <div className="flex items-center justify-between mb-3.5">
            <span className="font-display font-bold text-[13px] uppercase tracking-wide" style={{ color: TOKENS.inkDeep }}>
              Modules
            </span>
            <div className="flex-1 h-px ml-3" style={{ background: TOKENS.line }} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {MODULES.map((mod) => (
              <ModuleTile key={mod.id} mod={mod} active={activeModule} onClick={setActiveModule} />
            ))}
          </div>
        </div>

        {activeModule && (
          <div className="px-5 mt-5">
            <button
              onClick={() => navigate(MODULES.find((m) => m.id === activeModule)?.route)}
              className="w-full flex items-center justify-between px-4 py-3.5 rounded-2xl"
              style={{ background: TOKENS.ink }}
            >
              <span className="font-display text-sm font-semibold" style={{ color: "#FFFFFF" }}>
                Open {MODULES.find((m) => m.id === activeModule)?.label}
              </span>
              <ChevronRight size={16} color={TOKENS.saffron} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
