import React, { useState, useEffect, useCallback } from "react";
import { ChevronRight, Check, Store, Eye, EyeOff, CalendarCheck } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Online Shop (owner-side management)
  Part 10.1/10.2: order pipeline, per-product visibility control (shares
  Inventory's product list), and shop settings. This is what opens from
  the Home Screen's Online Shop tile — the customer-facing storefront is
  a separate, public-facing surface built from the same data.

  BACKEND STATUS: Orders and Products tabs are fully real (shop_orders +
  shop_order_items + products.online_shop_visible/online_show_stock/
  online_show_price). Settings persists the fields shop_profiles.sql
  actually has (open/online-order/whatsapp/online-payment toggles, min
  order amount, delivery charge). Min-Order-By-Pieces, the Shop Type
  cascade, and Color Theme have no columns in schema.sql yet, so they
  stay local-only for now — noted rather than silently dropped.
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
      <div className="w-full max-w-[420px] min-h-screen px-5 pt-8 pb-16">{children}</div>
    </div>
  );
}
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>{children}</div>;
}
function Stitch({ className = "" }) {
  return <div className={`w-full h-px ${className}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }} />;
}
function Toggle({ on, onClick }) {
  return (
    <button onClick={onClick} className="w-9 h-5 rounded-full flex items-center px-0.5 shrink-0" style={{ background: on ? TOKENS.stamp : TOKENS.line, justifyContent: on ? "flex-end" : "flex-start" }}>
      <span className="w-4 h-4 rounded-full bg-white" />
    </button>
  );
}

const ORDER_STATUSES = ["New", "Waiting for Payment", "Packed", "Out for Delivery", "Ready for Pickup", "Delivered", "Cancelled"];
const STATUS_COLOR = { New: TOKENS.saffronDeep, "Waiting for Payment": TOKENS.blue, Packed: TOKENS.blue, "Out for Delivery": TOKENS.blue, "Ready for Pickup": TOKENS.blue, Delivered: TOKENS.stamp, Cancelled: TOKENS.due };

// Nothing left here to seed — orders/products load from Supabase.

const BUSINESS_TYPES = ["Wholesaler", "Retailer"];
const ITEM_CATEGORIES = ["Electronics", "Medicine", "Fashion", "Food", "Other"];
const FASHION_SUBTYPES = ["Clothes", "Bags"];
const CLOTHES_AUDIENCE = ["Men", "Women", "Both"];
const SHOP_THEMES = [
  { id: "ink", label: "Ink & Saffron", color: "#16333A" },
  { id: "forest", label: "Forest", color: "#2F6F4E" },
  { id: "rose", label: "Rose", color: "#B0413E" },
  { id: "royal", label: "Royal Blue", color: "#2F5FA8" },
];

const TABS = [{ id: "orders", label: "Orders" }, { id: "products", label: "Products" }, { id: "settings", label: "Settings" }];

export default function BonikOnlineShopScreen() {
  const { businessId, memberId } = useSession();
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [approveQtys, setApproveQtys] = useState({});
  const [approveDeliveryDate, setApproveDeliveryDate] = useState("");
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [shopSettings, setShopSettings] = useState({
    open: true, onlineOrder: true, whatsappOrder: false, onlinePayment: false,
    minOrderType: "amount", minOrderValue: "100", deliveryChargePerKm: "10",
    businessType: "Retailer", category: "Fashion", fashionSubtype: "Clothes", clothesAudience: "Both", theme: "ink",
  });

  const loadOrders = useCallback(async () => {
    if (!businessId) return;
    setOrdersLoading(true);
    const { data, error } = await supabase
      .from("shop_orders")
      .select("*, items:shop_order_items(*, product:products(product_code, name))")
      .eq("business_id", businessId)
      .order("created_at", { ascending: false });
    if (!error) {
      setOrders((data || []).map((o) => ({
        id: o.id, orderNo: o.order_number, customer: o.customer_name, mobile: o.customer_mobile,
        items: (o.items || []).map((it) => ({ id: it.id, code: it.product?.product_code, name: it.product?.name, productId: it.product_id, qty: Number(it.quantity), unitPrice: Number(it.unit_price) })),
        total: Number(o.total_amount), status: o.status,
        placedAt: new Date(o.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        deliveryDate: o.delivery_date, fulfillmentType: o.fulfillment_type,
      })));
    }
    setOrdersLoading(false);
  }, [businessId]);

  const loadProducts = useCallback(async () => {
    if (!businessId) return;
    setProductsLoading(true);
    const { data, error } = await supabase.from("products").select("*").eq("business_id", businessId).eq("status", "active").order("name");
    if (!error) {
      setProducts((data || []).map((p) => ({
        id: p.id, code: p.product_code, name: p.name, price: Number(p.selling_price), stock: Number(p.current_stock),
        onlineVisible: p.online_shop_visible, showStock: p.online_show_stock, showPrice: p.online_show_price,
      })));
    }
    setProductsLoading(false);
  }, [businessId]);

  const loadSettings = useCallback(async () => {
    if (!businessId) return;
    setSettingsLoading(true);
    const { data } = await supabase.from("shop_profiles").select("*").eq("business_id", businessId).maybeSingle();
    if (data) {
      setShopSettings((s) => ({
        ...s, open: data.shop_open, onlineOrder: data.online_order_enabled, whatsappOrder: data.whatsapp_order_enabled,
        onlinePayment: data.online_payment_enabled, minOrderValue: String(data.min_order_amount ?? s.minOrderValue),
        deliveryChargePerKm: String(data.delivery_charge ?? s.deliveryChargePerKm),
      }));
    }
    setSettingsLoading(false);
  }, [businessId]);

  useEffect(() => { loadOrders(); loadProducts(); loadSettings(); }, [loadOrders, loadProducts, loadSettings]);

  const saveSettings = async (next) => {
    setShopSettings(next);
    setSavingSettings(true);
    // Only the schema-backed fields actually persist — see BACKEND STATUS note above.
    await supabase.from("shop_profiles").upsert({
      business_id: businessId, shop_open: next.open, online_order_enabled: next.onlineOrder,
      whatsapp_order_enabled: next.whatsappOrder, online_payment_enabled: next.onlinePayment,
      min_order_amount: next.minOrderType === "amount" ? parseFloat(next.minOrderValue) || 0 : 0,
      delivery_charge: parseFloat(next.deliveryChargePerKm) || 0,
    }, { onConflict: "business_id" });
    setSavingSettings(false);
  };

  const setOrderStatus = async (id, status) => {
    setOrders((prev) => prev.map((o) => o.id === id ? { ...o, status } : o));
    setSelectedOrder((s) => s ? { ...s, status } : s);
    await supabase.from("shop_orders").update({ status }).eq("id", id);
  };

  const approveOrder = async (o) => {
    const adjustedItems = o.items.map((it) => ({ ...it, qty: approveQtys[it.code] !== undefined && approveQtys[it.code] !== "" ? parseFloat(approveQtys[it.code]) : it.qty }));
    const adjustedTotal = adjustedItems.reduce((s, it) => s + it.qty * it.unitPrice, 0);

    await Promise.all(adjustedItems.map((it) => supabase.from("shop_order_items").update({ quantity: it.qty }).eq("id", it.id)));
    await supabase.from("shop_orders").update({
      status: "Waiting for Payment", delivery_date: approveDeliveryDate || o.deliveryDate, total_amount: adjustedTotal,
    }).eq("id", o.id);

    setOrders((prev) => prev.map((x) => x.id === o.id ? { ...x, items: adjustedItems, status: "Waiting for Payment", deliveryDate: approveDeliveryDate || x.deliveryDate, total: Math.round(adjustedTotal) } : x));
    setSelectedOrder((s) => s ? { ...s, items: adjustedItems, status: "Waiting for Payment", deliveryDate: approveDeliveryDate || s.deliveryDate, total: Math.round(adjustedTotal) } : s);
    setApproveQtys({});
    setApproveDeliveryDate("");
  };

  const toggleProductField = async (id, field) => {
    const dbField = { onlineVisible: "online_shop_visible", showStock: "online_show_stock", showPrice: "online_show_price" }[field];
    const current = products.find((p) => p.id === id);
    const next = !current[field];
    setProducts((prev) => prev.map((p) => p.id === id ? { ...p, [field]: next } : p));
    await supabase.from("products").update({ [dbField]: next }).eq("id", id);
  };

  const newOrderCount = orders.filter((o) => o.status === "New").length;

  // ---------- Order detail ----------
  if (selectedOrder) {
    const o = orders.find((x) => x.id === selectedOrder.id) || selectedOrder;
    const needsApproval = o.status === "New";
    return (
      <Shell>
        <button onClick={() => setSelectedOrder(null)} className="font-mono text-xs mb-6 rounded-full border px-3 py-1" style={{ color: TOKENS.ink, opacity: 0.68, background: "#FFFFFF", borderColor: TOKENS.line }}>← orders</button>
        <div className="font-display font-bold text-xl" style={{ color: TOKENS.inkDeep }}>{o.orderNo}</div>
        <div className="font-mono text-[11px] mt-1 mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>{o.customer} · {o.mobile} · {o.placedAt}</div>

        {needsApproval && (
          <div className="mb-4 px-3.5 py-3 rounded-2xl border-2" style={{ borderColor: TOKENS.saffronDeep }}>
            <span className="font-mono text-[11px]" style={{ color: TOKENS.saffronDeep }}>
              Customer is waiting — confirm stock (adjust qty if others also want the same item) and set a delivery date
            </span>
          </div>
        )}

        <Card className="px-4 py-1 mb-6">
          <div className="grid font-mono text-[9px] uppercase tracking-wide py-2" style={{ gridTemplateColumns: needsApproval ? "40% 25% 35%" : "60% 40%", color: TOKENS.ink, opacity: 0.68 }}>
            <div>Item</div>
            {needsApproval && <div className="text-center">Ordered</div>}
            <div className="text-right">{needsApproval ? "Confirm Qty" : "Qty"}</div>
          </div>
          {o.items.map((it, i) => (
            <div key={i} className="grid items-center py-2.5" style={{ gridTemplateColumns: needsApproval ? "40% 25% 35%" : "60% 40%", borderTop: `1px solid ${TOKENS.line}` }}>
              <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{it.name}</span>
              {needsApproval && <span className="text-center font-mono text-xs tabular-nums" style={{ color: TOKENS.ink, opacity: 0.68 }}>{it.qty}</span>}
              {needsApproval ? (
                <input
                  type="number"
                  defaultValue={it.qty}
                  onChange={(e) => setApproveQtys((prev) => ({ ...prev, [it.code]: e.target.value }))}
                  className="w-16 ml-auto text-right bg-transparent border-b-2 pb-1 text-sm font-mono outline-none"
                  style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }}
                />
              ) : (
                <span className="text-right font-mono text-sm tabular-nums" style={{ color: TOKENS.ink, opacity: 0.75 }}>× {it.qty}</span>
              )}
            </div>
          ))}
          <div className="flex items-center justify-between py-3 border-t-2" style={{ borderColor: TOKENS.ink }}>
            <span className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>Total</span>
            <span className="font-display font-bold text-base tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(o.total)}</span>
          </div>
        </Card>

        {needsApproval ? (
          <>
            <div className="mb-6">
              <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Delivery Date</div>
              <input
                value={approveDeliveryDate}
                onChange={(e) => setApproveDeliveryDate(e.target.value)}
                placeholder="e.g. 08 Aug, evening"
                className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-sans outline-none"
                style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }}
              />
            </div>
            <button
              disabled={!approveDeliveryDate}
              onClick={() => approveOrder(o)}
              className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] flex items-center justify-center gap-2 disabled:opacity-40"
              style={{ background: TOKENS.stamp, color: TOKENS.paper }}
            >
              <CalendarCheck size={16} /> Approve — Notify Customer to Pay
            </button>
          </>
        ) : (
          <>
            {o.deliveryDate && (
              <div className="mb-6 flex items-center gap-2 px-3.5 py-3 rounded-2xl" style={{ background: TOKENS.paperDeep }}>
                <CalendarCheck size={14} color={TOKENS.stamp} />
                <span className="font-mono text-[11px]" style={{ color: TOKENS.ink }}>Delivery: <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{o.deliveryDate}</span></span>
              </div>
            )}
            <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Update Status</div>
            <div className="grid grid-cols-2 gap-2">
              {ORDER_STATUSES.filter((s) => s !== "New").map((s) => (
                <button key={s} onClick={() => setOrderStatus(o.id, s)} className="py-2.5 rounded-2xl border-2 font-mono text-[11px]"
                  style={{ borderColor: o.status === s ? STATUS_COLOR[s] : TOKENS.line, background: o.status === s ? TOKENS.paperDeep : "#FFFFFF", color: o.status === s ? STATUS_COLOR[s] : TOKENS.inkDeep }}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="font-display font-bold text-lg mb-5" style={{ color: TOKENS.ink }}>Online Shop</div>

      <div className="grid grid-cols-3 gap-1.5 mb-6">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} className="py-2.5 rounded-2xl border-2 font-mono text-[11px] relative"
            style={{ borderColor: tab === t.id ? TOKENS.saffron : TOKENS.line, background: tab === t.id ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>
            {t.label}
            {t.id === "orders" && newOrderCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center font-mono text-[9px]" style={{ background: TOKENS.due, color: TOKENS.paper }}>{newOrderCount}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "orders" && (
        <div className="space-y-2">
          {ordersLoading && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
          {orders.map((o) => (
            <button key={o.id} onClick={() => setSelectedOrder(o)} className="w-full text-left px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{o.customer}</span>
                <span className="font-mono text-[10px] px-2 py-0.5 rounded-2xl" style={{ background: TOKENS.paperDeep, color: STATUS_COLOR[o.status] }}>{o.status}</span>
              </div>
              <div className="font-mono text-[10px] flex items-center justify-between" style={{ color: TOKENS.ink, opacity: 0.68 }}>
                <span>{o.orderNo} · {o.items.length} item(s) · {o.placedAt}</span>
                <span className="tabular-nums" style={{ color: TOKENS.inkDeep, opacity: 1 }}>{money(o.total)}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {tab === "products" && (
        <>
          <div className="font-mono text-[10.5px] mb-4" style={{ color: TOKENS.ink, opacity: 0.68 }}>Control what customers see in your online shop</div>
          <div className="space-y-2">
            {productsLoading && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>}
            {products.map((p) => (
              <Card key={p.id} className="px-3.5 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{p.name}</span>
                      {p.stock <= 0 && (
                        <span className="font-mono text-[9px] px-1.5 py-0.5 rounded-2xl" style={{ background: TOKENS.due, color: TOKENS.paper }}>OUT OF STOCK</span>
                      )}
                    </div>
                    <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>
                      {p.code} · {money(p.price)}{p.showStock && p.stock > 0 && ` · ${p.stock} left`}
                    </div>
                  </div>
                  <Toggle on={p.onlineVisible} onClick={() => toggleProductField(p.id, "onlineVisible")} />
                </div>
                {p.onlineVisible && (
                  <div className="flex items-center gap-4 mt-2 pt-2" style={{ borderTop: `1px solid ${TOKENS.line}` }}>
                    <button onClick={() => toggleProductField(p.id, "showStock")} className="flex items-center gap-1.5">
                      {p.showStock ? <Eye size={12} color={TOKENS.stamp} /> : <EyeOff size={12} color={TOKENS.ink} style={{ opacity: 0.58 }} />}
                      <span className="font-mono text-[10px]" style={{ color: p.showStock ? TOKENS.stamp : TOKENS.ink, opacity: p.showStock ? 1 : 0.5 }}>Show stock</span>
                    </button>
                    <button onClick={() => toggleProductField(p.id, "showPrice")} className="flex items-center gap-1.5">
                      {p.showPrice ? <Eye size={12} color={TOKENS.stamp} /> : <EyeOff size={12} color={TOKENS.ink} style={{ opacity: 0.58 }} />}
                      <span className="font-mono text-[10px]" style={{ color: p.showPrice ? TOKENS.stamp : TOKENS.ink, opacity: p.showPrice ? 1 : 0.5 }}>Show price</span>
                    </button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        </>
      )}

      {tab === "settings" && (
        <>
          <div className="rounded-2xl px-4 py-4 mb-6 flex items-center justify-between" style={{ background: shopSettings.open ? TOKENS.stamp : TOKENS.due }}>
            <div className="flex items-center gap-2">
              <Store size={16} color={TOKENS.paper} />
              <span className="font-display font-semibold text-sm" style={{ color: TOKENS.paper }}>Shop is {shopSettings.open ? "Open" : "Closed"}</span>
            </div>
            <Toggle on={shopSettings.open} onClick={() => saveSettings({ ...shopSettings, open: !shopSettings.open })} />
          </div>

          <div className="space-y-1 mb-6">
            {[
              ["onlineOrder", "Online Ordering"], ["whatsappOrder", "WhatsApp Order"], ["onlinePayment", "Online Payment"],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between py-3" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
                <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span>
                <Toggle on={shopSettings[key]} onClick={() => saveSettings({ ...shopSettings, [key]: !shopSettings[key] })} />
              </div>
            ))}
          </div>

          <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Order Rules</div>
          <div className="mb-4">
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Minimum Order By</div>
            <div className="flex gap-2 mb-3">
              {[["amount", "Amount (₹)"], ["pieces", "Pieces"]].map(([id, label]) => (
                <button key={id} onClick={() => setShopSettings((s) => ({ ...s, minOrderType: id }))} className="flex-1 py-2 rounded-2xl border-2 font-mono text-[11px]"
                  style={{ borderColor: shopSettings.minOrderType === id ? TOKENS.saffron : TOKENS.line, background: shopSettings.minOrderType === id ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>
                  {label}
                </button>
              ))}
            </div>
            <input value={shopSettings.minOrderValue} onChange={(e) => setShopSettings((s) => ({ ...s, minOrderValue: e.target.value }))} onBlur={() => saveSettings(shopSettings)}
              className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }}
              placeholder={shopSettings.minOrderType === "amount" ? "₹100" : "3 pcs"} />
          </div>
          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Delivery Charge (₹ per km)</div>
            <input value={shopSettings.deliveryChargePerKm} onChange={(e) => setShopSettings((s) => ({ ...s, deliveryChargePerKm: e.target.value }))} onBlur={() => saveSettings(shopSettings)}
              className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
          </div>

          <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Shop Type</div>
          <div className="font-mono text-[10.5px] mb-4" style={{ color: TOKENS.ink, opacity: 0.68 }}>Your answers shape how the online shop looks to customers — not saved to the database yet, changes here reset if you leave</div>

          <div className="mb-4">
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Business Type</div>
            <div className="flex gap-2">
              {BUSINESS_TYPES.map((t) => (
                <button key={t} onClick={() => setShopSettings((s) => ({ ...s, businessType: t }))} className="flex-1 py-2 rounded-2xl border-2 font-mono text-[11px]"
                  style={{ borderColor: shopSettings.businessType === t ? TOKENS.saffron : TOKENS.line, background: shopSettings.businessType === t ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{t}</button>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>What Do You Sell?</div>
            <div className="flex flex-wrap gap-2">
              {ITEM_CATEGORIES.map((c) => (
                <button key={c} onClick={() => setShopSettings((s) => ({ ...s, category: c }))} className="px-3 py-2 rounded-2xl border-2 font-mono text-[11px]"
                  style={{ borderColor: shopSettings.category === c ? TOKENS.saffron : TOKENS.line, background: shopSettings.category === c ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{c}</button>
              ))}
            </div>
          </div>

          {shopSettings.category === "Fashion" && (
            <div className="mb-4 pl-3" style={{ borderLeft: `2px solid ${TOKENS.saffron}` }}>
              <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Fashion — Which One?</div>
              <div className="flex gap-2 mb-3">
                {FASHION_SUBTYPES.map((t) => (
                  <button key={t} onClick={() => setShopSettings((s) => ({ ...s, fashionSubtype: t }))} className="flex-1 py-2 rounded-2xl border-2 font-mono text-[11px]"
                    style={{ borderColor: shopSettings.fashionSubtype === t ? TOKENS.saffron : TOKENS.line, background: shopSettings.fashionSubtype === t ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{t}</button>
                ))}
              </div>
              {shopSettings.fashionSubtype === "Clothes" && (
                <>
                  <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>For Whom?</div>
                  <div className="flex gap-2">
                    {CLOTHES_AUDIENCE.map((a) => (
                      <button key={a} onClick={() => setShopSettings((s) => ({ ...s, clothesAudience: a }))} className="flex-1 py-2 rounded-2xl border-2 font-mono text-[11px]"
                        style={{ borderColor: shopSettings.clothesAudience === a ? TOKENS.saffron : TOKENS.line, background: shopSettings.clothesAudience === a ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{a}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="mb-6">
            <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Shop Color Theme</div>
            <div className="flex gap-3">
              {SHOP_THEMES.map((th) => (
                <button key={th.id} onClick={() => setShopSettings((s) => ({ ...s, theme: th.id }))} className="flex flex-col items-center gap-1.5">
                  <span className="w-10 h-10 rounded-full border-2" style={{ background: th.color, borderColor: shopSettings.theme === th.id ? TOKENS.saffron : "transparent" }} />
                  <span className="font-mono text-[9px]" style={{ color: TOKENS.ink, opacity: shopSettings.theme === th.id ? 1 : 0.5 }}>{th.label}</span>
                </button>
              ))}
            </div>
          </div>

          <button className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] border-2 flex items-center justify-center gap-2" style={{ borderColor: TOKENS.ink, color: TOKENS.ink }}>
            <Store size={16} /> Preview Online Shop
          </button>
        </>
      )}
    </Shell>
  );
}
