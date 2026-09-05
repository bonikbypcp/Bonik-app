// BONIK by PCP — Session context
//
// Every screen needs to know: which user is logged in, which business
// they're currently inside, their role in that business, and their
// staff_code (used on bills, ledger entries, etc). This file is the
// single place that figures that out, so screens just call useSession()
// instead of each re-querying Supabase for the same thing.
//
// How "current business" is chosen for now: the first active
// business_members row for this user (most owners only have one
// business). Once multi-business switching is built, this becomes a
// stored preference instead of "just take the first one".

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "./supabaseClient";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [authUser, setAuthUser] = useState(undefined); // undefined = checking, null = logged out
  const [member, setMember] = useState(null);           // business_members row (+ business)
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadMember = useCallback(async (userId) => {
    if (!userId) {
      setMember(null);
      return;
    }
    // users.id (our app table) is the same uuid as auth.users.id — set that way at signup.
    const { data, error: memErr } = await supabase
      .from("business_members")
      .select("*, business:businesses(*, owner:users(full_name))")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("joined_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memErr) {
      setError(memErr.message);
      setMember(null);
      return;
    }
    setMember(data || null);
  }, []);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      const u = data.session?.user ?? null;
      setAuthUser(u);
      if (u) await loadMember(u.id);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const u = session?.user ?? null;
      setAuthUser(u);
      if (u) {
        await loadMember(u.id);
      } else {
        setMember(null);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadMember]);

  const refreshMember = useCallback(() => {
    if (authUser) return loadMember(authUser.id);
  }, [authUser, loadMember]);

  const value = {
    authUser,                         // supabase auth user object, or null
    isLoggedIn: !!authUser,
    member,                           // business_members row + nested business
    businessId: member?.business_id ?? null,
    business: member?.business ?? null,
    memberId: member?.id ?? null,
    role: member?.role ?? null,
    staffCode: member?.staff_code ?? null,
    loading,
    error,
    refreshMember,
  };

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession() must be used inside <SessionProvider>");
  return ctx;
}
