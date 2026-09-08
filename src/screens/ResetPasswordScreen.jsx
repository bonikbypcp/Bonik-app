import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabaseClient";

/*
  BONIK by PCP — Reset Password screen
  This is what the link in Supabase's "reset password" email actually
  points at (BonikAuthFlow's "Forgot password?" step calls
  supabase.auth.resetPasswordForEmail with redirectTo set to this route —
  see BonikAuthFlow.jsx). It has to live at its own route, separate from
  /auth, because that's the URL Supabase redirects the user back to.

  supabase-js reads the recovery tokens out of the URL itself on load
  (detectSessionInUrl defaults to true in supabaseClient.js) and turns
  them into a short-lived "recovery" session, firing a PASSWORD_RECOVERY
  auth event — this screen just waits for that (or for a session to
  already be there by the time it mounts) before showing the new-password
  form, and calls supabase.auth.updateUser({ password }) to actually set
  it once submitted.

  Same "Digital Ledger" visual language as BonikAuthFlow, kept in this
  file rather than shared, matching how every other screen in this app
  already carries its own copy of these tokens/components.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
  pageBg: "#AFC0DD",
};
const CARD_STYLE = {
  background: "#FFFFFF",
  boxShadow: "0 18px 40px rgba(10,25,48,0.28), 0 2px 8px rgba(10,25,48,0.12)",
  border: "1px solid rgba(10,25,48,0.06)",
};

function Wordmark({ size = "text-2xl" }) {
  return (
    <div className={`font-display ${size} tracking-tight`} style={{ color: TOKENS.ink }}>
      <span className="font-bold">BONIK</span>
      <span className="font-normal lowercase" style={{ color: TOKENS.saffronDeep }}> by pcp</span>
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

function Shell({ children }) {
  return (
    <div className="min-h-screen w-full flex items-start justify-center font-sans" style={{ background: TOKENS.pageBg }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .font-display { font-family: 'Space Grotesk', sans-serif; }
        .font-sans { font-family: 'Inter', sans-serif; }
        .font-mono { font-family: 'IBM Plex Mono', monospace; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen px-4 pt-6 pb-8 relative">{children}</div>
    </div>
  );
}

export default function ResetPasswordScreen() {
  const navigate = useNavigate();

  // "checking" -> waiting to see whether the link actually carried a
  // valid recovery session. "ready" -> it did, show the new-password
  // form. "invalid" -> it didn't (expired link, already used, or someone
  // just landed on this URL directly) -> nothing to do here but send them
  // back to request a fresh one.
  const [status, setStatus] = useState("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;

    // Covers the common case: by the time this effect runs, supabase-js
    // has already parsed the URL and established the recovery session.
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setStatus("ready");
    });

    // Covers the case where that parsing finishes a tick after mount —
    // this event fires the moment supabase-js processes the recovery
    // tokens from the URL.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) setStatus("ready");
    });

    // Neither of the above panned out within a few seconds -> there's no
    // recovery token to consume (bad/expired/reused link, or a direct
    // visit to this URL), so stop waiting and show the "invalid" state.
    const timeout = setTimeout(() => {
      if (mounted) setStatus((s) => (s === "checking" ? "invalid" : s));
    }, 4000);

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  const canSubmit = password.length >= 6 && password === confirmPassword;

  const handleSubmit = async () => {
    if (!canSubmit || saving) return;
    setError("");
    setSaving(true);
    const { error: updateErr } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (updateErr) {
      setError(updateErr.message);
      return;
    }
    setDone(true);
  };

  return (
    <Shell>
      <div className="flex flex-col justify-center min-h-[85vh]">
        <div className="flex flex-col items-center text-center mb-6">
          <Wordmark size="text-3xl" />
        </div>

        <div className="slide-up rounded-2xl px-5 py-6" style={CARD_STYLE}>
          {status === "checking" && (
            <p className="font-mono text-xs text-center py-4" style={{ color: TOKENS.ink, opacity: 0.72 }}>
              Checking your reset link…
            </p>
          )}

          {status === "invalid" && (
            <>
              <p className="font-sans text-sm mb-6 text-center" style={{ color: TOKENS.ink, opacity: 0.8 }}>
                This reset link is invalid or has expired. Go back and request a new one from the login screen.
              </p>
              <PrimaryButton onClick={() => navigate("/auth")}>Back to Log In</PrimaryButton>
            </>
          )}

          {status === "ready" && !done && (
            <>
              <h2 className="font-display font-semibold text-xl mb-4" style={{ color: TOKENS.inkDeep }}>
                Set a new password
              </h2>
              <TextInput
                label="New Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
              />
              <TextInput
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
              />
              {confirmPassword && password !== confirmPassword && (
                <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>Passwords don't match</p>
              )}
              {error && (
                <p className="font-mono text-xs -mt-2 mb-4" style={{ color: TOKENS.due }}>{error}</p>
              )}
              <PrimaryButton onClick={handleSubmit} disabled={!canSubmit || saving}>
                {saving ? "Saving…" : "Set New Password"}
              </PrimaryButton>
            </>
          )}

          {status === "ready" && done && (
            <>
              <p className="font-sans text-sm mb-6 text-center" style={{ color: TOKENS.ink, opacity: 0.8 }}>
                Your password has been updated.
              </p>
              <PrimaryButton onClick={() => navigate("/auth")}>Continue to Log In</PrimaryButton>
            </>
          )}
        </div>
      </div>
    </Shell>
  );
}
