import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Type,
  Store,
  Bell,
  Lock,
  Users,
  CreditCard,
  Database,
  Check,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Settings Screen
  Lives under the Home menu (not inside Billing). The "Table Text Size"
  control here is what governs the Qty/Rate/Amount font size on the
  Billing table (and other tabular screens later), so the user sets it
  once instead of per-screen.

  BACKEND STATUS: Table Text Size shares the same businesses.text_size
  column SystemSettings' Display slider uses (1-20), mapped down to
  three presets here so both screens always agree on one real value.
  The other rows below just deep-link into System Settings, where
  Notifications/Security/Backup already live — no separate Business
  Profile or Payment Methods screen exists yet, so those two stay
  inactive for now.
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
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-5 pt-8 pb-16 relative">{children}</div>
    </div>
  );
}

const SIZE_OPTIONS = [
  { id: "compact", label: "Compact", sample: "14" },
  { id: "comfortable", label: "Comfortable", sample: "14" },
  { id: "large", label: "Large", sample: "14" },
];

const SIZE_PX = { compact: 12, comfortable: 15, large: 18 };

const OTHER_SETTINGS = [
  { icon: Store, label: "Business Profile", note: "Name, address, GST, shop photo", go: null },
  { icon: Users, label: "Staff & Permissions", note: "Roles, access, join requests", go: "/staff" },
  { icon: CreditCard, label: "Payment Methods", note: "Cash, online, bank accounts", go: null },
  { icon: Bell, label: "Notifications", note: "Low stock, due, salary reminders", go: "/system-settings" },
  { icon: Lock, label: "Security", note: "Password, PIN lock, sessions", go: "/system-settings" },
  { icon: Database, label: "Backup & Data", note: "Export, backup, restore", go: "/system-settings" },
];

const SIZE_TO_VALUE = { compact: 6, comfortable: 10, large: 15 };
const valueToSize = (v) => (v <= 8 ? "compact" : v <= 12 ? "comfortable" : "large");

export default function BonikSettingsScreen() {
  const navigate = useNavigate();
  const { businessId, business } = useSession();
  const [tableSize, setTableSize] = useState("comfortable");

  useEffect(() => {
    if (business?.text_size != null) setTableSize(valueToSize(business.text_size));
  }, [business]);

  const chooseSize = async (id) => {
    setTableSize(id);
    await supabase.from("businesses").update({ text_size: SIZE_TO_VALUE[id] }).eq("id", businessId);
  };

  return (
    <Shell>
      <button onClick={() => navigate("/home")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>
        <ChevronLeft size={13} /> home
      </button>

      <div className="font-display font-bold text-xl mb-1" style={{ color: TOKENS.ink }}>Settings</div>
      <div className="font-mono text-[11px] mb-7" style={{ color: TOKENS.ink, opacity: 0.68 }}>
        Applies across the app for this business
      </div>

      {/* Display section */}
      <div className="mb-3 flex items-center gap-2">
        <Type size={14} color={TOKENS.saffronDeep} />
        <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.75 }}>
          Table Text Size
        </span>
      </div>
      <div className="font-sans text-xs mb-4" style={{ color: TOKENS.ink, opacity: 0.72 }}>
        Controls the numbers in Billing, Ledger, Inventory and Report tables — the product Name column always stays small so numbers stay easy to read.
      </div>

      <div className="grid grid-cols-3 gap-2 mb-8">
        {SIZE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            onClick={() => chooseSize(opt.id)}
            className="rounded-2xl border-2 py-3 flex flex-col items-center gap-2 transition-all"
            style={{
              borderColor: tableSize === opt.id ? TOKENS.saffron : TOKENS.line,
              background: tableSize === opt.id ? TOKENS.paperDeep : "#FFFFFF",
            }}
          >
            <span
              className="font-mono tabular-nums"
              style={{ fontSize: SIZE_PX[opt.id], color: TOKENS.inkDeep }}
            >
              {opt.sample}
            </span>
            <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.7 }}>
              {tableSize === opt.id && <Check size={10} color={TOKENS.saffronDeep} />}
              {opt.label}
            </span>
          </button>
        ))}
      </div>

      {/* Live preview matching the billing table style */}
      <div className="border-2 rounded-2xl overflow-hidden mb-8" style={{ borderColor: TOKENS.ink }}>
        <div className="grid font-mono text-[10px] uppercase tracking-wide py-2" style={{ gridTemplateColumns: "15% 14% 12% 5% 13% 31% 10%", background: TOKENS.ink, color: TOKENS.saffron }}>
          <div className="px-2">Code</div>
          <div className="px-1.5">Name</div>
          <div className="text-center">Qty</div>
          <div></div>
          <div className="text-center">Rate</div>
          <div className="px-1.5 text-right">Amount</div>
          <div></div>
        </div>
        <div className="grid items-center py-2.5 border-t" style={{ gridTemplateColumns: "15% 14% 12% 5% 13% 31% 10%", borderColor: TOKENS.line }}>
          <div className="px-2 font-mono truncate text-[13px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>P-103</div>
          <div className="px-1.5 font-sans truncate text-[10px]" style={{ color: TOKENS.inkDeep }}>Sunflower Oil 1L</div>
          <div className="text-center font-mono tabular-nums" style={{ fontSize: SIZE_PX[tableSize], color: TOKENS.inkDeep }}>1</div>
          <div className="text-center font-mono" style={{ color: TOKENS.ink, opacity: 0.55 }}>×</div>
          <div className="text-center font-mono tabular-nums" style={{ fontSize: SIZE_PX[tableSize], color: TOKENS.inkDeep }}>145</div>
          <div className="px-1.5 text-right font-mono tabular-nums" style={{ fontSize: SIZE_PX[tableSize], color: TOKENS.inkDeep }}>145</div>
          <div />
        </div>
      </div>

      <Stitch className="mb-6" />

      {/* Other settings */}
      <div className="space-y-1">
        {OTHER_SETTINGS.map((s, i) => {
          const Icon = s.icon;
          return (
            <button key={i} onClick={() => s.go && navigate(s.go)} disabled={!s.go} className="w-full flex items-center gap-3 py-3.5 disabled:opacity-50" style={{ borderBottom: i < OTHER_SETTINGS.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: TOKENS.paperDeep }}>
                <Icon size={16} color={TOKENS.ink} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-display font-semibold text-[13.5px]" style={{ color: TOKENS.inkDeep }}>{s.label}</div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{s.note}</div>
              </div>
              <ChevronRight size={15} color={TOKENS.ink} style={{ opacity: 0.55 }} />
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
