import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Auth & Business Creation flow
  Design language: "Digital Ledger" — a modern take on the paper accounts
  book (khata) every Indian trader already trusts, rendered mobile-first.
  Ink navy + saffron stamp accent, dashed "stitch" rules standing in for
  the perforated tear-line of a receipt book, and an ink-stamp motion
  used for verification / confirmation moments.
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
      style={{
        backgroundImage:
          "repeating-linear-gradient(90deg, " +
          TOKENS.line +
          " 0 6px, transparent 6px 12px)",
      }}
    />
  );
}

function Wordmark({ size = "text-2xl" }) {
  return (
    <div className={`font-display ${size} tracking-tight`} style={{ color: TOKENS.ink }}>
      <span className="font-bold">BONIK</span>
      <span className="font-normal lowercase" style={{ color: TOKENS.saffronDeep }}>
        {" "}by pcp
      </span>
    </div>
  );
}

function FieldLabel({ children }) {
  return (
    <label
      className="block text-[11px] font-mono uppercase tracking-[0.14em] mb-1.5"
      style={{ color: TOKENS.ink, opacity: 0.75 }}
    >
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
        className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-sans outline-none transition-colors focus:border-current"
        style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }}
        onFocus={(e) => (e.target.style.borderColor = TOKENS.saffron)}
        onBlur={(e) => (e.target.style.borderColor = TOKENS.line)}
      />
    </div>
  );
}

function PrimaryButton({ children, onClick, disabled, type = "button" }) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] tracking-wide transition-all active:scale-[0.98] disabled:opacity-40"
      style={{ background: TOKENS.ink, color: TOKENS.paper }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      className="w-full py-3 font-mono text-[13px] tracking-wide underline underline-offset-4"
      style={{ color: TOKENS.ink, opacity: 0.65 }}
    >
      {children}
    </button>
  );
}

function StampBadge({ label = "VERIFIED" }) {
  return (
    <div className="flex items-center justify-center py-6">
      <div
        className="stamp-pop w-28 h-28 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg]"
        style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}
      >
        <span className="font-display font-bold text-[13px] tracking-[0.12em] text-center leading-tight">
          {label}
        </span>
      </div>
    </div>
  );
}

function ProgressDots({ step, total }) {
  return (
    <div className="flex gap-1.5 justify-center mb-8">
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          className="h-1.5 rounded-full transition-all"
          style={{
            width: i === step ? 22 : 6,
            background: i <= step ? TOKENS.saffron : TOKENS.line,
          }}
        />
      ))}
    </div>
  );
}

function Shell({ children }) {
  return (
    <div
      className="min-h-screen w-full flex items-start justify-center font-sans"
      style={{ background: TOKENS.paper }}
    >
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
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .slide-up { animation: slideUp 0.35s ease both; }
        input:-webkit-autofill { -webkit-text-fill-color: ${TOKENS.inkDeep}; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-6 pt-10 pb-16 relative">
        {children}
      </div>
    </div>
  );
}

const ROLES = [
  { id: "owner", title: "Business Owner", note: "Full control of your business" },
  { id: "manager", title: "Manager", note: "Access as given by the owner" },
  { id: "staff", title: "Staff", note: "Billing & assigned tasks" },
  { id: "customer", title: "Customer", note: "Shop from a business online" },
  { id: "parent", title: "Parent Company", note: "Oversee multiple businesses" },
];

const CATEGORIES = [
  "Retail / General Store",
  "Grocery & Kirana",
  "Pharmacy",
  "Electronics",
  "Apparel & Garments",
  "Restaurant / Food",
  "Wholesale / Distribution",
  "Service Business",
  "Other",
];

export default function BonikAuthFlow() {
  const navigate = useNavigate();
  const { refreshMember } = useSession();
  const [screen, setScreen] = useState("landing");
  const [mode, setMode] = useState("login"); // login | register
  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");

  const handleLogin = async () => {
    setLoginError("");
    setLoginLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: loginForm.email,
      password: loginForm.password,
    });
    setLoginLoading(false);
    if (error) {
      setLoginError(error.message);
      return;
    }
    setScreen("roleGate");
  };
  const [role, setRole] = useState(null);
  const [roleGateChecking, setRoleGateChecking] = useState(true);
  const [pendingRequest, setPendingRequest] = useState(null); // this user's own pending join_requests row, if any

  // pendingApproval screen state (declared here, not inside the if-block, per rules of hooks)
  const [bizQuery, setBizQuery] = useState("");
  const [bizResults, setBizResults] = useState([]);
  const [bizSearching, setBizSearching] = useState(false);
  const [pickedBiz, setPickedBiz] = useState(null);
  const [sendError, setSendError] = useState("");
  const [sending, setSending] = useState(false);

  // ---- roleGate: figure out where a logged-in user actually belongs ----
  useEffect(() => {
    if (screen !== "roleGate") return;
    let cancelled = false;
    (async () => {
      setRoleGateChecking(true);
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setRoleGateChecking(false); return; }

      const { data: member } = await supabase.from("business_members").select("id").eq("user_id", uid).eq("status", "active").maybeSingle();
      if (cancelled) return;
      if (member) { navigate("/home"); return; }

      const { data: req } = await supabase.from("join_requests").select("*, business:businesses(name)").eq("user_id", uid).eq("status", "pending").maybeSingle();
      if (cancelled) return;
      if (req) { setPendingRequest(req); setScreen("pendingApproval"); return; }

      setRoleGateChecking(false); // no membership, no pending request — fall through to role selection below
    })();
    return () => { cancelled = true; };
  }, [screen, navigate]);

  const [form, setForm] = useState({
    fullName: "",
    mobile: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const otpRefs = useRef([]);

  const [biz, setBiz] = useState({
    name: "",
    category: "",
    ownerName: "",
    mobile: "",
    address: "",
    gst: "",
  });

  const set = (obj, setter) => (key) => (e) =>
    setter((prev) => ({ ...prev, [key]: e.target.value }));

  const setF = set(form, setForm);
  const setB = set(biz, setBiz);

  const handleOtp = (i, val) => {
    if (!/^[0-9]?$/.test(val)) return;
    const next = [...otp];
    next[i] = val;
    setOtp(next);
    if (val && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const canSubmitAccount =
    form.fullName && form.mobile.length >= 10 && form.email.includes("@") &&
    form.password.length >= 6 && form.password === form.confirmPassword;

  const [signUpLoading, setSignUpLoading] = useState(false);
  const [signUpError, setSignUpError] = useState("");

  const handleSignUp = async () => {
    setSignUpError("");
    setSignUpLoading(true);
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName, mobile_number: form.mobile } },
    });
    setSignUpLoading(false);
    if (error) {
      setSignUpError(error.message);
      return;
    }
    setScreen("verify");
  };

  const canSubmitBiz = biz.name && biz.category && biz.ownerName && biz.mobile;
  const [bizLoading, setBizLoading] = useState(false);
  const [bizError, setBizError] = useState("");

  // Creates the businesses row (naming this user as owner) and the matching
  // business_members "owner" row that every other screen's RLS policy relies
  // on to find businessId. Both must succeed against the businesses/
  // business_members insert policies in rls.sql, and column names here must
  // match schema.sql exactly (owner_user_id, mobile_number, gst_number —
  // not owner_id/mobile/gst) or Supabase rejects the insert outright.
  const handleCreateBusiness = async () => {
    if (!canSubmitBiz || bizLoading) return;
    setBizError("");
    setBizLoading(true);

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    const uid = userData?.user?.id;
    if (userErr || !uid) {
      setBizError("Your session expired — please log in again.");
      setBizLoading(false);
      return;
    }

    const { data: newBiz, error: bizInsertError } = await supabase
      .from("businesses")
      .insert({
        name: biz.name,
        category: biz.category,
        owner_user_id: uid,
        mobile_number: biz.mobile || null,
        address: biz.address || null,
        gst_number: biz.gst || null,
      })
      .select()
      .single();

    if (bizInsertError || !newBiz) {
      setBizError(bizInsertError?.message || "Could not create the business. Please try again.");
      setBizLoading(false);
      return;
    }

    const { error: memberInsertError } = await supabase.from("business_members").insert({
      business_id: newBiz.id,
      user_id: uid,
      role: "owner",
      status: "active",
    });

    if (memberInsertError) {
      setBizError(memberInsertError.message);
      setBizLoading(false);
      return;
    }

    // SessionProvider loaded (no) membership once, at login — it has no way
    // to know a business_members row now exists unless told, and every
    // protected route reads businessId straight from it.
    await refreshMember();
    setBizLoading(false);
    setScreen("success");
  };

  // ---------- LANDING ----------
  if (screen === "landing") {
    return (
      <Shell>
        <div className="flex flex-col min-h-[85vh]">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div
              className="w-16 h-16 rounded-2xl mb-6 flex items-center justify-center rotate-3"
              style={{ background: TOKENS.ink }}
            >
              <span className="font-display font-bold text-2xl" style={{ color: TOKENS.saffron }}>
                ব
              </span>
            </div>
            <Wordmark size="text-3xl" />
            <p className="font-mono text-[13px] mt-3 max-w-[260px]" style={{ color: TOKENS.ink, opacity: 0.72 }}>
              one entry → every book updates itself
            </p>
          </div>
          <div className="space-y-3">
            <PrimaryButton onClick={() => { setMode("login"); setScreen("login"); }}>
              Log In
            </PrimaryButton>
            <button
              onClick={() => { setMode("register"); setScreen("register"); }}
              className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] tracking-wide border-2 transition-all active:scale-[0.98]"
              style={{ borderColor: TOKENS.ink, color: TOKENS.ink }}
            >
              Create a Business
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- LOGIN ----------
  if (screen === "login") {
    return (
      <Shell>
        <button onClick={() => setScreen("landing")} className="font-mono text-xs mb-8" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          ← back
        </button>
        <Wordmark />
        <p className="font-sans text-sm mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.75 }}>
          Welcome back. Log in to your ledger.
        </p>
        <div
          className="slide-up rounded-2xl p-5"
          style={{ background: "#FFFFFF", boxShadow: "0 2px 10px rgba(10,25,48,0.10)" }}
        >
          <TextInput
            label="Email"
            type="email"
            value={loginForm.email}
            onChange={(e) => setLoginForm((f) => ({ ...f, email: e.target.value }))}
            placeholder="you@example.com"
          />
          <TextInput
            label="Password"
            type="password"
            value={loginForm.password}
            onChange={(e) => setLoginForm((f) => ({ ...f, password: e.target.value }))}
            placeholder="••••••••"
          />
          {loginError && (
            <div className="mb-4 -mt-1 font-mono text-xs" style={{ color: TOKENS.due }}>
              {loginError}
            </div>
          )}
          <div className="mb-6 -mt-2 text-right">
            <span className="font-mono text-xs underline" style={{ color: TOKENS.saffronDeep }}>Forgot password?</span>
          </div>
          <PrimaryButton onClick={handleLogin} disabled={loginLoading || !loginForm.email || !loginForm.password}>
            {loginLoading ? "Logging in…" : "Log In"}
          </PrimaryButton>
          <GhostButton onClick={() => { setMode("register"); setScreen("register"); }}>
            New here? Create a business →
          </GhostButton>
        </div>
      </Shell>
    );
  }

  // After login: roleGate checks for an existing membership or pending request (see useEffect above)
  // and redirects automatically. If neither exists, send them to role selection to start fresh.
  useEffect(() => {
    if (screen === "roleGate" && !roleGateChecking) setScreen("role");
  }, [screen, roleGateChecking]);

  if (screen === "roleGate") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
          <Wordmark />
          <p className="font-mono text-xs mt-4" style={{ color: TOKENS.ink, opacity: 0.72 }}>Checking your account…</p>
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: account details ----------
  if (screen === "register") {
    return (
      <Shell>
        <button onClick={() => setScreen("landing")} className="font-mono text-xs mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          ← back
        </button>
        <ProgressDots step={0} total={4} />
        <div className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 1 of 4</div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Create your account</h2>
        </div>
        <div className="slide-up rounded-2xl p-5" style={{ background: "#FFFFFF", boxShadow: "0 2px 10px rgba(10,25,48,0.10)" }}>
          <TextInput label="Full Name" value={form.fullName} onChange={setF("fullName")} placeholder="Ananya Sharma" />
          <TextInput label="Mobile Number" value={form.mobile} onChange={setF("mobile")} placeholder="98xxxxxxxx" />
          <TextInput label="Email Address" value={form.email} onChange={setF("email")} placeholder="you@example.com" />
          <TextInput label="Password" type="password" value={form.password} onChange={setF("password")} placeholder="At least 6 characters" />
          <TextInput label="Confirm Password" type="password" value={form.confirmPassword} onChange={setF("confirmPassword")} placeholder="Re-enter password" />
          {form.confirmPassword && form.password !== form.confirmPassword && (
            <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>Passwords don't match</p>
          )}
          {signUpError && (
            <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>{signUpError}</p>
          )}
          <div className="mt-6">
            <PrimaryButton disabled={!canSubmitAccount || signUpLoading} onClick={handleSignUp}>
              {signUpLoading ? "Creating account…" : "Continue"}
            </PrimaryButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: email verification ----------
  if (screen === "verify") {
    return (
      <Shell>
        <button onClick={() => setScreen("register")} className="font-mono text-xs mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          ← back
        </button>
        <ProgressDots step={1} total={4} />
        <div className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 2 of 4</div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Verify your email</h2>
        </div>
        <div className="slide-up rounded-2xl p-5 text-center" style={{ background: "#FFFFFF", boxShadow: "0 2px 10px rgba(10,25,48,0.10)" }}>
          <p className="font-sans text-sm mb-6" style={{ color: TOKENS.ink, opacity: 0.8 }}>
            We've sent a confirmation link to <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{form.email || "your email"}</span>.
            Open your inbox and tap the link, then come back here and continue.
          </p>
          <PrimaryButton onClick={async () => {
            const { data } = await supabase.auth.getSession();
            if (!data.session) {
              // clicking the emailed link may have confirmed the account without logging in this tab
              await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
            }
            setScreen("role");
          }}>
            I've Confirmed — Continue
          </PrimaryButton>
          <GhostButton onClick={handleSignUp}>Resend confirmation email</GhostButton>
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: role selection ----------
  if (screen === "role") {
    return (
      <Shell>
        <button onClick={() => setScreen("verify")} className="font-mono text-xs mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          ← back
        </button>
        <ProgressDots step={2} total={4} />
        <div className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 3 of 4</div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>What's your role?</h2>
          <p className="font-sans text-sm mt-2" style={{ color: TOKENS.ink, opacity: 0.75 }}>This decides what BONIK sets up for you next.</p>
        </div>
        <div className="space-y-2.5 slide-up">
          {ROLES.map((r) => (
            <button
              key={r.id}
              onClick={() => setRole(r.id)}
              className="w-full text-left px-4 py-3.5 rounded-2xl border-2 transition-all"
              style={{
                borderColor: role === r.id ? TOKENS.saffron : TOKENS.line,
                background: role === r.id ? TOKENS.paperDeep : "#FFFFFF",
              }}
            >
              <div className="font-display font-semibold text-[15px]" style={{ color: TOKENS.inkDeep }}>{r.title}</div>
              <div className="font-mono text-xs mt-0.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>{r.note}</div>
            </button>
          ))}
        </div>
        <div className="mt-8">
          <PrimaryButton
            disabled={!role}
            onClick={() => setScreen(role === "owner" ? "bizProfile" : "pendingApproval")}
          >
            Continue
          </PrimaryButton>
        </div>
      </Shell>
    );
  }

  // ---------- Non-owner roles: request goes to owner/manager for approval ----------
  if (screen === "pendingApproval") {
    // Already have a pending request (roleGate found one on a return visit) — just show status.
    if (pendingRequest) {
      return (
        <Shell>
          <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
            <StampBadge label={"REQUEST SENT"} />
            <h2 className="font-display font-semibold text-xl mt-2" style={{ color: TOKENS.inkDeep }}>Waiting for approval</h2>
            <p className="font-sans text-sm mt-3 max-w-[280px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>
              Your request to join <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{pendingRequest.business?.name}</span> is waiting for the owner or manager to approve it.
            </p>
          </div>
        </Shell>
      );
    }

    const searchBusinesses = async (q) => {
      setBizQuery(q);
      setPickedBiz(null);
      if (q.trim().length < 2) { setBizResults([]); return; }
      setBizSearching(true);
      const { data } = await supabase.from("businesses").select("id, name, category, address").ilike("name", `%${q.trim()}%`).limit(10);
      setBizResults(data || []);
      setBizSearching(false);
    };

    const sendRequest = async () => {
      if (!pickedBiz || !role || sending) return;
      setSending(true);
      setSendError("");
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData?.user?.id;
      if (!uid) { setSendError("Please log in again."); setSending(false); return; }
      const { data: req, error } = await supabase.from("join_requests").insert({ business_id: pickedBiz.id, user_id: uid, requested_role: role }).select("*, business:businesses(name)").single();
      setSending(false);
      if (error) { setSendError(error.message); return; }
      setPendingRequest(req);
    };

    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
          <StampBadge label={"REQUEST SENT"} />
          <h2 className="font-display font-semibold text-xl mt-2" style={{ color: TOKENS.inkDeep }}>
            Waiting for approval
          </h2>
          <p className="font-sans text-sm mt-3 max-w-[280px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            Search the business by name below, then send your join request. You'll get access as soon as they approve it — no codes or QR needed.
          </p>
          <Stitch className="my-8 max-w-[200px]" />
          <div className="w-full text-left">
            <TextInput label="Search Business by Name" value={bizQuery} onChange={(e) => searchBusinesses(e.target.value)} placeholder="Type business name…" />
            {bizSearching && <p className="font-mono text-xs mb-3" style={{ color: TOKENS.ink, opacity: 0.6 }}>Searching…</p>}
            {bizResults.length > 0 && !pickedBiz && (
              <div className="space-y-2 mb-4">
                {bizResults.map((b) => (
                  <button key={b.id} onClick={() => { setPickedBiz(b); setBizResults([]); setBizQuery(b.name); }} className="w-full text-left px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                    <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{b.name}</div>
                    <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{b.category}{b.address ? ` · ${b.address}` : ""}</div>
                  </button>
                ))}
              </div>
            )}
            {sendError && <p className="font-mono text-xs mb-3" style={{ color: TOKENS.due }}>{sendError}</p>}
            <PrimaryButton disabled={!pickedBiz || sending} onClick={sendRequest}>{sending ? "Sending…" : "Send Join Request"}</PrimaryButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: business profile ----------
  if (screen === "bizProfile") {
    return (
      <Shell>
        <button onClick={() => setScreen("role")} className="font-mono text-xs mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>
          ← back
        </button>
        <ProgressDots step={3} total={4} />
        <div className="mb-6">
          <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 4 of 4</div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Set up your business</h2>
        </div>
        <div className="slide-up">
          <TextInput label="Business Name" value={biz.name} onChange={setB("name")} placeholder="Sharma General Store" />

          <div className="mb-4">
            <FieldLabel>Business Category</FieldLabel>
            <div className="flex flex-wrap gap-2 mt-1">
              {CATEGORIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setBiz((p) => ({ ...p, category: c }))}
                  className="px-3 py-1.5 rounded-full font-mono text-xs border-2 transition-all"
                  style={{
                    borderColor: biz.category === c ? TOKENS.saffron : TOKENS.line,
                    background: biz.category === c ? TOKENS.paperDeep : "#FFFFFF",
                    color: TOKENS.inkDeep,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <TextInput label="Owner Name" value={biz.ownerName} onChange={setB("ownerName")} placeholder="Full name" />
          <TextInput label="Mobile Number" value={biz.mobile} onChange={setB("mobile")} placeholder="98xxxxxxxx" />
          <TextInput label="Business Address" value={biz.address} onChange={setB("address")} placeholder="Shop no, street, city" />
          <TextInput label="GST Number (Optional)" value={biz.gst} onChange={setB("gst")} placeholder="22AAAAA0000A1Z5" />

          <div className="mb-6">
            <FieldLabel>Shop Photo (Optional)</FieldLabel>
            <button
              className="w-full py-4 rounded-2xl border-2 border-dashed font-mono text-xs"
              style={{ borderColor: TOKENS.line, color: TOKENS.ink, opacity: 0.72 }}
            >
              Tap to take or upload a shop photo — this doubles as your business logo
            </button>
          </div>

          {bizError && (
            <p className="font-mono text-xs mb-4" style={{ color: TOKENS.due }}>{bizError}</p>
          )}
          <PrimaryButton disabled={!canSubmitBiz || bizLoading} onClick={handleCreateBusiness}>
            {bizLoading ? "Creating…" : "Create Business"}
          </PrimaryButton>
        </div>
      </Shell>
    );
  }

  // ---------- Success ----------
  if (screen === "success") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-[85vh] text-center">
          <StampBadge label={"BUSINESS LIVE"} />
          <h2 className="font-display font-semibold text-2xl mt-2" style={{ color: TOKENS.inkDeep }}>
            {biz.name || "Your business"} is ready
          </h2>
          <p className="font-sans text-sm mt-3 max-w-[280px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            BONIK has already set up your Customer, Supplier, Staff and Company ledgers, Inventory and Billing books — nothing more to configure by hand.
          </p>
          <Stitch className="my-8 max-w-[200px]" />
          <div className="w-full">
            <PrimaryButton onClick={() => setScreen("roleGate")}>Go to Home Screen</PrimaryButton>
          </div>
        </div>
      </Shell>
    );
  }

  return null;
}
