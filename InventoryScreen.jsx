import React, { useState, useEffect, useCallback } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell,
} from "recharts";
import {
  ArrowLeft, Search, BarChart3, Plus, ChevronDown, Truck, AlertTriangle, TrendingUp, TrendingDown, Package, IndianRupee, Check, X,
} from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadImageToCloudinary } from "../lib/cloudinary";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Inventory (single flow: Product List -> Add Product -> Reports)
  Reports lives inside this same screen/file so it's one continuous flow,
  not a separate jump. Reports has 3 tabs: Overview / Stock / Cash Flow.

  BACKEND STATUS: the Product List + Add Product (single & bulk) below are
  wired to real Supabase data. The Reports tab (Overview/Stock/Cash Flow —
  trend charts, revenue-composition donut, customer growth) still runs on
  the representative PERIODS/MONTHLY_TREND/CASH_FLOW numbers below — that
  needs its own aggregation pass (sales/expense rollups by date range) and
  is the next piece of backend work after Ledger.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};
const money = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;
const money2 = (n) => `₹${n.toFixed(2)}`;

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
function SectionLabel({ children, color }) {
  return <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: color || TOKENS.ink, opacity: color ? 1 : 0.55 }}>{children}</div>;
}
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>{children}</div>;
}
function Stitch({ className = "" }) {
  return <div className={`w-full h-px ${className}`} style={{ backgroundImage: "repeating-linear-gradient(90deg, " + TOKENS.line + " 0 6px, transparent 6px 12px)" }} />;
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
const tooltipStyle = { background: TOKENS.ink, border: "none", borderRadius: 4, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, color: TOKENS.paper };
const tickStyle = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, fill: TOKENS.ink, opacity: 0.75 };

function stockStatus(p) {
  if (p.stock <= 0) return { label: "Out of Stock", color: TOKENS.due };
  if (p.stock <= p.lowStockLimit) return { label: "Low Stock", color: TOKENS.saffronDeep };
  return { label: "In Stock", color: TOKENS.stamp };
}

// Reports-tab representative numbers — NOT wired to real data yet (see note above).

const PERIODS = {
  daily: { label: "Today", unitsSold: 48, prevSales: 5620, fixedExpenseMonthly: 18000 },
  monthly: { label: "This Month", unitsSold: 1260, prevSales: 161200, fixedExpenseMonthly: 18000 },
  yearly: { label: "This Year", unitsSold: 14830, prevSales: 1894000, fixedExpenseMonthly: 216000 },
};
const MONTHLY_TREND = [
  { month: "Mar", sales: 128400, profit: 9200 }, { month: "Apr", sales: 141000, profit: 10800 },
  { month: "May", sales: 152600, profit: 11900 }, { month: "Jun", sales: 149300, profit: 10200 },
  { month: "Jul", sales: 161200, profit: 12400 }, { month: "Aug", sales: 184500, profit: 12950 },
];
const CUSTOMERS = {
  total: 86, new: 7, active: 52,
  inactive: [
    { name: "Bishnu Traders", lastVisit: "45 days ago" }, { name: "Sonali Kirana", lastVisit: "32 days ago" },
    { name: "Amar Store", lastVisit: "29 days ago" }, { name: "Digha Fresh Mart", lastVisit: "18 days ago" },
  ],
};
const CUSTOMER_DUE_TOTAL = 18400;
const IN_TRANSIT = [
  { product: "Basmati Rice 10kg", code: "P-112", supplier: "Ganesh Wholesale", qty: 40, amountPaid: 14400, orderedOn: "02 Aug", expected: "07 Aug" },
  { product: "Sunflower Oil 1L", code: "P-103", supplier: "Bengal Traders", qty: 100, amountPaid: 11750, orderedOn: "04 Aug", expected: "08 Aug" },
];
const CASH_FLOW = {
  received: { cash: 96200, online: 58300, bank: 30000 },
  paidToSuppliers: { cash: 22000, online: 41300, bank: 55000 },
};
const REPORT_TABS = [{ id: "overview", label: "Overview" }, { id: "stock", label: "Stock" }, { id: "cashflow", label: "Cash Flow" }];

export default function BonikInventoryScreen() {
  const { businessId } = useSession();
  const [products, setProducts] = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [screen, setScreen] = useState("list"); // list | addChoice | addProduct | bulkSource | bulkFill | reports
  const [bulkItems, setBulkItems] = useState([]);
  const [newProduct, setNewProduct] = useState({ name: "", code: "", category: "", unit: "PCS", price: "", lowStockLimit: "", minOrderQty: "1", photoFile: null });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const [reportTab, setReportTab] = useState("overview");
  const [period, setPeriod] = useState("monthly");
  const [showProductDetails, setShowProductDetails] = useState(false);

  // Maps a real `products` row to the shape the list/reports UI expects.
  // purchasePrice/variableCost/soldQty have no backend column yet (Reports
  // is still on representative numbers), so they default to 0 for now.
  const mapRow = (r) => ({
    id: r.id, code: r.product_code, name: r.name, unit: r.unit,
    sellPrice: Number(r.selling_price), purchasePrice: 0, variableCost: 0,
    stock: Number(r.current_stock), soldQty: 0, lowStockLimit: Number(r.low_stock_limit) || 0,
    photoUrl: r.photo_url,
  });

  const loadProducts = useCallback(async () => {
    if (!businessId) return;
    setProductsLoading(true);
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .eq("business_id", businessId)
      .eq("status", "active")
      .order("name", { ascending: true });
    if (!error) setProducts((data || []).map(mapRow));
    setProductsLoading(false);
  }, [businessId]);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const filtered = products.filter((p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.code.toLowerCase().includes(query.toLowerCase()));

  const submitProduct = async () => {
    if (!newProduct.name || !newProduct.code || !businessId || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      let photoUrl = null;
      if (newProduct.photoFile) {
        photoUrl = await uploadImageToCloudinary(newProduct.photoFile);
      }
      const { data, error } = await supabase
        .from("products")
        .insert({
          business_id: businessId,
          product_code: newProduct.code.toUpperCase(),
          name: newProduct.name,
          category: newProduct.category || null,
          unit: newProduct.unit,
          selling_price: parseFloat(newProduct.price) || 0,
          low_stock_limit: parseFloat(newProduct.lowStockLimit) || 0,
          min_order_qty: parseFloat(newProduct.minOrderQty) || 1,
          photo_url: photoUrl,
        })
        .select()
        .single();
      if (error) throw error;
      setProducts((prev) => [...prev, mapRow(data)]);
      setNewProduct({ name: "", code: "", category: "", unit: "PCS", price: "", lowStockLimit: "", minOrderQty: "1", photoFile: null });
      setScreen("list");
    } catch (e) {
      setSubmitError(e.message || "Product code might already be in use — try a different code.");
    } finally {
      setSubmitting(false);
    }
  };

  // ---------- Add: choose Single or Bulk ----------
  if (screen === "addChoice") {
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Add Product</h2>
        <div className="space-y-3">
          <button onClick={() => setScreen("addProduct")} className="w-full text-left px-4 py-4 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <div className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>Single Product</div>
            <div className="font-mono text-[10.5px] mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>Fill in one product's details</div>
          </button>
          <button onClick={() => setScreen("bulkSource")} className="w-full text-left px-4 py-4 rounded-2xl border-2" style={{ borderColor: TOKENS.saffron }}>
            <div className="font-display font-semibold text-sm" style={{ color: TOKENS.saffronDeep }}>Multiple Products (Photos)</div>
            <div className="font-mono text-[10.5px] mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>Take several photos at once, write details under each</div>
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Bulk: choose Camera or Gallery ----------
  if (screen === "bulkSource") {
    // Real files chosen (from camera or gallery) turn into bulkItems with an
    // actual photoFile + local previewUrl, so submitBulk() has something real
    // to upload to Cloudinary per row.
    const handleFiles = (fileList) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      setBulkItems(files.map((file, i) => ({
        id: Date.now() + i, photoFile: file, previewUrl: URL.createObjectURL(file),
        code: "", name: "", buyPrice: "", sellPrice: "", lowStockLimit: "",
      })));
      setScreen("bulkFill");
    };
    return (
      <Shell>
        <button onClick={() => setScreen("addChoice")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-2" style={{ color: TOKENS.inkDeep }}>Add Photos</h2>
        <p className="font-sans text-sm mb-8" style={{ color: TOKENS.ink, opacity: 0.75 }}>One photo per product — pick as many as you like, then write details under each.</p>
        <div className="space-y-3">
          <label className="w-full py-5 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 cursor-pointer" style={{ borderColor: TOKENS.saffron }}>
            <span className="font-display font-semibold text-sm" style={{ color: TOKENS.saffronDeep }}>Camera</span>
            <span className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.62 }}>take photos now</span>
            <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
          <label className="w-full py-5 rounded-2xl border-dashed flex flex-col items-center gap-2 cursor-pointer" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
            <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>Gallery</span>
            <span className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.62 }}>pick from existing photos</span>
            <input type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
          </label>
        </div>
      </Shell>
    );
  }

  // ---------- Bulk: fill details per photo ----------
  if (screen === "bulkFill") {
    const bulkColors = ["#D8CFB8", "#C9B8A0", "#B8A98C", "#E0D4B8", "#CFC0A0", "#DCCBA8"];
    const updateBulk = (id, field, value) => setBulkItems((prev) => prev.map((it) => it.id === id ? { ...it, [field]: value } : it));
    const removeBulk = (id) => setBulkItems((prev) => prev.filter((it) => it.id !== id));
    const readyBulk = bulkItems.filter((it) => it.code && it.name && it.sellPrice);
    const submitBulk = async () => {
      if (!businessId || submitting) return;
      setSubmitting(true);
      setSubmitError("");
      try {
        // Upload each photo first (if a real file was picked), then insert all rows together.
        const rows = await Promise.all(
          readyBulk.map(async (it) => {
            let photoUrl = null;
            if (it.photoFile) photoUrl = await uploadImageToCloudinary(it.photoFile);
            return {
              business_id: businessId,
              product_code: it.code.toUpperCase(),
              name: it.name,
              unit: "PCS",
              selling_price: parseFloat(it.sellPrice) || 0,
              low_stock_limit: parseFloat(it.lowStockLimit) || 0,
              photo_url: photoUrl,
            };
          })
        );
        const { data, error } = await supabase.from("products").insert(rows).select();
        if (error) throw error;
        setProducts((prev) => [...prev, ...(data || []).map(mapRow)]);
        setBulkItems([]);
        setScreen("list");
      } catch (e) {
        setSubmitError(e.message || "Could not add products — check codes aren't repeated.");
      } finally {
        setSubmitting(false);
      }
    };
    return (
      <Shell>
        <button onClick={() => setScreen("bulkSource")} className="font-mono text-xs mb-4 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Write Details</h2>
        <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>{bulkItems.length} photos · fill in each, then Add All</p>
        <div className="space-y-4 mb-24">
          {bulkItems.map((it, i) => (
            <div key={it.id} className="rounded-2xl overflow-hidden" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex items-stretch">
                <div className="w-24 h-24 shrink-0 flex items-center justify-center overflow-hidden" style={{ background: bulkColors[i % bulkColors.length] }}>
                  {it.previewUrl ? (
                    <img src={it.previewUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="font-display font-bold text-lg" style={{ color: TOKENS.inkDeep, opacity: 0.55 }}>{i + 1}</span>
                  )}
                </div>
                <div className="flex-1 p-2.5 space-y-1.5">
                  <input value={it.code} onChange={(e) => updateBulk(it.id, "code", e.target.value)} placeholder="Code (P-105)" className="w-full bg-transparent border-b pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                  <input value={it.name} onChange={(e) => updateBulk(it.id, "name", e.target.value)} placeholder="Product name" className="w-full bg-transparent border-b pb-1 text-[13px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                  <div className="flex gap-2">
                    <input value={it.buyPrice} onChange={(e) => updateBulk(it.id, "buyPrice", e.target.value)} placeholder="Buy ₹" type="number" className="w-1/2 bg-transparent border-b pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                    <input value={it.sellPrice} onChange={(e) => updateBulk(it.id, "sellPrice", e.target.value)} placeholder="Sell ₹" type="number" className="w-1/2 bg-transparent border-b pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }} />
                  </div>
                </div>
                <button onClick={() => removeBulk(it.id)} className="w-8 flex items-start justify-center pt-2"><X size={14} color={TOKENS.due} /></button>
              </div>
              {it.code && it.name && it.sellPrice && (
                <div className="px-2.5 py-1.5 flex items-center gap-1" style={{ background: TOKENS.paperDeep }}>
                  <Check size={10} color={TOKENS.stamp} /><span className="font-mono text-[9px]" style={{ color: TOKENS.stamp }}>ready to add</span>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="fixed bottom-6 left-0 right-0 flex justify-center px-5">
          <button disabled={readyBulk.length === 0} onClick={submitBulk} className="w-full max-w-[380px] py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40 shadow-lg" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
            Add All ({readyBulk.length})
          </button>
        </div>
      </Shell>
    );
  }

  // ---------- Add Product ----------
  if (screen === "addProduct") {
    const canSubmit = newProduct.name && newProduct.code && newProduct.price;
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-6" style={{ color: TOKENS.inkDeep }}>Add Product</h2>
        <TextInput label="Product Name" value={newProduct.name} onChange={(e) => setNewProduct((p) => ({ ...p, name: e.target.value }))} placeholder="e.g. Tata Salt 1kg" />
        <TextInput label="Product Code" value={newProduct.code} onChange={(e) => setNewProduct((p) => ({ ...p, code: e.target.value }))} placeholder="P-105" />
        <TextInput label="Category (Optional)" value={newProduct.category} onChange={(e) => setNewProduct((p) => ({ ...p, category: e.target.value }))} placeholder="Grocery" />
        <div className="mb-4">
          <FieldLabel>Unit</FieldLabel>
          <div className="flex gap-2 mt-1">
            {["PCS", "KG", "Bundle", "Box"].map((u) => (
              <button key={u} onClick={() => setNewProduct((p) => ({ ...p, unit: u }))} className="px-3 py-2 rounded-2xl border-2 font-mono text-xs" style={{ borderColor: newProduct.unit === u ? TOKENS.saffron : TOKENS.line, background: newProduct.unit === u ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{u}</button>
            ))}
          </div>
        </div>
        <TextInput label="Selling Price (per unit)" type="number" value={newProduct.price} onChange={(e) => setNewProduct((p) => ({ ...p, price: e.target.value }))} placeholder="₹0" />
        <TextInput label="Low Stock Alert Limit" type="number" value={newProduct.lowStockLimit} onChange={(e) => setNewProduct((p) => ({ ...p, lowStockLimit: e.target.value }))} placeholder="10" />
        <TextInput label="Minimum Order Quantity" type="number" value={newProduct.minOrderQty} onChange={(e) => setNewProduct((p) => ({ ...p, minOrderQty: e.target.value }))} />
        <div className="mt-6"><button disabled={!canSubmit} onClick={submitProduct} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>Add Product</button></div>
      </Shell>
    );
  }

  // ---------- Reports ----------
  if (screen === "reports") {
    const P = PERIODS[period];
    const dailyFixed = P.fixedExpenseMonthly / (period === "yearly" ? 365 : 31);
    const fixedCostPerUnit = period === "daily" ? dailyFixed / P.unitsSold : (P.fixedExpenseMonthly * (period === "yearly" ? 12 : 1)) / P.unitsSold;

    const productRows = products.map((p) => {
      const realCostPerUnit = p.purchasePrice + p.variableCost + fixedCostPerUnit;
      const profitPerUnit = p.sellPrice - realCostPerUnit;
      return { ...p, realCostPerUnit, profitPerUnit, totalProfit: profitPerUnit * p.soldQty, revenue: p.sellPrice * p.soldQty };
    }).sort((a, b) => b.totalProfit - a.totalProfit);

    const totalRevenue = productRows.reduce((s, p) => s + p.revenue, 0);
    const totalPurchase = productRows.reduce((s, p) => s + p.purchasePrice * p.soldQty, 0);
    const totalVariable = productRows.reduce((s, p) => s + p.variableCost * p.soldQty, 0);
    const totalFixed = fixedCostPerUnit * P.unitsSold;
    const netProfit = productRows.reduce((s, p) => s + p.totalProfit, 0);
    const marginPct = ((netProfit / totalRevenue) * 100).toFixed(1);
    const growth = (((totalRevenue - P.prevSales) / P.prevSales) * 100).toFixed(1);
    const pnlColor = netProfit >= 0 ? TOKENS.stamp : TOKENS.due;

    const donutData = [
      { name: "Purchase Cost", value: totalPurchase, color: TOKENS.slate },
      { name: "Variable Cost", value: totalVariable, color: TOKENS.saffronDeep },
      { name: "Fixed Cost", value: totalFixed, color: TOKENS.saffron },
      { name: "Net Profit", value: netProfit, color: TOKENS.stamp },
    ];

    const onHandValue = products.reduce((s, p) => s + p.stock * p.purchasePrice, 0);
    const inTransitValue = IN_TRANSIT.reduce((s, o) => s + o.amountPaid, 0);
    const combinedStockValue = onHandValue + inTransitValue;
    const lowStock = products.filter((p) => p.stock > 0 && p.stock <= p.lowStockLimit);
    const outOfStock = products.filter((p) => p.stock <= 0);
    const reorderRows = products.map((p) => {
      const inTransitQty = IN_TRANSIT.filter((o) => o.code === p.code).reduce((s, o) => s + o.qty, 0);
      const suggested = Math.max(0, p.lowStockLimit * 2 - p.stock - inTransitQty);
      return { ...p, inTransitQty, suggested };
    }).filter((p) => p.suggested > 0);

    const totalReceived = CASH_FLOW.received.cash + CASH_FLOW.received.online + CASH_FLOW.received.bank;
    const totalPaid = CASH_FLOW.paidToSuppliers.cash + CASH_FLOW.paidToSuppliers.online + CASH_FLOW.paidToSuppliers.bank;
    const netCash = totalReceived - totalPaid;

    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-4 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> product list</button>
        <h2 className="font-display font-semibold text-xl mb-4" style={{ color: TOKENS.inkDeep }}>Inventory Reports</h2>
        <div className="grid grid-cols-3 gap-1.5 mb-6">
          {REPORT_TABS.map((t) => (
            <button key={t.id} onClick={() => setReportTab(t.id)} className="py-2.5 rounded-2xl border-2 font-mono text-[11px]" style={{ borderColor: reportTab === t.id ? TOKENS.saffron : TOKENS.line, background: reportTab === t.id ? TOKENS.paperDeep : "#FFFFFF", color: TOKENS.inkDeep }}>{t.label}</button>
          ))}
        </div>

        {reportTab === "overview" && (
          <>
            <div className="grid grid-cols-3 gap-1.5 mb-5">
              {["daily", "monthly", "yearly"].map((p) => (
                <button key={p} onClick={() => setPeriod(p)} className="py-2 rounded-2xl border font-mono text-[10px] capitalize" style={{ borderColor: period === p ? TOKENS.saffronDeep : TOKENS.line, color: TOKENS.ink, opacity: period === p ? 1 : 0.6 }}>{p}</button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <Card className="px-4 py-3.5"><div className="flex items-center gap-1.5 mb-1"><Package size={12} color={TOKENS.saffronDeep} /><span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.ink, opacity: 0.72 }}>Units Sold</span></div><div className="font-display font-bold text-2xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{P.unitsSold.toLocaleString("en-IN")}</div></Card>
              <Card className="px-4 py-3.5"><div className="flex items-center gap-1.5 mb-1"><IndianRupee size={12} color={TOKENS.saffronDeep} /><span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.ink, opacity: 0.72 }}>Revenue</span></div><div className="font-display font-bold text-2xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(totalRevenue)}</div></Card>
            </div>

            <div className="rounded-2xl px-4 py-5 mb-3" style={{ background: TOKENS.ink }}>
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[11px] uppercase tracking-widest" style={{ color: TOKENS.saffron, opacity: 0.85 }}>{netProfit >= 0 ? "Net Profit" : "Net Loss"} · {P.label}</span>
                <span className="font-mono text-[10px] flex items-center gap-1" style={{ color: growth >= 0 ? TOKENS.stamp : TOKENS.due }}>{growth >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{growth}%</span>
              </div>
              <div className="font-display font-bold text-3xl tabular-nums" style={{ color: pnlColor }}>{money(Math.abs(netProfit))}</div>
              <div className="font-mono text-[10px] mt-1" style={{ color: TOKENS.paper, opacity: 0.72 }}>{marginPct}% margin</div>
            </div>

            {/* Clear totals — the exact numbers, spelled out */}
            <SectionLabel>Totals · {P.label}</SectionLabel>
            <Card className="px-4 py-1 mb-6">
              {[
                ["Total Sales", totalRevenue, "+", TOKENS.stamp],
                ["Purchase Cost", totalPurchase, "−", TOKENS.due],
                ["Variable Expense", totalVariable, "−", TOKENS.due],
                ["Fixed Expense", totalFixed, "−", TOKENS.due],
              ].map(([label, val, sign, color], i) => (
                <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: `1px solid ${TOKENS.line}` }}>
                  <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span>
                  <span className="font-mono text-sm tabular-nums" style={{ color }}>{sign} {money(val)}</span>
                </div>
              ))}
              <div className="flex items-center justify-between py-3">
                <span className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>{netProfit >= 0 ? "Net Profit" : "Net Loss"}</span>
                <span className="font-display font-bold text-base tabular-nums" style={{ color: pnlColor }}>{money(Math.abs(netProfit))}</span>
              </div>
            </Card>

            {CUSTOMER_DUE_TOTAL > 0 && (
              <div className="rounded-2xl border-2 px-4 py-3 mb-3 flex items-center justify-between" style={{ borderColor: TOKENS.due }}>
                <div><div className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.due }}>Still Due From Customers</div><div className="font-mono text-[9.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>included above, not yet in hand</div></div>
                <span className="font-display font-bold text-base tabular-nums" style={{ color: TOKENS.due }}>{money(CUSTOMER_DUE_TOTAL)}</span>
              </div>
            )}

            {/* What's actually realized, after taking out what's still pending collection */}
            {(() => {
              const netInHand = netProfit - CUSTOMER_DUE_TOTAL;
              const inHandColor = netInHand >= 0 ? TOKENS.stamp : TOKENS.due;
              return (
                <div className="rounded-2xl px-4 py-4 mb-6" style={{ background: inHandColor }}>
                  <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: TOKENS.paper, opacity: 0.85 }}>
                    {netInHand >= 0 ? "Net Profit In Hand" : "Short In Hand — Nothing Left"}
                  </div>
                  <div className="font-display font-bold text-2xl tabular-nums" style={{ color: TOKENS.paper }}>
                    {netInHand < 0 && "− "}{money(Math.abs(netInHand))}
                  </div>
                  <div className="font-mono text-[9px] mt-1" style={{ color: TOKENS.paper, opacity: 0.7 }}>
                    {money(netProfit)} net profit − {money(CUSTOMER_DUE_TOTAL)} still due
                  </div>
                </div>
              );
            })()}

            <SectionLabel>How Fixed Cost Gets Shared</SectionLabel>
            <Card className="px-4 py-4 mb-6">
              <div className="font-mono text-[11px] leading-relaxed" style={{ color: TOKENS.ink, opacity: 0.75 }}>
                {period === "daily" ? <>{money(P.fixedExpenseMonthly)} monthly fixed ÷ 31 days = {money(dailyFixed)}/day ÷ {P.unitsSold} units today = <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{money2(fixedCostPerUnit)}/unit</span></>
                  : period === "monthly" ? <>{money(P.fixedExpenseMonthly)} monthly fixed ÷ {P.unitsSold.toLocaleString("en-IN")} units = <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{money2(fixedCostPerUnit)}/unit</span></>
                    : <>{money(P.fixedExpenseMonthly)} yearly fixed ÷ {P.unitsSold.toLocaleString("en-IN")} units = <span style={{ color: TOKENS.inkDeep, fontWeight: 600 }}>{money2(fixedCostPerUnit)}/unit</span></>}
              </div>
              <div className="font-mono text-[10px] mt-2" style={{ color: TOKENS.ink, opacity: 0.62 }}>Purchase price & variable cost stay with each product's own delivery — only this fixed share is spread evenly.</div>
            </Card>

            <SectionLabel>Where the Revenue Goes</SectionLabel>
            <Card className="px-2 py-3 mb-6">
              <ResponsiveContainer width="100%" height={190}>
                <PieChart>
                  <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={48} outerRadius={75} paddingAngle={2}>
                    {donutData.map((d, i) => <Cell key={i} fill={d.color} stroke={TOKENS.paper} strokeWidth={2} />)}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: TOKENS.paper }} labelStyle={{ color: TOKENS.saffron }} formatter={(v) => money(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 px-3 pb-2">
                {donutData.map((d, i) => (
                  <div key={i} className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} /><span className="font-mono text-[9.5px] truncate" style={{ color: TOKENS.ink, opacity: 0.7 }}>{d.name}</span><span className="font-mono text-[9.5px] ml-auto tabular-nums" style={{ color: TOKENS.inkDeep }}>{((d.value / totalRevenue) * 100).toFixed(0)}%</span></div>
                ))}
              </div>
            </Card>

            <SectionLabel>6-Month Trend</SectionLabel>
            <Card className="px-2 pt-4 pb-2 mb-6">
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={MONTHLY_TREND} margin={{ left: -18, right: 8 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke={TOKENS.line} vertical={false} />
                  <XAxis dataKey="month" tick={tickStyle} axisLine={{ stroke: TOKENS.line }} tickLine={false} />
                  <YAxis tick={tickStyle} axisLine={false} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: TOKENS.paper }} labelStyle={{ color: TOKENS.saffron }} formatter={(v) => money(v)} />
                  <Bar dataKey="sales" name="Sales" fill={TOKENS.paperDeep} stroke={TOKENS.ink} strokeWidth={1} radius={[3, 3, 0, 0]} />
                  <Bar dataKey="profit" name="Profit" fill={TOKENS.stamp} radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <SectionLabel>Real Profit by Product</SectionLabel>
            <Card className="px-2 pt-4 pb-2 mb-2">
              <ResponsiveContainer width="100%" height={190}>
                <BarChart data={productRows} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 4" stroke={TOKENS.line} horizontal={false} />
                  <XAxis type="number" tick={tickStyle} axisLine={{ stroke: TOKENS.line }} tickLine={false} tickFormatter={(v) => `${v / 1000}k`} />
                  <YAxis type="category" dataKey="name" width={100} tick={{ ...tickStyle, fontSize: 10.5 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} itemStyle={{ color: TOKENS.paper }} labelStyle={{ color: TOKENS.saffron }} formatter={(v) => money(v)} />
                  <Bar dataKey="totalProfit" name="Profit" radius={[0, 3, 3, 0]} barSize={16}>
                    {productRows.map((p, i) => <Cell key={i} fill={p.totalProfit >= 0 ? TOKENS.stamp : TOKENS.due} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <button onClick={() => setShowProductDetails((v) => !v)} className="w-full flex items-center justify-between py-2 mb-2">
              <span className="font-mono text-[10.5px]" style={{ color: TOKENS.saffronDeep }}>{showProductDetails ? "Hide" : "View"} per-product cost details</span>
              <ChevronDown size={13} color={TOKENS.saffronDeep} style={{ transform: showProductDetails ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
            </button>
            {showProductDetails && (
              <div className="space-y-2 mb-6">
                {productRows.map((p, i) => {
                  const grossProfitPerUnit = p.sellPrice - p.purchasePrice;
                  const expensePerUnit = p.variableCost + fixedCostPerUnit;
                  return (
                    <div key={i} className="px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-display font-semibold text-sm" style={{ color: TOKENS.inkDeep }}>{p.name}</span>
                        <span className="font-mono text-sm tabular-nums" style={{ color: p.profitPerUnit >= 0 ? TOKENS.stamp : TOKENS.due }}>{money2(p.profitPerUnit)}/unit</span>
                      </div>
                      <div className="font-mono text-[10px] space-y-1" style={{ color: TOKENS.ink }}>
                        <div className="flex justify-between"><span style={{ opacity: 0.72 }}>Sold at {money2(p.sellPrice)} − bought at {money2(p.purchasePrice)}</span><span className="tabular-nums" style={{ color: TOKENS.inkDeep }}>= {money2(grossProfitPerUnit)} gross</span></div>
                        <div className="flex justify-between"><span style={{ opacity: 0.72 }}>− variable {money2(p.variableCost)} − fixed share {money2(fixedCostPerUnit)}</span><span className="tabular-nums" style={{ color: TOKENS.due }}>− {money2(expensePerUnit)}</span></div>
                        <div className="flex justify-between pt-1 border-t" style={{ borderColor: TOKENS.line }}><span className="font-semibold" style={{ color: TOKENS.inkDeep }}>Net profit left</span><span className="tabular-nums font-semibold" style={{ color: p.profitPerUnit >= 0 ? TOKENS.stamp : TOKENS.due }}>{money2(p.profitPerUnit)}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <SectionLabel>Customer Growth</SectionLabel>
            <div className="grid grid-cols-3 gap-2 mb-4">
              <Card className="px-3 py-3 text-center"><div className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.inkDeep }}>{CUSTOMERS.total}</div><div className="font-mono text-[9px] uppercase mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Total</div></Card>
              <Card className="px-3 py-3 text-center"><div className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.stamp }}>+{CUSTOMERS.new}</div><div className="font-mono text-[9px] uppercase mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>New</div></Card>
              <Card className="px-3 py-3 text-center"><div className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.inkDeep }}>{CUSTOMERS.active}</div><div className="font-mono text-[9px] uppercase mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Active</div></Card>
            </div>
            <div className="font-mono text-[10.5px] mb-2" style={{ color: TOKENS.due }}>Haven't Seen In A While</div>
            <Card className="px-4 py-1">
              {CUSTOMERS.inactive.map((c, i) => (
                <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < CUSTOMERS.inactive.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                  <span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{c.name}</span>
                  <span className="font-mono text-[11px]" style={{ color: parseInt(c.lastVisit) > 30 ? TOKENS.due : TOKENS.saffronDeep }}>{c.lastVisit}</span>
                </div>
              ))}
            </Card>
          </>
        )}

        {reportTab === "stock" && (
          <>
            <div className="grid grid-cols-2 gap-2.5 mb-2.5">
              <Card className="px-4 py-3.5"><div className="font-mono text-[10px] uppercase tracking-wide mb-1" style={{ color: TOKENS.ink, opacity: 0.72 }}>On-Hand Value</div><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(onHandValue)}</div><div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.58 }}>physically in shop</div></Card>
              <Card className="px-4 py-3.5" style={{ borderColor: TOKENS.saffronDeep }}><div className="flex items-center gap-1 mb-1"><Truck size={11} color={TOKENS.saffronDeep} /><span className="font-mono text-[10px] uppercase tracking-wide" style={{ color: TOKENS.saffronDeep }}>In Transit</span></div><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.saffronDeep }}>{money(inTransitValue)}</div><div className="font-mono text-[9px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.58 }}>paid, not arrived yet</div></Card>
            </div>
            <div className="rounded-2xl px-4 py-4 mb-6" style={{ background: TOKENS.ink }}>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffron, opacity: 0.85 }}>Total Stock Value (On-Hand + In Transit)</div>
              <div className="font-display font-bold text-2xl tabular-nums" style={{ color: TOKENS.paper }}>{money(combinedStockValue)}</div>
              <div className="font-mono text-[9px] mt-1" style={{ color: TOKENS.paper, opacity: 0.68 }}>combined because the money for in-transit goods has already left the business</div>
            </div>

            <SectionLabel>Goods On The Way</SectionLabel>
            <Card className="px-4 py-1 mb-6">
              {IN_TRANSIT.map((o, i) => (
                <div key={i} className="py-2.5" style={{ borderBottom: i < IN_TRANSIT.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                  <div className="flex items-center justify-between"><span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{o.product}</span><span className="font-mono text-sm tabular-nums" style={{ color: TOKENS.saffronDeep }}>{money(o.amountPaid)}</span></div>
                  <div className="font-mono text-[9.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{o.supplier} · {o.qty} units · ordered {o.orderedOn} · expected {o.expected}</div>
                </div>
              ))}
            </Card>

            <div className="grid grid-cols-2 gap-2.5 mb-6">
              <Card className="px-3.5 py-3.5"><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.saffronDeep }}>{lowStock.length}</div><div className="font-mono text-[10px] uppercase tracking-wide mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>Low Stock</div></Card>
              <Card className="px-3.5 py-3.5"><div className="font-display font-bold text-xl tabular-nums" style={{ color: TOKENS.due }}>{outOfStock.length}</div><div className="font-mono text-[10px] uppercase tracking-wide mt-1" style={{ color: TOKENS.ink, opacity: 0.68 }}>Out of Stock</div></Card>
            </div>

            <SectionLabel color={TOKENS.saffronDeep}>Suggested Reorder</SectionLabel>
            <Card className="px-4 py-1">
              {reorderRows.length === 0 ? <div className="py-6 text-center font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Nothing needs reordering</div> : reorderRows.map((p, i) => (
                <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < reorderRows.length - 1 ? `1px solid ${TOKENS.line}` : "none" }}>
                  <div><div className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{p.name}</div><div className="font-mono text-[9.5px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>on hand {p.stock} {p.inTransitQty > 0 && `· ${p.inTransitQty} in transit`}</div></div>
                  <div className="flex items-center gap-1.5">{p.stock <= 0 && <AlertTriangle size={12} color={TOKENS.due} />}<span className="font-mono text-sm tabular-nums" style={{ color: TOKENS.saffronDeep }}>+{p.suggested}</span></div>
                </div>
              ))}
            </Card>
          </>
        )}

        {reportTab === "cashflow" && (
          <>
            <div className="rounded-2xl px-4 py-5 mb-6" style={{ background: TOKENS.ink }}>
              <div className="font-mono text-[10px] uppercase tracking-widest mb-1" style={{ color: TOKENS.saffron, opacity: 0.85 }}>Net Cash This Month</div>
              <div className="font-display font-bold text-3xl tabular-nums" style={{ color: netCash >= 0 ? TOKENS.stamp : TOKENS.due }}>{money(Math.abs(netCash))}</div>
              <div className="font-mono text-[9.5px] mt-1" style={{ color: TOKENS.paper, opacity: 0.68 }}>{money(totalReceived)} received − {money(totalPaid)} paid to suppliers</div>
            </div>
            <SectionLabel color={TOKENS.stamp}>Received From Customers</SectionLabel>
            <Card className="px-4 py-1 mb-6">
              {[["Cash", CASH_FLOW.received.cash], ["Online", CASH_FLOW.received.online], ["Bank", CASH_FLOW.received.bank]].map(([label, val], i) => (
                <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < 2 ? `1px solid ${TOKENS.line}` : "none" }}><span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span><span className="font-mono text-sm tabular-nums" style={{ color: TOKENS.stamp }}>+{money(val)}</span></div>
              ))}
              <div className="flex items-center justify-between py-3 border-t-2" style={{ borderColor: TOKENS.ink }}><span className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>Total Received</span><span className="font-display font-bold text-base tabular-nums" style={{ color: TOKENS.stamp }}>{money(totalReceived)}</span></div>
            </Card>
            <SectionLabel color={TOKENS.due}>Paid To Suppliers</SectionLabel>
            <Card className="px-4 py-1">
              {[["Cash", CASH_FLOW.paidToSuppliers.cash], ["Online", CASH_FLOW.paidToSuppliers.online], ["Bank", CASH_FLOW.paidToSuppliers.bank]].map(([label, val], i) => (
                <div key={i} className="flex items-center justify-between py-2.5" style={{ borderBottom: i < 2 ? `1px solid ${TOKENS.line}` : "none" }}><span className="font-sans text-[13px]" style={{ color: TOKENS.inkDeep }}>{label}</span><span className="font-mono text-sm tabular-nums" style={{ color: TOKENS.due }}>−{money(val)}</span></div>
              ))}
              <div className="flex items-center justify-between py-3 border-t-2" style={{ borderColor: TOKENS.ink }}><span className="font-display font-bold text-sm" style={{ color: TOKENS.inkDeep }}>Total Paid</span><span className="font-display font-bold text-base tabular-nums" style={{ color: TOKENS.due }}>{money(totalPaid)}</span></div>
            </Card>
          </>
        )}
      </Shell>
    );
  }

  // ---------- Product list (default) ----------
  return (
    <Shell>
      <div className="flex items-center justify-between mb-5">
        <div className="font-display font-bold text-lg" style={{ color: TOKENS.ink }}>Inventory</div>
        <button onClick={() => setScreen("reports")} className="flex items-center gap-1.5 px-3 py-2 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
          <BarChart3 size={14} color={TOKENS.ink} /><span className="font-mono text-[11px]" style={{ color: TOKENS.ink }}>Reports</span>
        </button>
      </div>
      <div className="flex items-center gap-2 border-2 rounded-2xl px-3 py-2.5 mb-4" style={{ borderColor: TOKENS.line }}>
        <Search size={15} color={TOKENS.ink} style={{ opacity: 0.68 }} />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search product or code…" className="flex-1 bg-transparent outline-none text-sm font-sans" style={{ color: TOKENS.inkDeep }} />
      </div>
      <div className="space-y-2">
        {filtered.map((p) => {
          const s = stockStatus(p);
          return (
            <div key={p.id} className="flex items-center justify-between px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex-1 min-w-0">
                <div className="font-display font-semibold text-sm truncate" style={{ color: TOKENS.inkDeep }}>{p.name}</div>
                <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>{p.code} · ₹{p.sellPrice}/{p.unit}</div>
              </div>
              <div className="text-right shrink-0 pl-2">
                <div className="font-mono text-sm tabular-nums" style={{ color: s.color }}>{p.stock} {p.unit}</div>
                <div className="font-mono text-[9px] mt-0.5" style={{ color: s.color, opacity: 0.8 }}>{s.label}</div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No product found</div>}
      </div>
      <button onClick={() => setScreen("addChoice")} className="fixed w-14 h-14 rounded-full flex items-center justify-center shadow-lg" style={{ background: TOKENS.ink, right: "max(1.5rem, calc(50% - 210px + 1.25rem))", bottom: "2.5rem" }}>
        <Plus size={22} color={TOKENS.saffron} />
      </button>
    </Shell>
  );
}
