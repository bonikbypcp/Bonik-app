import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Plus, Check, X as XIcon, Search } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Staff Management
  Staff list -> profile (attendance toggle, salary, permissions RBAC) ->
  Add Staff. Matches the ledger-design system used throughout the app.

  BACKEND STATUS: fully real. "Add Staff" is now "Requests" — a staff
  member registers their own account first (BonikAuthFlow) and sends a
  join request naming this business; the owner reviews it here and taps
  Approve (creates a real business_members row) or Reject. Permissions
  map to the schema's permissions table as one "view" action row per
  module — a simplification of the module/action matrix schema.sql
  actually supports, good enough until per-action toggles are needed.
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

const PERMISSION_MODULES = [
  "Billing", "Daily Product", "Daily Expense", "Inventory", "Ledger", "Reports", "Staff", "Online Shop",
];

// Nothing left here to seed — everything loads from Supabase.

export default function BonikStaffScreen() {
  const { businessId, memberId } = useSession();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [screen, setScreen] = useState("list"); // list | requests
  const [requests, setRequests] = useState([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [actionError, setActionError] = useState("");

  const todayStr = new Date().toISOString().slice(0, 10);

  const loadStaff = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const [{ data: memberRows }, { data: attRows }, { data: permRows }] = await Promise.all([
      supabase.from("business_members").select("*, user:users(full_name, mobile_number)").eq("business_id", businessId).eq("role", "staff").eq("status", "active").order("joined_at"),
      supabase.from("attendance").select("*").eq("work_date", todayStr),
      supabase.from("permissions").select("*").eq("action", "view"),
    ]);
    const attByMember = {};
    (attRows || []).forEach((a) => { attByMember[a.business_member_id] = a.status; });
    const permByMember = {};
    (permRows || []).forEach((p) => {
      permByMember[p.business_member_id] = permByMember[p.business_member_id] || {};
      permByMember[p.business_member_id][p.module] = p.allowed;
    });
    setStaff((memberRows || []).map((m) => ({
      id: m.id, code: m.staff_code, name: m.user?.full_name, mobile: m.user?.mobile_number,
      designation: m.designation || "Staff", salary: 0, // no salary column on business_members — tracked via Daily Expense instead
      attendanceToday: attByMember[m.id] || "present",
      permissions: Object.fromEntries(PERMISSION_MODULES.map((mod) => [mod, !!(permByMember[m.id] || {})[mod]])),
    })));
    setLoading(false);
  }, [businessId, todayStr]);

  const loadRequests = useCallback(async () => {
    if (!businessId) return;
    setRequestsLoading(true);
    const { data } = await supabase
      .from("join_requests")
      .select("*, user:users(full_name, mobile_number, email)")
      .eq("business_id", businessId)
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    setRequests(data || []);
    setRequestsLoading(false);
  }, [businessId]);

  useEffect(() => { loadStaff(); loadRequests(); }, [loadStaff, loadRequests]);

  const selected = selectedId ? staff.find((s) => s.id === selectedId) : null;
  const filtered = staff.filter((s) => (s.name || "").toLowerCase().includes(query.toLowerCase()) || (s.code || "").toLowerCase().includes(query.toLowerCase()));
  const presentToday = staff.filter((s) => s.attendanceToday === "present").length;

  const togglePermission = async (module) => {
    if (!selected) return;
    const nextAllowed = !selected.permissions[module];
    setStaff((prev) => prev.map((s) => s.id === selectedId ? { ...s, permissions: { ...s.permissions, [module]: nextAllowed } } : s));
    await supabase.from("permissions").upsert(
      { business_member_id: selectedId, module, action: "view", allowed: nextAllowed },
      { onConflict: "business_member_id,module,action" }
    );
  };
  const toggleAttendance = async () => {
    if (!selected) return;
    const nextStatus = selected.attendanceToday === "present" ? "absent" : "present";
    setStaff((prev) => prev.map((s) => s.id === selectedId ? { ...s, attendanceToday: nextStatus } : s));
    await supabase.from("attendance").upsert(
      { business_member_id: selectedId, work_date: todayStr, status: nextStatus },
      { onConflict: "business_member_id,work_date" }
    );
  };

  const approveRequest = async (req) => {
    setActionError("");
    // staff_code: next in sequence for this business
    const code = `STF-${String(staff.length + 1).padStart(3, "0")}`;
    const { error: memErr } = await supabase.from("business_members").insert({
      business_id: businessId, user_id: req.user_id, role: req.requested_role, staff_code: code, status: "active",
    });
    if (memErr) { setActionError(memErr.message); return; }
    await supabase.from("join_requests").update({ status: "approved", decided_by: memberId, decided_at: new Date().toISOString() }).eq("id", req.id);
    loadRequests();
    loadStaff();
  };
  const rejectRequest = async (req) => {
    setActionError("");
    await supabase.from("join_requests").update({ status: "rejected", decided_by: memberId, decided_at: new Date().toISOString() }).eq("id", req.id);
    loadRequests();
  };

  // ---------- Requests ----------
  if (screen === "requests") {
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Join Requests</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>They register their own account, then request to join — you just approve or reject</p>
        {actionError && <div className="mb-4 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{actionError}</div>}
        {requestsLoading ? (
          <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>
        ) : requests.length === 0 ? (
          <div className="text-center py-16 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No pending requests</div>
        ) : (
          <div className="space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-2xl px-4 py-3.5" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{r.user?.full_name}</div>
                <div className="font-mono text-[10.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{r.user?.mobile_number} · requesting {r.requested_role}</div>
                <div className="flex gap-2 mt-3">
                  <button onClick={() => approveRequest(r)} className="flex-1 py-2 rounded-2xl font-display font-semibold text-[13px]" style={{ background: TOKENS.stamp, color: TOKENS.paper }}>Approve</button>
                  <button onClick={() => rejectRequest(r)} className="flex-1 py-2 rounded-2xl border-2 font-display font-semibold text-[13px]" style={{ borderColor: TOKENS.due, color: TOKENS.due }}>Reject</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Shell>
    );
  }

  // ---------- Profile ----------
  if (selected) {
    return (
      <Shell>
        <button onClick={() => setSelectedId(null)} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> staff list</button>
        <div className="font-display font-bold text-xl" style={{ color: TOKENS.inkDeep }}>{selected.name}</div>
        <div className="font-mono text-[11px] mt-1 mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>{selected.code} · {selected.mobile} · {selected.designation}</div>

        <div className="grid grid-cols-2 gap-2.5 mb-6">
          <div className="rounded-2xl px-4 py-3.5" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.ink, opacity: 0.72 }}>Salary</div>
            <div className="font-mono text-[11px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>tracked via Daily Expense</div>
          </div>
          <button onClick={toggleAttendance} className="rounded-2xl border-2 px-4 py-3.5 text-left" style={{ borderColor: selected.attendanceToday === "present" ? TOKENS.stamp : TOKENS.due }}>
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: selected.attendanceToday === "present" ? TOKENS.stamp : TOKENS.due }}>Today</div>
            <div className="font-display font-bold text-sm flex items-center gap-1" style={{ color: selected.attendanceToday === "present" ? TOKENS.stamp : TOKENS.due }}>
              {selected.attendanceToday === "present" ? <Check size={14} /> : <XIcon size={14} />}
              {selected.attendanceToday === "present" ? "Present" : "Absent"}
            </div>
          </button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.ink, opacity: 0.72 }}>Permissions</span>
          <Stitch className="flex-1 mx-3" />
        </div>
        <div className="space-y-1 mb-2">
          {PERMISSION_MODULES.map((m) => (
            <button key={m} onClick={() => togglePermission(m)} className="w-full flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{m}</span>
              <span className="w-9 h-5 rounded-full flex items-center px-0.5 transition-all" style={{ background: selected.permissions[m] ? TOKENS.stamp : TOKENS.line, justifyContent: selected.permissions[m] ? "flex-end" : "flex-start" }}>
                <span className="w-4 h-4 rounded-full bg-white" />
              </span>
            </button>
          ))}
        </div>
        <div className="font-mono text-[9.5px] mt-2" style={{ color: TOKENS.ink, opacity: 0.58 }}>
          default OFF for everything — only what's switched on here is visible to {selected.name.split(" ")[0]}
        </div>
      </Shell>
    );
  }

  // ---------- List ----------
  return (
    <Shell>
      <div className="font-display font-bold text-lg mb-1" style={{ color: TOKENS.ink }}>Staff Management</div>
      <div className="font-mono text-[11px] mb-5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{loading ? "Loading…" : `${presentToday} of ${staff.length} present today`}</div>

      <div className="flex items-center gap-2 border-2 rounded-2xl px-3 py-2.5 mb-4" style={{ borderColor: TOKENS.line }}>
        <Search size={15} color={TOKENS.ink} style={{ opacity: 0.68 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search staff…" className="flex-1 bg-transparent outline-none text-sm font-sans" style={{ color: TOKENS.inkDeep }} />
      </div>

      <div className="space-y-2 mb-24">
        {loading && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
        {filtered.map((s) => (
          <button key={s.id} onClick={() => setSelectedId(s.id)} className="w-full text-left px-3.5 py-3 rounded-2xl flex items-center justify-between" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <div>
              <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{s.name}</div>
              <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{s.code} · {s.designation}</div>
            </div>
            <span className="font-mono text-[10px] px-2 py-1 rounded-2xl flex items-center gap-1" style={{ background: s.attendanceToday === "present" ? TOKENS.paperDeep : "#FFFFFF", border: s.attendanceToday === "present" ? "none" : `1px solid ${TOKENS.due}`, color: s.attendanceToday === "present" ? TOKENS.stamp : TOKENS.due }}>
              {s.attendanceToday === "present" ? <Check size={10} /> : <XIcon size={10} />}
              {s.attendanceToday === "present" ? "Present" : "Absent"}
            </span>
          </button>
        ))}
      </div>

      <button onClick={() => setScreen("requests")} className="fixed flex items-center justify-center shadow-lg rounded-full" style={{ width: requests.length > 0 ? "auto" : "3.5rem", height: "3.5rem", padding: requests.length > 0 ? "0 1.1rem" : 0, background: TOKENS.ink, right: "max(1.5rem, calc(50% - 210px + 1.25rem))", bottom: "2.5rem" }}>
        {requests.length > 0 ? (
          <span className="font-display font-semibold text-sm flex items-center gap-2" style={{ color: TOKENS.saffron }}>{requests.length} Request{requests.length > 1 ? "s" : ""}</span>
        ) : (
          <Plus size={22} color={TOKENS.saffron} />
        )}
      </button>
    </Shell>
  );
}
