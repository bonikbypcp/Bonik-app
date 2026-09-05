// BONIK by PCP — App.jsx (main entry / routing)
//
// This ties every screen we've built into one real app using
// react-router-dom. Each screen already exists as its own component
// file — this file just wires them together and decides what shows at
// each URL.
//
// Install (if not already):
//   npm install react-router-dom @supabase/supabase-js lucide-react recharts
//
// Folder structure this assumes:
//   src/
//     App.jsx                 <- this file
//     lib/
//       supabaseClient.js
//       cloudinary.js
//     screens/
//       BonikAuthFlow.jsx      (Login, Register, Business Creation)
//       HomeScreen.jsx
//       BillingScreen.jsx
//       LedgerScreen.jsx
//       InventoryScreen.jsx
//       DailyProductScreen.jsx
//       DailyExpenseScreen.jsx
//       StaffScreen.jsx
//       OnlineShopScreen.jsx    (owner-side order/product/settings management)
//       Storefront.jsx          (public customer-facing shop)
//       SettingsScreen.jsx      (home-page Settings: table text size)
//       SystemSettings.jsx      (Subscription, Notifications, Security, Backup, Display, Printer)
//       OperatorAdmin.jsx       (platform-owner-only panel — not linked from anywhere a shop owner can reach)

import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { SessionProvider, useSession } from "./lib/session";

import BonikAuthFlow from "./screens/BonikAuthFlow";
import HomeScreen from "./screens/HomeScreen";
import BillingScreen from "./screens/BillingScreen";
import LedgerScreen from "./screens/LedgerScreen";
import InventoryScreen from "./screens/InventoryScreen";
import DailyProductScreen from "./screens/DailyProductScreen";
import DailyExpenseScreen from "./screens/DailyExpenseScreen";
import StaffScreen from "./screens/StaffScreen";
import OnlineShopScreen from "./screens/OnlineShopScreen";
import Storefront from "./screens/Storefront";
import SettingsScreen from "./screens/SettingsScreen";
import SystemSettings from "./screens/SystemSettings";
import OperatorAdmin from "./screens/OperatorAdmin";
import BillScanScreen from "./screens/BillScanScreen";

// Wraps every screen that needs a logged-in user AND an active business
// membership. Redirects to /auth if either is missing, so a screen never
// renders with businessId = null and silently shows empty data.
function ProtectedRoute({ children }) {
  const { loading, isLoggedIn, businessId } = useSession();
  if (loading) {
    return <div className="min-h-screen flex items-center justify-center font-sans text-sm" style={{ color: "#516072" }}>Loading…</div>;
  }
  if (!isLoggedIn || !businessId) {
    return <Navigate to="/auth" replace />;
  }
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      {/* Auth: login, register, and business creation all live inside this one flow */}
      <Route path="/" element={<Navigate to="/auth" replace />} />
      <Route path="/auth" element={<BonikAuthFlow />} />

      {/* Business Owner / Staff app — needs login + an active business membership */}
      <Route path="/home" element={<ProtectedRoute><HomeScreen /></ProtectedRoute>} />
      <Route path="/billing" element={<ProtectedRoute><BillingScreen /></ProtectedRoute>} />
      <Route path="/ledger" element={<ProtectedRoute><LedgerScreen /></ProtectedRoute>} />
      <Route path="/inventory" element={<ProtectedRoute><InventoryScreen /></ProtectedRoute>} />
      <Route path="/daily-product" element={<ProtectedRoute><DailyProductScreen /></ProtectedRoute>} />
      <Route path="/daily-expense" element={<ProtectedRoute><DailyExpenseScreen /></ProtectedRoute>} />
      <Route path="/staff" element={<ProtectedRoute><StaffScreen /></ProtectedRoute>} />
      <Route path="/online-shop" element={<ProtectedRoute><OnlineShopScreen /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><SettingsScreen /></ProtectedRoute>} />
      <Route path="/system-settings" element={<ProtectedRoute><SystemSettings /></ProtectedRoute>} />
      <Route path="/bill-scan" element={<ProtectedRoute><BillScanScreen /></ProtectedRoute>} />

      {/* Public — no login needed, this is what customers browse */}
      <Route path="/shop/:businessSlug" element={<Storefront />} />

      {/* Platform-owner only — never linked from any shop-owner screen.
          NOTE: this only checks login, not a business membership — a real
          check against a platform-admin flag still needs to be added here
          before this goes live, so it isn't reachable by a normal owner. */}
      <Route path="/operator-admin" element={<OperatorAdmin />} />
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <AppRoutes />
      </SessionProvider>
    </BrowserRouter>
  );
}
