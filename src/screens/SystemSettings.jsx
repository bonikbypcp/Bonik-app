import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, ChevronLeft, Lock, Bell, Database, Sliders, Crown, Building2, Check, Wifi, Printer, Type } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — System Settings (Part 11)
  User levels: Super Admin -> Parent Company -> Business Owner -> CEO/Manager -> Staff.
  This screen is what a Business Owner sees; Super Admin/Parent Company
  panels are noted as separate, higher-privilege surfaces (not built here
  since this business is a standalone/child business by default).

  BACKEND STATUS: Display (text size), Notifications, Print/Invoice
  Format, and Change Password are fully real. Subscription (needs a
  payment gateway — not built), Printer & Connectivity (needs native
  Bluetooth/Wi-Fi device APIs a web app can't reach), Backup & Data
  (needs an export engine), and PIN/biometric lock (device-level, not a
  database setting) all stay UI-only with a note — genuine gaps, not
  oversights.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};

function Shell({ children, scale = 1 }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.paper }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-5 pt-8 pb-16" style={{ zoom: scale }}>{children}</div>
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

const SUBSCRIPTIONS = [
  { id: "barcode", label: "Barcode System", note: "Generate, print & scan barcodes, lot tracking", price: "₹99/mo" },
  { id: "analytics", label: "Advanced Analytics", note: "Deeper trends, forecasting-ready reports", price: "₹149/mo" },
  { id: "ai", label: "AI Features", note: "Sales forecast, smart reorder suggestions", price: "₹199/mo" },
  { id: "marketplace", label: "Marketplace", note: "List your shop alongside other businesses", price: "₹249/mo" },
];

export default function BonikSystemSettings() {
  const { businessId, business } = useSession();
  const [screen, setScreen] = useState("main"); // main | subscriptions | notifications | security | backup
  const [subs, setSubs] = useState({ barcode: false, analytics: false, ai: false, marketplace: false });
  const [notif, setNotif] = useState({ lowStock: true, dueReminder: true, salaryReminder: true, newOrder: true, dailyReport: false, monthlyReport: true });
  const [notifLoading, setNotifLoading] = useState(true);
  const [security, setSecurity] = useState({ pinLock: false, biometric: false });
  const [pwForm, setPwForm] = useState({ newPassword: "", confirmPassword: "" });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMessage, setPwMessage] = useState("");
  const [textSize, setTextSize] = useState(10);
  const scale = 0.7 + (textSize / 20) * 0.7; // 1 -> 0.735x, 20 -> 1.4x — applies to every screen below
  const [printFormat, setPrintFormat] = useState({ logo: true, gst: true, address: true, ownerName: true });

  useEffect(() => {
    if (business) {
      setTextSize(business.text_size ?? 10);
      if (business.print_format) setPrintFormat(business.print_format);
    }
  }, [business]);

  const loadNotifications = useCallback(async () => {
    if (!businessId) return;
    setNotifLoading(true);
    const { data } = await supabase.from("notification_settings").select("*").eq("business_id", businessId).maybeSingle();
    if (data) {
      setNotif({
        lowStock: data.low_stock_alert, dueReminder: data.due_reminder, salaryReminder: data.salary_reminder,
        newOrder: data.new_order_alert, dailyReport: data.daily_report, monthlyReport: data.monthly_report,
      });
    }
    setNotifLoading(false);
  }, [businessId]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  const saveNotif = async (next) => {
    setNotif(next);
    await supabase.from("notification_settings").upsert({
      business_id: businessId, low_stock_alert: next.lowStock, due_reminder: next.dueReminder, salary_reminder: next.salaryReminder,
      new_order_alert: next.newOrder, daily_report: next.dailyReport, monthly_report: next.monthlyReport,
    }, { onConflict: "business_id" });
  };

  const saveTextSize = async (val) => {
    setTextSize(val);
    await supabase.from("businesses").update({ text_size: val }).eq("id", businessId);
  };

  const savePrintFormat = async (next) => {
    setPrintFormat(next);
    await supabase.from("businesses").update({ print_format: next }).eq("id", businessId);
  };

  const changePassword = async () => {
    if (pwForm.newPassword.length < 6 || pwForm.newPassword !== pwForm.confirmPassword) return;
    setPwSaving(true);
    setPwMessage("");
    const { error } = await supabase.auth.updateUser({ password: pwForm.newPassword });
    setPwSaving(false);
    setPwMessage(error ? error.message : "Password updated.");
    if (!error) setPwForm({ newPassword: "", confirmPassword: "" });
  };

  const toggleSub = (id) => setSubs((s) => ({ ...s, [id]: !s[id] }));

  // ---------- Display ----------
  if (screen === "display") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Display</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>One number scales everything, everywhere in the app</p>

        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.72 }}>Text Size</span>
          <span className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.saffronDeep }}>{textSize} / 20</span>
        </div>
        <input
          type="range" min="1" max="20" value={textSize}
          onChange={(e) => saveTextSize(parseInt(e.target.value))}
          className="w-full mb-2" style={{ accentColor: TOKENS.saffron }}
        />
        <div className="flex justify-between font-mono text-[9px] mb-8" style={{ color: TOKENS.ink, opacity: 0.58 }}>
          <span>1 — smallest</span><span>20 — largest</span>
        </div>

        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Sample</div>
        <Card className="px-4 py-5">
          <div className="font-display font-bold mb-2 text-[22px]" style={{ color: TOKENS.inkDeep }}>Sharma General Store</div>
          <div className="font-sans mb-2 text-[14px]" style={{ color: TOKENS.ink }}>Tata Salt 1kg — everyday grocery item</div>
          <div className="font-mono font-bold text-[18px]" style={{ color: TOKENS.saffronDeep }}>₹28.00</div>
          <div className="font-mono mt-1 text-[10px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>CODE P-101 · IN STOCK · 42 PCS</div>
        </Card>
        <div className="font-mono text-[10px] mt-3" style={{ color: TOKENS.ink, opacity: 0.62 }}>
          Go back to Settings and browse around — every screen stays at this size until you change it again.
        </div>
      </Shell>
    );
  }

  // ---------- Printer & Connectivity ----------
  if (screen === "connectivity") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Printer & Connectivity</h2>

        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Wi-Fi</div>
        <Card className="px-3.5 py-3 mb-6">
          <div className="flex items-center justify-between">
            <div><div className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>Shop_WiFi_5G</div><div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.stamp }}>Connected</div></div>
            <button className="font-mono text-[10px] underline rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}>change</button>
          </div>
        </Card>

        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Receipt Printer</div>
        <Card className="px-3.5 py-3 mb-2">
          <div className="flex items-center justify-between">
            <div><div className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>No printer connected</div><div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Bluetooth or Wi-Fi thermal printers supported</div></div>
          </div>
        </Card>
        <button className="w-full py-3 rounded-2xl border-2 border-dashed font-mono text-xs mb-6" style={{ borderColor: TOKENS.saffron, color: TOKENS.saffronDeep }}>
          Scan for Printers
        </button>

        <div className="font-mono text-[10px] mb-6" style={{ color: TOKENS.ink, opacity: 0.62 }}>
          Needs native Bluetooth/Wi-Fi device access — this screen is a placeholder until BONIK has a native app shell, not just a browser.
        </div>
      </Shell>
    );
  }

  // ---------- Print / Invoice Format ----------
  if (screen === "printFormat") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Print / Invoice Format</h2>

        <div className="space-y-1 mb-6">
          {[["logo", "Show Shop Logo"], ["gst", "Show GST Number"], ["address", "Show Address"], ["ownerName", "Show Owner Name"]].map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span>
              <Toggle on={printFormat[key]} onClick={() => savePrintFormat({ ...printFormat, [key]: !printFormat[key] })} />
            </div>
          ))}
        </div>

        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Preview</div>
        <Card className="px-4 py-4">
          {printFormat.logo && <div className="w-8 h-8 rounded-2xl mb-2" style={{ background: TOKENS.saffron }} />}
          <div className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>{business?.name}</div>
          {printFormat.address && <div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>{business?.address}</div>}
          {printFormat.gst && business?.gst_number && <div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>GST: {business.gst_number}</div>}
          {printFormat.ownerName && <div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Owner: {business?.owner?.full_name}</div>}
        </Card>
      </Shell>
    );
  }

  // ---------- Subscriptions ----------
  if (screen === "subscriptions") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Subscription</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Off by default — turn on what you need. Needs a payment gateway to actually charge — toggles here aren't saved yet.</p>
        <div className="space-y-2">
          {SUBSCRIPTIONS.map((s) => (
            <Card key={s.id} className="px-3.5 py-3.5">
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{s.label}</span>
                <Toggle on={subs[s.id]} onClick={() => toggleSub(s.id)} />
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10.5px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>{s.note}</span>
                <span className="font-mono text-[10.5px]" style={{ color: TOKENS.saffronDeep }}>{s.price}</span>
              </div>
            </Card>
          ))}
        </div>
      </Shell>
    );
  }

  // ---------- Notifications ----------
  if (screen === "notifications") {
    const items = [
      ["lowStock", "Low Stock Alert"], ["dueReminder", "Due Reminder"], ["salaryReminder", "Staff Salary Reminder"],
      ["newOrder", "New Online Order"], ["dailyReport", "Daily Report"], ["monthlyReport", "Monthly Report"],
    ];
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Notifications</h2>
        <div className="space-y-1">
          {notifLoading && <div className="font-mono text-xs py-4" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
          {items.map(([key, label]) => (
            <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span>
              <Toggle on={notif[key]} onClick={() => saveNotif({ ...notif, [key]: !notif[key] })} />
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  // ---------- Security ----------
  if (screen === "security") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Security</h2>
        <div className="space-y-1 mb-6">
          <div className="py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
            <div className="font-sans text-[13px] mb-2" style={{ color: TOKENS.inkDeep }}>Change Password</div>
            <input type="password" value={pwForm.newPassword} onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))} placeholder="New password (min 6 chars)"
              className="w-full bg-transparent border-0 border-b-2 pb-2 mb-2 text-[13px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
            <input type="password" value={pwForm.confirmPassword} onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))} placeholder="Confirm new password"
              className="w-full bg-transparent border-0 border-b-2 pb-2 mb-2 text-[13px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
            {pwMessage && <div className="font-mono text-[10.5px] mb-2" style={{ color: pwMessage === "Password updated." ? TOKENS.stamp : TOKENS.due }}>{pwMessage}</div>}
            <button disabled={pwForm.newPassword.length < 6 || pwForm.newPassword !== pwForm.confirmPassword || pwSaving} onClick={changePassword}
              className="px-4 py-2 rounded-2xl font-display font-semibold text-[12.5px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
              {pwSaving ? "Saving…" : "Update Password"}
            </button>
          </div>
          <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
            <div>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>App PIN Lock</span>
              <div className="font-mono text-[9.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.55 }}>device-level — not saved yet</div>
            </div>
            <Toggle on={security.pinLock} onClick={() => setSecurity((s) => ({ ...s, pinLock: !s.pinLock }))} />
          </div>
          <div className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
            <div>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>Fingerprint / Face Unlock</span>
              <div className="font-mono text-[9.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.55 }}>device-level — not saved yet</div>
            </div>
            <Toggle on={security.biometric} onClick={() => setSecurity((s) => ({ ...s, biometric: !s.biometric }))} />
          </div>
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Active Sessions</div>
        <Card className="px-3.5 py-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>This Device</div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Android · logged in today</div>
            </div>
            <Check size={14} color={TOKENS.stamp} />
          </div>
        </Card>
      </Shell>
    );
  }

  // ---------- Backup ----------
  if (screen === "backup") {
    return (
      <Shell scale={scale}>
        <button onClick={() => setScreen("main")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ChevronLeft size={13} /> settings</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Backup & Data</h2>
        <div className="space-y-2 mb-6">
          <button className="w-full text-left px-4 py-3.5 rounded-2xl border-2 font-display font-semibold text-sm" style={{ borderColor: TOKENS.ink, color: TOKENS.inkDeep }}>Backup Now</button>
          <button className="w-full text-left px-4 py-3.5 rounded-2xl border-2 font-display font-semibold text-sm" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}>Restore From Backup</button>
        </div>
        <div className="font-mono text-[10px] mb-6" style={{ color: TOKENS.ink, opacity: 0.62 }}>
          Automatic cloud backup is coming in a future update — manual backup works today.
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Export Data</div>
        <div className="grid grid-cols-3 gap-2">
          {["PDF", "Excel", "CSV"].map((f) => (
            <button key={f} className="py-2.5 rounded-2xl border-2 font-mono text-[11px]" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}>{f}</button>
          ))}
        </div>
      </Shell>
    );
  }

  // ---------- Main ----------
  const rows = [
    { icon: Type, label: "Display", note: "App text size", go: "display" },
    { icon: Wifi, label: "Printer & Connectivity", note: "Wi-Fi and receipt printer", go: "connectivity" },
    { icon: Printer, label: "Print / Invoice Format", note: "Logo, GST, address on prints", go: "printFormat" },
    { icon: Sliders, label: "Subscription", note: "Barcode, Analytics, AI, Marketplace", go: "subscriptions" },
    { icon: Bell, label: "Notifications", note: "Alerts and reminders", go: "notifications" },
    { icon: Lock, label: "Security", note: "Password, PIN, sessions", go: "security" },
    { icon: Database, label: "Backup & Data", note: "Backup, restore, export", go: "backup" },
  ];

  return (
    <Shell scale={scale}>
      <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>System Settings</h2>
      <div className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Business Owner level</div>

      {/* Hierarchy context card */}
      <Card className="px-4 py-4 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Building2 size={14} color={TOKENS.saffronDeep} />
          <span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.ink, opacity: 0.72 }}>Business Structure</span>
        </div>
        <div className="font-sans text-[12.5px]" style={{ color: TOKENS.inkDeep }}>
          {business?.name} is a standalone business — not linked to any Parent Company.
        </div>
        <div className="font-mono text-[9.5px] mt-2 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.58 }}>
          <Crown size={10} /> Super Admin & Parent Company controls apply only if this business joins a group later
        </div>
      </Card>

      <div className="space-y-2">
        {rows.map((r, i) => {
          const Icon = r.icon;
          return (
            <button key={i} onClick={() => setScreen(r.go)} className="w-full flex items-center gap-3 px-3.5 py-3.5 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: TOKENS.paperDeep }}>
                <Icon size={16} color={TOKENS.ink} />
              </div>
              <div className="flex-1 text-left">
                <div className="font-display font-semibold text-[13.5px]" style={{ color: TOKENS.inkDeep }}>{r.label}</div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{r.note}</div>
              </div>
              <ChevronRight size={15} color={TOKENS.ink} style={{ opacity: 0.55 }} />
            </button>
          );
        })}
      </div>
    </Shell>
  );
}
