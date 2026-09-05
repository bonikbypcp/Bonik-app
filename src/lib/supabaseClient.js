// BONIK by PCP — Supabase connection
//
// This "anon" key is safe to ship in frontend code — Supabase designed it
// that way. Real protection comes from Row Level Security (RLS) policies
// on each table, which we still need to add (schema.sql created the
// tables but did not turn RLS on yet — that's the very next step).
//
// npm install @supabase/supabase-js

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://dcifigxehnwcjnrrkjib.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaWZpZ3hlaG53Y2pucnJramliIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNzMyODMsImV4cCI6MjEwMTY0OTI4M30.BR8Vv_Tj4SBMDWuTt7EXSbuXBjAoc9vjs-W1zVE5Eko";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------------------------------------------------------------------
// Example usage once wired into the Auth screens:
//
// Register:
//   const { data, error } = await supabase.auth.signUp({
//     email, password,
//     options: { data: { full_name: fullName, mobile_number: mobile } }
//   });
//
// Login:
//   const { data, error } = await supabase.auth.signInWithPassword({ email, password });
//
// Read a business's products (after login, RLS will restrict this to
// only that business's own rows once policies are in place):
//   const { data, error } = await supabase
//     .from("products")
//     .select("*")
//     .eq("business_id", currentBusinessId);
// ---------------------------------------------------------------------
