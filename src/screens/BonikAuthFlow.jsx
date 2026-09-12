import React, { useState, useRef, useEffect, useCallback } from "react";
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
  // A separate, noticeably richer/darker shade for this flow's own page
  // background — TOKENS.paper (used elsewhere, e.g. as button text color)
  // was too close in tone to white, so the white form cards read as
  // duller than the page instead of popping forward from it.
  pageBg: "#AFC0DD",
};
// Shared "the form card" treatment for every data-entry step (login,
// register, verify, business profile) — a strong shadow plus a hairline
// border so the white card clearly separates from pageBg instead of just
// blending into it.
const CARD_STYLE = {
  background: "#FFFFFF",
  boxShadow: "0 18px 40px rgba(10,25,48,0.28), 0 2px 8px rgba(10,25,48,0.12)",
  border: "1px solid rgba(10,25,48,0.06)",
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
        className="w-full border-0 border-b-2 rounded-t-lg px-3 pt-3 pb-3 text-[16px] font-sans outline-none transition-colors focus:border-current"
        style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}
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
      className="w-full py-4 rounded-2xl font-display font-semibold text-[16px] tracking-wide transition-all active:scale-[0.98] disabled:opacity-40"
      style={{ background: TOKENS.ink, color: TOKENS.paper }}
    >
      {children}
    </button>
  );
}

function BackButton({ onClick, className = "" }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full font-mono text-xs border transition-all active:scale-[0.98] ${className}`}
      style={{ color: TOKENS.ink, background: "#FFFFFF", borderColor: TOKENS.line }}
    >
      ← Back
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
      style={{ background: TOKENS.pageBg }}
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
      <div className="w-full max-w-[420px] min-h-screen px-4 pt-6 pb-8 relative">
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

  // Internal back-navigation. Each step the user takes claims one browser
  // history entry via pushState, with the SCREEN NAME ITSELF written into
  // that entry's state — not into a separately-kept in-memory stack. That
  // used to be the bug here: a parallel `screenStackRef` array tracked
  // "how many steps deep are we", but that array lives only in this
  // component's memory, while the browser's real history entries persist
  // independently of it. Any reload, backgrounded-tab reload (routine on
  // mobile), or remount reset the in-memory stack back to depth 1 while
  // the browser still had several real entries left over from before —
  // so the first few back presses matched nothing in the (now-empty)
  // stack, changed nothing on screen, and silently burned through those
  // leftover entries anyway, until they ran out and the browser exited
  // outright after 2-3 presses. Reading the screen name straight out of
  // `event.state` on each popstate removes the parallel structure
  // entirely — window.history.state is the browser's own durably-kept
  // record of each entry, so there's nothing left that can drift out of
  // sync with it.
  //
  // "roleGate" is deliberately never pushed as its own entry (it's a
  // transient auto-redirect, not a step the user consciously took), so
  // back-ing out of whatever it resolves to correctly lands on the step
  // before it (e.g. "login"), not on a loading spinner.
  const pushScreen = useCallback((next) => {
    window.history.pushState({ bonikAuthScreen: next }, "");
    setScreen(next);
  }, []);

  const goBack = useCallback(() => {
    // Goes through the exact same code path as the physical/device back
    // button — this just calls history.back(); the popstate listener
    // below is the single place that actually changes `screen`.
    window.history.back();
  }, []);

  useEffect(() => {
    // Tag the entry we land on at mount as "landing", so popping back to
    // it (by device button or in-app Back) resolves correctly even if
    // this component has just remounted (e.g. after a reload) with no
    // memory of anything that came before.
    window.history.replaceState({ bonikAuthScreen: "landing" }, "");

    const onPopState = (event) => {
      const next = event.state?.bonikAuthScreen;
      if (next) {
        setScreen(next);
      }
      // No bonikAuthScreen on the entry we've landed on means we've gone
      // past the start of this flow (or this entry predates it) — nothing
      // of ours to restore, so this and any further back presses behave
      // normally, which is what lets a back press genuinely exit once the
      // user is on the very first step. This is also what makes the
      // interception end once the flow is complete: navigating to /home
      // unmounts this component, and the cleanup below removes this
      // listener, so browser back works normally again from then on.
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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

  // ---- Forgot password: request code -> verify code -> set new password ----
  // Password reset uses a 6-digit OTP end to end now, not the magic link
  // Supabase's default email also carries — a link has to redirect back
  // to whatever origin the app is running on (production, a preview
  // deploy, localhost), each needing its own entry in Supabase's
  // redirect-URL allow-list, and any mismatch there fails in a way this
  // app can't even detect, let alone explain to the user. An OTP has no
  // redirect URL involved at all: resetPasswordForEmail no longer passes
  // a redirectTo, and the whole flow from here stays inside /auth.
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState("");

  const handleForgotPassword = async () => {
    if (!forgotEmail || forgotLoading) return;
    setForgotError("");
    setForgotLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail);
    setForgotLoading(false);
    if (error) {
      setForgotError(error.message);
      return;
    }
    setResetOtp(["", "", "", "", "", ""]);
    setResetOtpError("");
    setResetResendMessage("");
    pushScreen("forgotOtp");
  };

  const [resetOtp, setResetOtp] = useState(["", "", "", "", "", ""]);
  const resetOtpRefs = useRef([]);
  const [resetOtpChecking, setResetOtpChecking] = useState(false);
  const [resetOtpError, setResetOtpError] = useState("");
  const [resetResendLoading, setResetResendLoading] = useState(false);
  const [resetResendMessage, setResetResendMessage] = useState("");

  // Kept separate from the sign-up flow's own otp/otpRefs (even though
  // the box-handling logic is identical) so a leftover digit from one
  // flow can never bleed into the other if someone backs out of one and
  // into the other in the same session.
  const handleResetOtpChange = (i, val) => {
    const digits = val.replace(/\D/g, "");
    if (!digits) {
      if (val === "") {
        const next = [...resetOtp];
        next[i] = "";
        setResetOtp(next);
      }
      return;
    }
    const next = [...resetOtp];
    let cursor = i;
    for (const d of digits) {
      if (cursor > 5) break;
      next[cursor] = d;
      cursor++;
    }
    setResetOtp(next);
    resetOtpRefs.current[Math.min(cursor, 5)]?.focus();
  };

  const handleResetOtpBackspace = (i, e) => {
    if (e.key === "Backspace" && !resetOtp[i] && i > 0) {
      resetOtpRefs.current[i - 1]?.focus();
    }
  };

  // verifyOtp with type "recovery" both confirms the code AND signs this
  // tab in as that user (a real, if short-lived, session) — that's what
  // authorizes the updateUser({ password }) call on the next screen.
  const handleVerifyResetOtp = async () => {
    const token = resetOtp.join("");
    if (token.length !== 6 || resetOtpChecking) return;
    setResetOtpError("");
    setResetOtpChecking(true);
    const { error } = await supabase.auth.verifyOtp({
      email: forgotEmail,
      token,
      type: "recovery",
    });
    setResetOtpChecking(false);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      setResetOtpError(
        msg.includes("expired")
          ? "This code has expired — request a new one below."
          : msg.includes("invalid") || msg.includes("token")
          ? "That code doesn't match. Check the 6 digits and try again."
          : error.message
      );
      setResetOtp(["", "", "", "", "", ""]);
      resetOtpRefs.current[0]?.focus();
      return;
    }
    setNewPassword("");
    setConfirmNewPassword("");
    setNewPasswordError("");
    setNewPasswordDone(false);
    pushScreen("newPassword");
  };

  // Recovery has no dedicated resend() type the way signup does — sending
  // another code is just calling resetPasswordForEmail again.
  const handleResendResetOtp = async () => {
    if (resetResendLoading) return;
    setResetOtpError("");
    setResetResendMessage("");
    setResetResendLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(forgotEmail);
    setResetResendLoading(false);
    if (error) {
      setResetOtpError(error.message);
      return;
    }
    setResetOtp(["", "", "", "", "", ""]);
    resetOtpRefs.current[0]?.focus();
    setResetResendMessage("A new code has been sent.");
  };

  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [newPasswordSaving, setNewPasswordSaving] = useState(false);
  const [newPasswordError, setNewPasswordError] = useState("");
  const [newPasswordDone, setNewPasswordDone] = useState(false);

  const canSubmitNewPassword = newPassword.length >= 6 && newPassword === confirmNewPassword;

  const handleSetNewPassword = async () => {
    if (!canSubmitNewPassword || newPasswordSaving) return;
    setNewPasswordError("");
    setNewPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setNewPasswordSaving(false);
    if (error) {
      setNewPasswordError(error.message);
      return;
    }
    setNewPasswordDone(true);
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
      if (req) { setPendingRequest(req); pushScreen("pendingApproval"); return; }

      setRoleGateChecking(false); // no membership, no pending request — fall through to role selection below
    })();
    return () => { cancelled = true; };
  }, [screen, navigate, pushScreen]);

  // Once the roleGate check above finishes with no redirect (no existing
  // membership, no pending request), move on to role selection. This has to
  // be declared here, unconditionally with every other hook, and NOT after
  // the "landing"/"login" screens' early `return`s below — a hook called on
  // some renders (roleGate/register/verify/role/...) but skipped on others
  // (landing/login) is a Rules-of-Hooks violation: React tracks hooks by
  // call order, so a component whose hook count changes between renders
  // corrupts that tracking and can crash the whole tree with no useful
  // error, which is exactly what was happening here.
  useEffect(() => {
    if (screen === "roleGate" && !roleGateChecking) pushScreen("role");
  }, [screen, roleGateChecking, pushScreen]);

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
    // Handles pasting the whole 6-digit code at once (a very normal way
    // to get it out of an email) as well as typing one digit at a time.
    const digits = val.replace(/\D/g, "");
    if (!digits) {
      if (val === "") {
        const next = [...otp];
        next[i] = "";
        setOtp(next);
      }
      return;
    }
    const next = [...otp];
    let cursor = i;
    for (const d of digits) {
      if (cursor > 5) break;
      next[cursor] = d;
      cursor++;
    }
    setOtp(next);
    otpRefs.current[Math.min(cursor, 5)]?.focus();
  };

  const handleOtpBackspace = (i, e) => {
    if (e.key === "Backspace" && !otp[i] && i > 0) {
      otpRefs.current[i - 1]?.focus();
    }
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
    // Clear state left over from any earlier attempt (a previous email's
    // typed-in digits, or an error from a previous wrong code) so the OTP
    // step always starts from a clean slate for this signup.
    setOtp(["", "", "", "", "", ""]);
    setVerifyError("");
    setResendMessage("");
    pushScreen("verify");
  };

  const [verifyChecking, setVerifyChecking] = useState(false);
  const [verifyError, setVerifyError] = useState("");
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  // Signup verification uses the 6-digit OTP from the "Confirm signup"
  // email (see the OTP boxes below), not the magic link Supabase also
  // puts in that same email — a link has to redirect back to whatever
  // origin the app happens to be running on (production, a preview
  // deploy, localhost, each with its own URL that has to be individually
  // allow-listed in Supabase's Auth settings or the click just fails),
  // while an OTP is just a code the user types in here, so there's no
  // redirect URL to get wrong. verifyOtp with type "signup" both confirms
  // the account AND signs this tab in on success (it returns a real
  // session, same as signInWithPassword would) — no separate
  // getSession()/signInWithPassword fallback dance needed the way the
  // link-based flow required.
  const handleVerifyOtp = async () => {
    const token = otp.join("");
    if (token.length !== 6 || verifyChecking) return;
    setVerifyError("");
    setVerifyChecking(true);
    const { error } = await supabase.auth.verifyOtp({
      email: form.email,
      token,
      type: "signup",
    });
    setVerifyChecking(false);
    if (error) {
      const msg = error.message?.toLowerCase() || "";
      setVerifyError(
        msg.includes("expired")
          ? "This code has expired — request a new one below."
          : msg.includes("invalid") || msg.includes("token")
          ? "That code doesn't match. Check the 6 digits and try again."
          : error.message
      );
      // Wrong code entered — clear the boxes so they're not stuck staring
      // at digits they already know are wrong, and put focus back at the start.
      setOtp(["", "", "", "", "", ""]);
      otpRefs.current[0]?.focus();
      return;
    }
    pushScreen("role");
  };

  const handleResendOtp = async () => {
    if (resendLoading) return;
    setVerifyError("");
    setResendMessage("");
    setResendLoading(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: form.email });
    setResendLoading(false);
    if (error) {
      setVerifyError(error.message);
      return;
    }
    setOtp(["", "", "", "", "", ""]);
    otpRefs.current[0]?.focus();
    setResendMessage("A new code has been sent.");
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

    // Any unexpected throw here (a network failure, a malformed response)
    // must land in bizError, not escape as an unhandled rejection — that
    // would leave the button stuck on "Creating…" with no feedback and,
    // combined with an event-handler throw being invisible to a render-only
    // ErrorBoundary, look exactly like nothing happened.
    try {
      // getSession() reads the locally persisted session first and
      // transparently refreshes it if the access token is near expiry —
      // that's the common, fast path for "just went through steps 1-3
      // seconds ago". getUser() below (a real network round-trip to
      // revalidate against the auth server) is only a fallback for the
      // rarer case where getSession() has nothing local to work with;
      // relying on getUser() alone as the sole check meant one transient
      // network hiccup was enough to falsely declare the session expired.
      let uid = (await supabase.auth.getSession()).data.session?.user?.id;
      if (!uid) {
        const { data: userData } = await supabase.auth.getUser();
        uid = userData?.user?.id;
      }
      if (!uid) {
        setBizError("Your session expired — please log in again.");
        return;
      }

      // .select() here reads the row straight back, which requires the
      // businesses SELECT policy to already allow this user to see it —
      // see rls.sql: "user can create own business" covers the insert
      // itself, but the row was still invisible immediately afterward until
      // "member can view own business" was extended to also allow
      // owner_user_id = auth.uid(), not just an existing membership.
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
        return;
      }

      // This insert's RLS check also reads businesses (to confirm this user
      // owns business_id) — the same policy fix above is what lets this
      // succeed, since it's the very first business_members row for this
      // business and can't rely on my_business_ids() the way later queries do.
      const { error: memberInsertError } = await supabase.from("business_members").insert({
        business_id: newBiz.id,
        user_id: uid,
        role: "owner",
        status: "active",
      });

      if (memberInsertError) {
        setBizError(memberInsertError.message);
        return;
      }

      // SessionProvider loaded (no) membership once, at login — it has no
      // way to know a business_members row now exists unless told, and
      // every protected route reads businessId straight from it.
      await refreshMember();
      pushScreen("success");
    } catch (err) {
      setBizError(err?.message || "Something went wrong creating the business. Please try again.");
    } finally {
      setBizLoading(false);
    }
  };

  // ---------- LANDING ----------
  if (screen === "landing") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col min-h-[80vh]">
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
            <PrimaryButton onClick={() => { setMode("login"); pushScreen("login"); }}>
              Log In
            </PrimaryButton>
            <button
              onClick={() => { setMode("register"); pushScreen("register"); }}
              className="w-full py-4 rounded-2xl font-display font-semibold text-[16px] tracking-wide border-2 transition-all active:scale-[0.98]"
              style={{ borderColor: TOKENS.ink, color: TOKENS.ink, background: "#FFFFFF" }}
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
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[78vh]">
          <Wordmark />
          <p className="font-sans text-sm mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            Welcome back. Log in to your ledger.
          </p>
          <div
            className="slide-up rounded-2xl px-5 py-6"
            style={CARD_STYLE}
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
              <button
                type="button"
                onClick={() => { setForgotEmail(loginForm.email); setForgotError(""); pushScreen("forgotPassword"); }}
                className="font-mono text-xs underline"
                style={{ color: TOKENS.saffronDeep }}
              >
                Forgot password?
              </button>
            </div>
            <PrimaryButton onClick={handleLogin} disabled={loginLoading || !loginForm.email || !loginForm.password}>
              {loginLoading ? "Logging in…" : "Log In"}
            </PrimaryButton>
            <GhostButton onClick={() => { setMode("register"); pushScreen("register"); }}>
              New here? Create a business →
            </GhostButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- FORGOT PASSWORD ----------
  if (screen === "forgotPassword") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[78vh]">
          <Wordmark />
          <p className="font-sans text-sm mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            Enter your account email and we'll send you a 6-digit code to reset your password.
          </p>
          <div className="slide-up rounded-2xl px-5 py-6" style={CARD_STYLE}>
            <TextInput
              label="Email"
              type="email"
              value={forgotEmail}
              onChange={(e) => setForgotEmail(e.target.value)}
              placeholder="you@example.com"
            />
            {forgotError && (
              <div className="mb-4 -mt-1 font-mono text-xs" style={{ color: TOKENS.due }}>
                {forgotError}
              </div>
            )}
            <PrimaryButton onClick={handleForgotPassword} disabled={forgotLoading || !forgotEmail}>
              {forgotLoading ? "Sending…" : "Send Reset Code"}
            </PrimaryButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- FORGOT PASSWORD: enter the OTP ----------
  if (screen === "forgotOtp") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[72vh]">
          <Wordmark />
          <p className="font-sans text-sm mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            Enter the code to continue.
          </p>
          <div className="slide-up rounded-2xl px-5 py-6 text-center" style={CARD_STYLE}>
            <p className="font-sans text-sm mb-6" style={{ color: TOKENS.ink, opacity: 0.8 }}>
              We've sent a 6-digit code to <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{forgotEmail}</span>.
            </p>

            <div className="flex gap-2 justify-center mb-5">
              {resetOtp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (resetOtpRefs.current[i] = el)}
                  value={digit}
                  onChange={(e) => handleResetOtpChange(i, e.target.value)}
                  onKeyDown={(e) => handleResetOtpBackspace(i, e)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-11 h-14 text-center rounded-xl border-2 text-xl font-mono outline-none transition-colors focus:border-current"
                  style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}
                  onFocus={(e) => (e.target.style.borderColor = TOKENS.saffron)}
                  onBlur={(e) => (e.target.style.borderColor = TOKENS.line)}
                />
              ))}
            </div>

            {resetOtpError && (
              <p className="font-mono text-xs mb-4" style={{ color: TOKENS.due }}>{resetOtpError}</p>
            )}
            {resetResendMessage && !resetOtpError && (
              <p className="font-mono text-xs mb-4" style={{ color: TOKENS.stamp }}>{resetResendMessage}</p>
            )}

            <PrimaryButton onClick={handleVerifyResetOtp} disabled={resetOtpChecking || resetOtp.join("").length !== 6}>
              {resetOtpChecking ? "Verifying…" : "Verify Code"}
            </PrimaryButton>
            <GhostButton onClick={handleResendResetOtp}>
              {resetResendLoading ? "Sending…" : "Resend code"}
            </GhostButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- FORGOT PASSWORD: set a new password ----------
  if (screen === "newPassword") {
    return (
      <Shell>
        {!newPasswordDone && <BackButton onClick={goBack} className="mb-6" />}
        <div className="flex flex-col justify-center min-h-[78vh]">
          <Wordmark />
          <p className="font-sans text-sm mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.75 }}>
            {newPasswordDone ? "All set." : "Choose a new password for your account."}
          </p>
          <div className="slide-up rounded-2xl px-5 py-6" style={CARD_STYLE}>
            {newPasswordDone ? (
              <>
                <p className="font-sans text-sm mb-6" style={{ color: TOKENS.ink, opacity: 0.8 }}>
                  Your password has been updated.
                </p>
                <PrimaryButton onClick={() => setScreen("roleGate")}>Continue</PrimaryButton>
              </>
            ) : (
              <>
                <TextInput
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 6 characters"
                />
                <TextInput
                  label="Confirm Password"
                  type="password"
                  value={confirmNewPassword}
                  onChange={(e) => setConfirmNewPassword(e.target.value)}
                  placeholder="Re-enter password"
                />
                {confirmNewPassword && newPassword !== confirmNewPassword && (
                  <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>Passwords don't match</p>
                )}
                {newPasswordError && (
                  <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>{newPasswordError}</p>
                )}
                <PrimaryButton onClick={handleSetNewPassword} disabled={!canSubmitNewPassword || newPasswordSaving}>
                  {newPasswordSaving ? "Saving…" : "Set New Password"}
                </PrimaryButton>
              </>
            )}
          </div>
        </div>
      </Shell>
    );
  }

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
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[72vh]">
          <ProgressDots step={0} total={4} />
          <div className="mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 1 of 4</div>
            <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Create your account</h2>
          </div>
          <div className="slide-up rounded-2xl px-5 py-6" style={CARD_STYLE}>
            <TextInput label="Full Name" value={form.fullName} onChange={setF("fullName")} placeholder="Ananya Sharma" autoCapitalize="words" />
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
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: email verification ----------
  if (screen === "verify") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[72vh]">
          <ProgressDots step={1} total={4} />
          <div className="mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 2 of 4</div>
            <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Verify your email</h2>
          </div>
          <div className="slide-up rounded-2xl px-5 py-6 text-center" style={CARD_STYLE}>
            <p className="font-sans text-sm mb-6" style={{ color: TOKENS.ink, opacity: 0.8 }}>
              We've sent a 6-digit code to <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{form.email || "your email"}</span>.
              Enter it below to verify your account.
            </p>

            <div className="flex gap-2 justify-center mb-5">
              {otp.map((digit, i) => (
                <input
                  key={i}
                  ref={(el) => (otpRefs.current[i] = el)}
                  value={digit}
                  onChange={(e) => handleOtp(i, e.target.value)}
                  onKeyDown={(e) => handleOtpBackspace(i, e)}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  className="w-11 h-14 text-center rounded-xl border-2 text-xl font-mono outline-none transition-colors focus:border-current"
                  style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }}
                  onFocus={(e) => (e.target.style.borderColor = TOKENS.saffron)}
                  onBlur={(e) => (e.target.style.borderColor = TOKENS.line)}
                />
              ))}
            </div>

            {verifyError && (
              <p className="font-mono text-xs mb-4" style={{ color: TOKENS.due }}>{verifyError}</p>
            )}
            {resendMessage && !verifyError && (
              <p className="font-mono text-xs mb-4" style={{ color: TOKENS.stamp }}>{resendMessage}</p>
            )}

            <PrimaryButton onClick={handleVerifyOtp} disabled={verifyChecking || otp.join("").length !== 6}>
              {verifyChecking ? "Verifying…" : "Verify Code"}
            </PrimaryButton>
            <GhostButton onClick={handleResendOtp}>
              {resendLoading ? "Sending…" : "Resend code"}
            </GhostButton>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- REGISTER: role selection ----------
  if (screen === "role") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[72vh]">
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
                className="w-full text-left px-4 py-4 rounded-2xl border-2 transition-all"
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
              onClick={() => pushScreen(role === "owner" ? "bizProfile" : "pendingApproval")}
            >
              Continue
            </PrimaryButton>
          </div>
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
          <BackButton onClick={goBack} className="mb-6" />
          <div className="flex flex-col items-center justify-center min-h-[75vh] text-center">
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
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col items-center justify-center min-h-[75vh] text-center">
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
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col justify-center min-h-[72vh]">
          <ProgressDots step={3} total={4} />
          <div className="mb-6">
            <div className="font-mono text-[11px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffronDeep }}>Step 4 of 4</div>
            <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>Set up your business</h2>
          </div>
          <div className="slide-up rounded-2xl px-5 py-6" style={CARD_STYLE}>
            <TextInput label="Business Name" value={biz.name} onChange={setB("name")} placeholder="Sharma General Store" autoCapitalize="words" />

            <div className="mb-4">
              <FieldLabel>Business Category</FieldLabel>
              <div className="flex flex-wrap gap-2 mt-1">
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setBiz((p) => ({ ...p, category: c }))}
                    className="px-3 py-2 rounded-full font-mono text-xs border-2 transition-all"
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

            <TextInput label="Owner Name" value={biz.ownerName} onChange={setB("ownerName")} placeholder="Full name" autoCapitalize="words" />
            <TextInput label="Mobile Number" value={biz.mobile} onChange={setB("mobile")} placeholder="98xxxxxxxx" />
            <TextInput label="Business Address" value={biz.address} onChange={setB("address")} placeholder="Shop no, street, city" autoCapitalize="words" />
            <TextInput label="GST Number (Optional)" value={biz.gst} onChange={setB("gst")} placeholder="22AAAAA0000A1Z5" />

            <div className="mb-6">
              <FieldLabel>Shop Photo (Optional)</FieldLabel>
              <button
                className="w-full py-4 rounded-2xl border-2 border-dashed font-mono text-xs"
                style={{ borderColor: TOKENS.line, color: TOKENS.ink, opacity: 0.72, background: "#FFFFFF" }}
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
        </div>
      </Shell>
    );
  }

  // ---------- Success ----------
  if (screen === "success") {
    return (
      <Shell>
        <BackButton onClick={goBack} className="mb-6" />
        <div className="flex flex-col items-center justify-center min-h-[75vh] text-center">
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
