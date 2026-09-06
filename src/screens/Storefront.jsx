import React, { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Search, ShoppingCart, Plus, Minus, ArrowLeft, MapPin, Clock, Phone, Hourglass, CalendarCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";

/*
  BONIK by PCP — Customer-facing Storefront
  Checkout is bill-styled (Code | Name | Qty | Rate | Amount), asks for a
  Customer Code first (auto-fills known customers, else collects new
  details) and always asks for delivery address. Placing an order does
  NOT go straight to payment — it goes to the shop for approval first
  (owner can trim quantities if several customers want the same limited
  stock, and sets a delivery date). Only after approval does Payment open.

  BACKEND STATUS: fully real and public (no login needed, matches
  rls.sql's public read policies). The route is /shop/:businessSlug —
  since businesses has no slug column yet, the param is treated as the
  business's real id for now; add a slug column later if a friendlier
  URL is wanted. Order approval is read via polling shop_orders every
  few seconds (no realtime subscription set up yet) instead of the old
  demo "simulate approval" button.
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
        @keyframes stampPop { 0% { transform: scale(2.2) rotate(-8deg); opacity: 0; } 60% { transform: scale(0.92) rotate(-8deg); opacity: 1; } 100% { transform: scale(1) rotate(-8deg); opacity: 1; } }
        .stamp-pop { animation: stampPop 0.5s cubic-bezier(.2,.8,.3,1) both; }
      `}</style>
      <div className="w-full max-w-[420px] min-h-screen relative">{children}</div>
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
      <input {...props} className="w-full border-0 border-b-2 rounded-t-lg px-2.5 pt-2 pb-2 text-[15px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep, background: "#FFFFFF" }} />
    </div>
  );
}

// Nothing left here to seed — shop/products/customers all load from Supabase.

export default function BonikStorefront() {
  const { businessSlug } = useParams(); // treated as the business's real id for now — see BACKEND STATUS note above
  const businessId = businessSlug;

  const [shopLoading, setShopLoading] = useState(true);
  const [SHOP, setSHOP] = useState(null); // { id, name, address, hours, phone, open, minOrderType, minOrderValue, deliveryPerKm, distanceKm, whatsappOrder }
  const [PRODUCTS, setPRODUCTS] = useState([]);
  const [CATEGORIES, setCATEGORIES] = useState(["All"]);

  const [screen, setScreen] = useState("home"); // home | product | cart | checkout | pending | payment | fulfillment | confirmed
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [cart, setCart] = useState({});
  const [customerCode, setCustomerCode] = useState("");
  const [knownCustomer, setKnownCustomer] = useState(null);
  const [isNewCustomer, setIsNewCustomer] = useState(false);
  const [checkoutForm, setCheckoutForm] = useState({ name: "", mobile: "", address: "", note: "" });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [orderId, setOrderId] = useState(null);
  const [orderNumber, setOrderNumber] = useState(null);
  const [approved, setApproved] = useState(false);
  const [deliveryDate, setDeliveryDate] = useState(null);
  const [fulfillment, setFulfillment] = useState(null); // "delivery" | "pickup"

  // ---- load shop + products once ----
  useEffect(() => {
    if (!businessId) return;
    (async () => {
      setShopLoading(true);
      const [{ data: biz }, { data: profile }, { data: prods }] = await Promise.all([
        supabase.from("businesses").select("*").eq("id", businessId).maybeSingle(),
        supabase.from("shop_profiles").select("*").eq("business_id", businessId).maybeSingle(),
        supabase.from("products").select("*").eq("business_id", businessId).eq("online_shop_visible", true).eq("status", "active").order("name"),
      ]);
      if (biz) {
        setSHOP({
          id: biz.id, name: biz.name, address: biz.address, phone: biz.mobile_number,
          hours: profile?.business_hours || "See shop for hours",
          open: profile?.shop_open ?? true,
          minOrderType: "amount", minOrderValue: Number(profile?.min_order_amount || 0),
          deliveryPerKm: Number(profile?.delivery_charge || 0), distanceKm: 1, // real distance calc needs the customer's location — flat 1km until that's built
          whatsappOrder: profile?.whatsapp_order_enabled || false,
        });
      }
      const mapped = (prods || []).map((p) => ({
        id: p.id, code: p.product_code, name: p.name, price: Number(p.selling_price), stock: Number(p.current_stock),
        category: p.category || "General", showStock: p.online_show_stock, showPrice: p.online_show_price,
      }));
      setPRODUCTS(mapped);
      setCATEGORIES(["All", ...Array.from(new Set(mapped.map((p) => p.category)))]);
      setShopLoading(false);
    })();
  }, [businessId]);

  // ---- poll the order's status while waiting on the shop or on payment ----
  useEffect(() => {
    if (!orderId || !["pending", "payment"].includes(screen)) return;
    const check = async () => {
      const { data } = await supabase.from("shop_orders").select("*").eq("id", orderId).maybeSingle();
      if (!data) return;
      if (data.status !== "new" && !approved) {
        setApproved(true);
        setDeliveryDate(data.delivery_date);
      }
    };
    check();
    const interval = setInterval(check, 4000);
    return () => clearInterval(interval);
  }, [orderId, screen, approved]);

  const filtered = PRODUCTS.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) && (category === "All" || p.category === category));
  const cartItems = Object.entries(cart).map(([id, qty]) => ({ ...PRODUCTS.find((p) => p.id === id), qty })).filter((i) => i.qty > 0);
  const cartQtyTotal = cartItems.reduce((s, i) => s + i.qty, 0);
  const cartAmount = cartItems.reduce((s, i) => s + i.price * i.qty, 0);
  const deliveryCharge = SHOP ? Math.round(SHOP.deliveryPerKm * SHOP.distanceKm) : 0;
  const grandTotal = cartAmount + deliveryCharge;
  const meetsMinOrder = SHOP ? cartAmount >= SHOP.minOrderValue : true;
  const setQty = (id, qty) => setCart((prev) => ({ ...prev, [id]: Math.max(0, qty) }));

  const lookupCode = async (v) => {
    setCustomerCode(v);
    setKnownCustomer(null);
    if (!v.trim() || !businessId) return;
    const { data } = await supabase.from("customers").select("name, mobile_number").eq("business_id", businessId).eq("customer_code", v.toUpperCase()).maybeSingle();
    if (data) {
      setKnownCustomer({ name: data.name, mobile: data.mobile_number });
      setCheckoutForm((f) => ({ ...f, name: data.name, mobile: data.mobile_number }));
      setIsNewCustomer(false);
    }
  };

  const canSubmitOrder = checkoutForm.name && checkoutForm.mobile && checkoutForm.address && meetsMinOrder;
  const submitForApproval = async () => {
    if (!canSubmitOrder || !businessId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      const { count } = await supabase.from("shop_orders").select("id", { count: "exact", head: true }).eq("business_id", businessId);
      const orderNo = `ORD-${String((count || 0) + 1).padStart(4, "0")}`;

      const { data: order, error: orderErr } = await supabase.from("shop_orders").insert({
        business_id: businessId, order_number: orderNo, customer_name: checkoutForm.name, customer_mobile: checkoutForm.mobile,
        delivery_address: checkoutForm.address, note: checkoutForm.note || null, status: "new", total_amount: grandTotal,
      }).select().single();
      if (orderErr) throw orderErr;

      const itemRows = cartItems.map((it) => ({ order_id: order.id, product_id: it.id, quantity: it.qty, unit_price: it.price }));
      const { error: itemsErr } = await supabase.from("shop_order_items").insert(itemRows);
      if (itemsErr) throw itemsErr;

      setOrderId(order.id);
      setOrderNumber(orderNo);
      setApproved(false);
      setScreen("pending");
    } catch (e) {
      setSubmitError(e.message || "Could not place order — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const placePayment = async (method) => {
    if (!orderId) return;
    await supabase.from("shop_orders").update({ payment_status: "paid", payment_method: method }).eq("id", orderId);
    setScreen("fulfillment");
  };

  const chooseFulfillment = async (type) => {
    setFulfillment(type);
    if (orderId) await supabase.from("shop_orders").update({ fulfillment_type: type }).eq("id", orderId);
    setScreen("confirmed");
  };

  if (shopLoading || !SHOP) {
    return (
      <Shell>
        <div className="flex items-center justify-center min-h-screen">
          <span className="font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.6 }}>Loading shop…</span>
        </div>
      </Shell>
    );
  }

  // ---------- Shop closed ----------
  if (!SHOP.open) {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-8" style={{ background: TOKENS.ink }}>
          <div className="font-display font-bold text-2xl mb-2" style={{ color: TOKENS.paper }}>{SHOP.name}</div>
          <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{ background: TOKENS.due }}><Clock size={26} color={TOKENS.paper} /></div>
          <div className="font-display font-semibold text-lg" style={{ color: TOKENS.saffron }}>Shop is Closed</div>
          <div className="font-mono text-xs mt-2" style={{ color: TOKENS.paper, opacity: 0.75 }}>Open daily {SHOP.hours} — please check back soon</div>
        </div>
      </Shell>
    );
  }

  // ---------- Confirmed (paid) ----------
  if (screen === "confirmed") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-6" style={{ background: TOKENS.paper }}>
          <div className="stamp-pop w-28 h-28 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg] mb-6" style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}>
            <span className="font-display font-bold text-[13px] tracking-[0.1em]">PACKED</span>
          </div>
          <h2 className="font-display font-semibold text-xl" style={{ color: TOKENS.inkDeep }}>{orderNumber}</h2>
          <p className="font-mono text-xs mt-2 max-w-[260px]" style={{ color: TOKENS.ink, opacity: 0.72 }}>
            {fulfillment === "pickup"
              ? `Your order is packed and ready. Come collect it anytime after ${deliveryDate} — bring ${orderNumber}.`
              : `Payment received — ${SHOP.name} will deliver your order on ${deliveryDate}.`}
          </p>
          <button onClick={() => { setCart({}); setScreen("home"); setApproved(false); setFulfillment(null); setNotified(false); }} className="mt-6 font-mono text-xs underline rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}>Continue shopping</button>
        </div>
      </Shell>
    );
  }

  // ---------- Fulfillment choice ----------
  if (screen === "fulfillment") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
          <div className="stamp-pop w-24 h-24 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg] mb-6" style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}>
            <span className="font-display font-bold text-[11px]">PAID</span>
          </div>
          <h2 className="font-display font-semibold text-lg mb-1" style={{ color: TOKENS.inkDeep }}>{orderNumber} paid</h2>
          <p className="font-mono text-xs mb-8" style={{ color: TOKENS.ink, opacity: 0.72 }}>How would you like to get it?</p>
          <div className="w-full max-w-[300px] space-y-3">
            <button onClick={() => chooseFulfillment("delivery")} className="w-full py-4 rounded-2xl border-2 font-display font-semibold text-sm" style={{ borderColor: TOKENS.ink, color: TOKENS.inkDeep }}>
              Deliver to My Address
            </button>
            <button onClick={() => chooseFulfillment("pickup")} className="w-full py-4 rounded-2xl border-2 font-display font-semibold text-sm" style={{ borderColor: TOKENS.ink, color: TOKENS.inkDeep }}>
              I'll Pick It Up Myself
            </button>
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- Payment ----------
  if (screen === "payment") {
    return (
      <Shell>
        <div className="px-5 pt-8 pb-8">
          <div className="rounded-2xl px-4 py-4 mb-6" style={{ background: TOKENS.stamp }}>
            <div className="flex items-center gap-2 mb-1"><CalendarCheck size={15} color={TOKENS.paper} /><span className="font-display font-semibold text-sm" style={{ color: TOKENS.paper }}>Approved by {SHOP.name}</span></div>
            <div className="font-mono text-xs" style={{ color: TOKENS.paper, opacity: 0.85 }}>Expected delivery: {deliveryDate}</div>
          </div>
          <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Pay {money(grandTotal)}</h2>
          <div className="space-y-2 mb-6">
            {["upi", "cod"].map((m) => (
              <button key={m} onClick={() => placePayment(m)} className="w-full text-left px-4 py-3.5 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{m === "upi" ? "UPI" : "Cash on Delivery"}</span>
              </button>
            ))}
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- Pending shop approval ----------
  if (screen === "pending") {
    return (
      <Shell>
        <div className="flex flex-col items-center justify-center min-h-screen text-center px-6">
          {!approved ? (
            <>
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6" style={{ background: TOKENS.paperDeep }}>
                <Hourglass size={26} color={TOKENS.saffronDeep} />
              </div>
              <h2 className="font-display font-semibold text-lg" style={{ color: TOKENS.inkDeep }}>Waiting for {SHOP.name} to confirm</h2>
              <p className="font-mono text-xs mt-2 max-w-[260px]" style={{ color: TOKENS.ink, opacity: 0.72 }}>
                Order {orderNumber} sent. The shop is checking stock — you'll be able to pay once it's confirmed.
              </p>
            </>
          ) : (
            <>
              <div className="mb-6 w-full max-w-[300px] px-4 py-3 rounded-2xl border-2 text-left" style={{ borderColor: TOKENS.blue, background: TOKENS.paperDeep }}>
                <div className="font-mono text-[9px] uppercase tracking-wide mb-1" style={{ color: TOKENS.blue }}>🔔 Notification</div>
                <div className="font-sans text-[12.5px]" style={{ color: TOKENS.inkDeep }}>{SHOP.name} confirmed your order — waiting for your payment</div>
              </div>
              <div className="stamp-pop w-24 h-24 rounded-full border-[3px] flex items-center justify-center rotate-[-8deg] mb-6" style={{ borderColor: TOKENS.stamp, color: TOKENS.stamp }}>
                <span className="font-display font-bold text-[11px]">CONFIRMED</span>
              </div>
              <h2 className="font-display font-semibold text-lg" style={{ color: TOKENS.inkDeep }}>Status: Waiting for Payment</h2>
              <p className="font-mono text-xs mt-2 mb-6" style={{ color: TOKENS.ink, opacity: 0.72 }}>Delivery: {deliveryDate}</p>
              <button onClick={() => setScreen("payment")} className="w-full max-w-[280px] py-3.5 rounded-2xl font-display font-semibold text-[15px]" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
                Proceed to Payment
              </button>
            </>
          )}
        </div>
      </Shell>
    );
  }

  // ---------- Checkout (bill-styled) ----------
  if (screen === "checkout") {
    return (
      <Shell>
        <div className="px-5 pt-8 pb-24">
          <button onClick={() => setScreen("cart")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ArrowLeft size={13} /> cart</button>
          <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Checkout</h2>

          <TextInput label="Customer Code (if you've ordered before)" value={customerCode} onChange={(e) => lookupCode(e.target.value)} placeholder="CUST-014" />
          {knownCustomer && (
            <div className="mb-4 px-3.5 py-2.5 rounded-2xl" style={{ background: TOKENS.paperDeep }}>
              <span className="font-mono text-[11px]" style={{ color: TOKENS.stamp }}>Welcome back, {knownCustomer.name}</span>
            </div>
          )}
          {!knownCustomer && !isNewCustomer && (
            <button onClick={() => setIsNewCustomer(true)} className="w-full text-left mb-5 px-3.5 py-3 rounded-2xl border-2 border-dashed" style={{ borderColor: TOKENS.saffron }}>
              <span className="font-mono text-[12px]" style={{ color: TOKENS.saffronDeep }}>Don't have a code? Tap here — new customer</span>
            </button>
          )}
          {!knownCustomer && isNewCustomer && (
            <>
              <TextInput label="Your Name" value={checkoutForm.name} onChange={(e) => setCheckoutForm((f) => ({ ...f, name: e.target.value }))} placeholder="Full name" />
              <TextInput label="Mobile Number" value={checkoutForm.mobile} onChange={(e) => setCheckoutForm((f) => ({ ...f, mobile: e.target.value }))} placeholder="98xxxxxxxx" />
            </>
          )}
          <TextInput label="Delivery Address" value={checkoutForm.address} onChange={(e) => setCheckoutForm((f) => ({ ...f, address: e.target.value }))} placeholder="House, street, landmark" />
          <TextInput label="Note (Optional)" value={checkoutForm.note} onChange={(e) => setCheckoutForm((f) => ({ ...f, note: e.target.value }))} placeholder="Any instructions" />

          {/* Bill-style order summary */}
          <div className="border-2 rounded-2xl overflow-hidden mt-2 mb-6" style={{ borderColor: TOKENS.ink }}>
            <div className="grid font-mono text-[9px] uppercase tracking-wide py-2" style={{ gridTemplateColumns: "16% 40% 12% 32%", background: TOKENS.ink, color: TOKENS.saffron }}>
              <div className="px-2">Code</div><div className="px-1.5">Name</div><div className="text-center">Qty</div><div className="px-2 text-right">Amount</div>
            </div>
            {cartItems.map((it, i) => (
              <div key={it.id} className="grid items-center text-[12.5px] py-2" style={{ gridTemplateColumns: "16% 40% 12% 32%", borderTop: i > 0 ? `1px solid ${TOKENS.line}` : "none" }}>
                <div className="px-2 font-mono text-[11px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>{it.code}</div>
                <div className="px-1.5 font-sans text-[11px] truncate" style={{ color: TOKENS.inkDeep }}>{it.name}</div>
                <div className="text-center font-mono tabular-nums" style={{ color: TOKENS.inkDeep }}>{it.qty}</div>
                <div className="px-2 text-right font-mono tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(it.price * it.qty)}</div>
              </div>
            ))}
            <div className="grid items-center py-2 border-t" style={{ gridTemplateColumns: "68% 32%", borderColor: TOKENS.line }}>
              <div className="px-2 font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>Delivery ({SHOP.distanceKm} km)</div>
              <div className="px-2 text-right font-mono text-[11px] tabular-nums" style={{ color: TOKENS.ink, opacity: 0.7 }}>{money(deliveryCharge)}</div>
            </div>
            <div className="grid items-center py-2.5" style={{ gridTemplateColumns: "58% 42%", background: TOKENS.ink }}>
              <div className="px-2 font-mono text-[11px] uppercase" style={{ color: TOKENS.saffron }}>Total</div>
              <div className="px-2 text-right font-display font-bold text-base tabular-nums" style={{ color: TOKENS.paper }}>{money(grandTotal)}</div>
            </div>
          </div>

          {submitError && <div className="mb-3 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{submitError}</div>}
          <button disabled={!canSubmitOrder || submitting} onClick={submitForApproval} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            {submitting ? "Placing order…" : "Submit Order for Confirmation"}
          </button>
          <div className="font-mono text-[9.5px] mt-2 text-center" style={{ color: TOKENS.ink, opacity: 0.58 }}>
            payment opens after {SHOP.name} confirms availability
          </div>
        </div>
      </Shell>
    );
  }

  // ---------- Cart (bill-styled) ----------
  if (screen === "cart") {
    return (
      <Shell>
        <div className="px-5 pt-8 pb-32">
          <button onClick={() => setScreen("home")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ArrowLeft size={13} /> shop</button>
          <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Your Cart</h2>

          {cartItems.length === 0 ? (
            <div className="text-center py-16 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Cart is empty</div>
          ) : (
            <div className="border-2 rounded-2xl overflow-hidden mb-4" style={{ borderColor: TOKENS.ink }}>
              <div className="grid font-mono text-[9px] uppercase tracking-wide py-2" style={{ gridTemplateColumns: "16% 34% 26% 24%", background: TOKENS.ink, color: TOKENS.saffron }}>
                <div className="px-2">Code</div><div className="px-1.5">Name</div><div className="text-center">Qty</div><div className="px-2 text-right">Amount</div>
              </div>
              {cartItems.map((it, i) => (
                <div key={it.id} className="grid items-center text-[12.5px] py-2.5" style={{ gridTemplateColumns: "16% 34% 26% 24%", borderTop: i > 0 ? `1px solid ${TOKENS.line}` : "none" }}>
                  <div className="px-2 font-mono text-[11px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>{it.code}</div>
                  <div className="px-1.5 font-sans text-[11px] truncate" style={{ color: TOKENS.inkDeep }}>{it.name}</div>
                  <div className="flex items-center justify-center gap-1.5">
                    <button onClick={() => setQty(it.id, it.qty - 1)} className="w-5 h-5 rounded-2xl border flex items-center justify-center" style={{ borderColor: TOKENS.line, background: "#FFFFFF" }}><Minus size={9} color={TOKENS.ink} /></button>
                    <span className="font-mono tabular-nums" style={{ color: TOKENS.inkDeep }}>{it.qty}</span>
                    <button onClick={() => setQty(it.id, it.qty + 1)} className="w-5 h-5 rounded-2xl border flex items-center justify-center" style={{ borderColor: TOKENS.line, background: "#FFFFFF" }}><Plus size={9} color={TOKENS.ink} /></button>
                  </div>
                  <div className="px-2 text-right font-mono tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(it.price * it.qty)}</div>
                </div>
              ))}
              <div className="grid items-center py-2.5" style={{ gridTemplateColumns: "76% 24%", background: TOKENS.ink }}>
                <div className="px-2 font-mono text-[11px] uppercase" style={{ color: TOKENS.saffron }}>Subtotal</div>
                <div className="px-2 text-right font-display font-bold text-base tabular-nums" style={{ color: TOKENS.paper }}>{money(cartAmount)}</div>
              </div>
            </div>
          )}

          {!meetsMinOrder && cartItems.length > 0 && (
            <div className="mb-4 px-3.5 py-3 rounded-2xl border-2" style={{ borderColor: TOKENS.saffronDeep }}>
              <span className="font-mono text-[11px]" style={{ color: TOKENS.saffronDeep }}>
                Minimum order is {SHOP.minOrderType === "amount" ? money(SHOP.minOrderValue) : `${SHOP.minOrderValue} pcs`} — add a bit more to continue
              </span>
            </div>
          )}
        </div>

        {cartItems.length > 0 && (
          <div className="fixed bottom-0 left-0 right-0 flex justify-center px-5 pb-6 pt-3" style={{ background: "#FFFFFF", boxShadow: "0 -2px 8px rgba(10,25,48,0.1)" }}>
            <div className="w-full max-w-[420px] flex items-center gap-3">
              <div className="font-display font-bold text-base tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(cartAmount)}</div>
              <button disabled={!meetsMinOrder} onClick={() => setScreen("checkout")} className="flex-1 py-3 rounded-2xl font-display font-semibold text-sm disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
                Checkout
              </button>
            </div>
          </div>
        )}
      </Shell>
    );
  }

  // ---------- Product detail ----------
  if (screen === "product" && selectedProduct) {
    const p = selectedProduct;
    const outOfStock = p.stock <= 0;
    return (
      <Shell>
        <div className="px-5 pt-8 pb-8">
          <button onClick={() => setScreen("home")} className="font-mono text-xs mb-6 flex items-center gap-1 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}><ArrowLeft size={13} /> shop</button>
          <div className="w-full aspect-square rounded-2xl mb-5 flex items-center justify-center" style={{ background: TOKENS.paperDeep }}>
            <span className="font-display font-bold text-2xl" style={{ color: TOKENS.ink, opacity: 0.45 }}>{p.name.slice(0, 2).toUpperCase()}</span>
          </div>
          <div className="flex items-start justify-between mb-1">
            <h2 className="font-display font-bold text-xl" style={{ color: TOKENS.inkDeep }}>{p.name}</h2>
            {outOfStock && <span className="font-mono text-[9px] px-2 py-1 rounded-2xl shrink-0" style={{ background: TOKENS.due, color: TOKENS.paper }}>OUT OF STOCK</span>}
          </div>
          {p.showPrice && <div className="font-display font-bold text-2xl mb-1" style={{ color: TOKENS.saffronDeep }}>{money(p.price)}</div>}
          {p.showStock && !outOfStock && <div className="font-mono text-xs mb-6" style={{ color: TOKENS.stamp }}>{p.stock} in stock</div>}
          {(!p.showStock || outOfStock) && <div className="mb-6" />}
          <button disabled={outOfStock} onClick={() => { setQty(p.id, (cart[p.id] || 0) + 1); setScreen("home"); }} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            {outOfStock ? "Out of Stock" : "Add to Cart"}
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Home / catalog ----------
  return (
    <Shell>
      <div className="px-5 pt-8 pb-5" style={{ background: TOKENS.ink }}>
        <div className="font-display font-bold text-xl" style={{ color: TOKENS.paper }}>{SHOP.name}</div>
        <div className="flex items-center gap-1.5 mt-2 font-mono text-[10.5px]" style={{ color: TOKENS.paper, opacity: 0.75 }}><MapPin size={11} /> {SHOP.address}</div>
        <div className="flex items-center gap-4 mt-1.5 font-mono text-[10.5px]" style={{ color: TOKENS.paper, opacity: 0.75 }}>
          <span className="flex items-center gap-1"><Clock size={11} /> {SHOP.hours}</span>
          <span className="flex items-center gap-1"><Phone size={11} /> {SHOP.phone}</span>
        </div>
      </div>

      <div className="px-5 pt-5 pb-32">
        <div className="flex items-center gap-2 border-2 rounded-2xl px-3 py-2.5 mb-4" style={{ borderColor: TOKENS.line }}>
          <Search size={15} color={TOKENS.ink} style={{ opacity: 0.68 }} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products…" className="flex-1 bg-transparent outline-none text-sm font-sans" style={{ color: TOKENS.inkDeep }} />
        </div>
        <div className="flex gap-2 mb-5 overflow-x-auto">
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCategory(c)} className="px-3 py-1.5 rounded-full border-2 font-mono text-[11px] shrink-0" style={{ borderColor: category === c ? TOKENS.saffron : TOKENS.line, background: category === c ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{c}</button>
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3">
          {filtered.map((p) => {
            const outOfStock = p.stock <= 0;
            return (
              <button key={p.id} onClick={() => { setSelectedProduct(p); setScreen("product"); }} className="text-left rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                <div className="aspect-square flex items-center justify-center relative" style={{ background: TOKENS.paperDeep }}>
                  <span className="font-display font-bold text-lg" style={{ color: TOKENS.ink, opacity: 0.45 }}>{p.name.slice(0, 2).toUpperCase()}</span>
                  {outOfStock && <div className="absolute inset-0 flex items-center justify-center" style={{ background: "rgba(15,36,41,0.55)" }}><span className="font-mono text-[9px] px-2 py-1 rounded-2xl" style={{ background: TOKENS.due, color: TOKENS.paper }}>OUT OF STOCK</span></div>}
                </div>
                <div className="px-2.5 py-2">
                  <div className="font-sans text-[12.5px] truncate" style={{ color: TOKENS.inkDeep }}>{p.name}</div>
                  {p.showPrice && <div className="font-display font-bold text-[13px] mt-0.5" style={{ color: TOKENS.saffronDeep }}>{money(p.price)}</div>}
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && <div className="col-span-2 text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No products found</div>}
        </div>
      </div>

      {cartQtyTotal > 0 && (
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-5">
          <button onClick={() => setScreen("cart")} className="w-full max-w-[380px] py-3.5 rounded-2xl font-display font-semibold text-[15px] flex items-center justify-center gap-2 shadow-lg" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            <ShoppingCart size={16} /> View Cart · {cartItems.length} item{cartItems.length !== 1 ? "s" : ""} ({cartQtyTotal} pcs) · {money(cartAmount)}
          </button>
        </div>
      )}
    </Shell>
  );
}
