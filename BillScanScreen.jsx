import React, { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Camera, Check, Trash2, Plus, Sparkles, ChevronRight } from "lucide-react";
import { supabase } from "../lib/supabaseClient";
import { uploadImageToCloudinary } from "../lib/cloudinary";
import { useSession } from "../lib/session";

/*
  BONIK by PCP — Bill Scan (OCR)
  Take a photo of ANY bill/receipt -> Claude reads it via the scan-bill
  Edge Function -> results always land in an editable review screen
  first (never auto-saved) -> Save writes bill_scans + bill_scan_items.

  A second tool here, "Fix Similar Names", solves a different problem:
  across many separately-scanned bills, the same product can come out
  with slightly different OCR spelling each time. This screen lists
  every distinct name seen so far; the user ticks the wrong ones,
  leaves one as the reference, and Correct rewrites the ticked ones to
  match — across every past scan, not just one bill.

  Requires the scan-bill Edge Function to be deployed (see setup notes
  in supabase/functions/scan-bill/index.ts) and schema-additions.sql's
  bill_scans/bill_scan_items tables to be run.
*/

const TOKENS = {
  ink: "#122A4E", inkDeep: "#0A1930", paper: "#DCE4F0", paperDeep: "#FBEED9",
  saffron: "#D9A231", saffronDeep: "#B87F15", stamp: "#1E7A4C", due: "#C2392F",
  line: "#D3D9E3", slate: "#516072", blue: "#2E5FA3",
};
const money = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;

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
function Card({ children, className = "" }) {
  return <div className={`rounded-2xl ${className}`} style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>{children}</div>;
}

// Set this to your deployed function URL, e.g.
// https://dcifigxehnwcjnrrkjib.supabase.co/functions/v1/scan-bill
const SCAN_FUNCTION_URL = "";

export default function BonikBillScanScreen() {
  const { businessId, memberId } = useSession();
  const [screen, setScreen] = useState("list"); // list | review | cleanup
  const [scans, setScans] = useState([]);
  const [scansLoading, setScansLoading] = useState(true);

  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [reviewItems, setReviewItems] = useState([]); // [{ name, quantity, rate, amount }]
  const [saving, setSaving] = useState(false);

  const loadScans = useCallback(async () => {
    if (!businessId) return;
    setScansLoading(true);
    const { data } = await supabase.from("bill_scans").select("*, items:bill_scan_items(*)").eq("business_id", businessId).order("created_at", { ascending: false });
    setScans(data || []);
    setScansLoading(false);
  }, [businessId]);

  useEffect(() => { loadScans(); }, [loadScans]);

  const startScan = async (file) => {
    if (!file || !businessId) return;
    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setScanning(true);
    setScanError("");
    try {
      const imageUrl = await uploadImageToCloudinary(file);
      if (!SCAN_FUNCTION_URL) throw new Error("scan-bill function URL isn't set yet — see the note at the top of BillScanScreen.jsx");
      const res = await fetch(SCAN_FUNCTION_URL, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ imageUrl }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const items = (data.items || []).map((it) => ({ name: it.name || "", quantity: it.quantity ?? "", rate: it.rate ?? "", amount: it.amount ?? "" }));
      setReviewItems(items.length ? items : [{ name: "", quantity: "", rate: "", amount: "" }]);
      setScreen("review");
    } catch (e) {
      setScanError(e.message || "Could not read the bill — try a clearer photo, or add items manually below.");
      setReviewItems([{ name: "", quantity: "", rate: "", amount: "" }]);
      setScreen("review");
    } finally {
      setScanning(false);
    }
  };

  const updateItem = (i, field, value) => setReviewItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const removeItem = (i) => setReviewItems((prev) => prev.filter((_, idx) => idx !== i));
  const addItem = () => setReviewItems((prev) => [...prev, { name: "", quantity: "", rate: "", amount: "" }]);

  const saveScan = async () => {
    const validItems = reviewItems.filter((it) => it.name.trim());
    if (!validItems.length || !businessId || !photoFile || saving) return;
    setSaving(true);
    try {
      const imageUrl = await uploadImageToCloudinary(photoFile);
      const { data: scan, error: scanErr } = await supabase.from("bill_scans").insert({
        business_id: businessId, image_url: imageUrl, status: "reviewed", created_by: memberId,
      }).select().single();
      if (scanErr) throw scanErr;

      const rows = validItems.map((it) => ({
        scan_id: scan.id, business_id: businessId, raw_name: it.name, name: it.name,
        quantity: it.quantity === "" ? null : parseFloat(it.quantity),
        rate: it.rate === "" ? null : parseFloat(it.rate),
        amount: it.amount === "" ? null : parseFloat(it.amount),
      }));
      const { error: itemsErr } = await supabase.from("bill_scan_items").insert(rows);
      if (itemsErr) throw itemsErr;

      setPhotoFile(null);
      setPhotoPreview(null);
      setReviewItems([]);
      setScreen("list");
      loadScans();
    } catch (e) {
      setScanError(e.message || "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  // ---------- Cleanup: fix similar/misread names across scans ----------
  if (screen === "cleanup") {
    return <CleanupScreen businessId={businessId} onBack={() => { setScreen("list"); loadScans(); }} />;
  }

  // ---------- Review extracted items before saving ----------
  if (screen === "review") {
    const total = reviewItems.reduce((s, it) => s + (parseFloat(it.amount) || 0), 0);
    return (
      <Shell>
        <button onClick={() => setScreen("list")} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
        <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Review Bill</h2>
        <p className="font-mono text-[11px] mb-5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Check and fix before saving — nothing's saved yet</p>

        {photoPreview && <img src={photoPreview} alt="" className="w-full rounded-2xl mb-5 max-h-48 object-cover" />}
        {scanning && <div className="text-center py-6 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.6 }}>Reading the bill…</div>}
        {scanError && <div className="mb-4 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: "#FDECEC", color: TOKENS.due }}>{scanError}</div>}

        <div className="space-y-2 mb-4">
          {reviewItems.map((it, i) => (
            <Card key={i} className="px-3.5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <input value={it.name} onChange={(e) => updateItem(i, "name", e.target.value)} placeholder="Item name"
                  className="flex-1 bg-transparent border-0 border-b-2 pb-1 text-[13px] font-sans outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                <button onClick={() => removeItem(i)}><Trash2 size={14} color={TOKENS.due} /></button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <input value={it.quantity} onChange={(e) => updateItem(i, "quantity", e.target.value)} type="number" placeholder="Qty"
                  className="bg-transparent border-0 border-b-2 pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                <input value={it.rate} onChange={(e) => updateItem(i, "rate", e.target.value)} type="number" placeholder="Rate"
                  className="bg-transparent border-0 border-b-2 pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.line, color: TOKENS.inkDeep }} />
                <input value={it.amount} onChange={(e) => updateItem(i, "amount", e.target.value)} type="number" placeholder="Amount"
                  className="bg-transparent border-0 border-b-2 pb-1 text-[12px] font-mono outline-none" style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }} />
              </div>
            </Card>
          ))}
        </div>
        <button onClick={addItem} className="w-full py-2.5 rounded-2xl border-2 border-dashed font-mono text-xs mb-5" style={{ borderColor: TOKENS.saffron, color: TOKENS.saffronDeep }}>
          + Add row
        </button>

        <div className="flex items-center justify-between mb-6 px-1">
          <span className="font-mono text-[11px] uppercase" style={{ color: TOKENS.ink, opacity: 0.72 }}>Total</span>
          <span className="font-display font-bold text-lg tabular-nums" style={{ color: TOKENS.inkDeep }}>{money(total)}</span>
        </div>

        <button disabled={saving || !reviewItems.some((it) => it.name.trim())} onClick={saveScan}
          className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
          {saving ? "Saving…" : "Save Bill"}
        </button>
      </Shell>
    );
  }

  // ---------- List of past scans ----------
  return (
    <Shell>
      <div className="font-display font-bold text-lg mb-1" style={{ color: TOKENS.ink }}>Bill Scan</div>
      <div className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Photo a bill, review the numbers, save</div>

      <label className="w-full py-8 rounded-2xl border-2 border-dashed flex flex-col items-center gap-2 mb-4 cursor-pointer" style={{ borderColor: TOKENS.saffron }}>
        <Camera size={22} color={TOKENS.saffronDeep} />
        <span className="font-display font-semibold text-sm" style={{ color: TOKENS.saffronDeep }}>{scanning ? "Reading…" : "Take or Upload a Photo"}</span>
        <input type="file" accept="image/*" capture="environment" className="hidden" disabled={scanning} onChange={(e) => e.target.files?.[0] && startScan(e.target.files[0])} />
      </label>

      <button onClick={() => setScreen("cleanup")} className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl mb-6" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
        <div className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0" style={{ background: TOKENS.paperDeep }}><Sparkles size={16} color={TOKENS.saffronDeep} /></div>
        <div className="flex-1 text-left">
          <div className="font-display font-semibold text-[13.5px]" style={{ color: TOKENS.inkDeep }}>Fix Similar Names</div>
          <div className="font-mono text-[10px] mt-0.5" style={{ color: TOKENS.ink, opacity: 0.68 }}>Correct OCR misreads across all scans</div>
        </div>
        <ChevronRight size={15} color={TOKENS.ink} style={{ opacity: 0.55 }} />
      </button>

      <div className="font-mono text-[11px] uppercase tracking-widest mb-3" style={{ color: TOKENS.ink, opacity: 0.72 }}>Past Scans</div>
      {scansLoading ? (
        <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>
      ) : scans.length === 0 ? (
        <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No bills scanned yet</div>
      ) : (
        <div className="space-y-2">
          {scans.map((s) => (
            <Card key={s.id} className="px-3.5 py-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.68 }}>{new Date(s.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}</span>
                <span className="font-display font-bold text-sm tabular-nums" style={{ color: TOKENS.inkDeep }}>{money((s.items || []).reduce((sum, it) => sum + Number(it.amount || 0), 0))}</span>
              </div>
              <div className="font-sans text-[12px]" style={{ color: TOKENS.ink, opacity: 0.75 }}>{(s.items || []).map((it) => it.name).join(", ")}</div>
            </Card>
          ))}
        </div>
      )}
    </Shell>
  );
}

// ---------------------------------------------------------------------
// Fix Similar Names: flat list of every distinct item name seen across
// this business's scans (with how many times each appears). User ticks
// the wrong ones, picks the reference spelling, hits Correct — every
// ticked bill_scan_items row (in ANY past scan) gets renamed to match.
// ---------------------------------------------------------------------
function CleanupScreen({ businessId, onBack }) {
  const [names, setNames] = useState([]); // [{ name, count }]
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState({}); // { name: true }
  const [referenceName, setReferenceName] = useState("");
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const { data } = await supabase.from("bill_scan_items").select("name").eq("business_id", businessId);
    const counts = {};
    (data || []).forEach((r) => { counts[r.name] = (counts[r.name] || 0) + 1; });
    setNames(Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count));
    setLoading(false);
  }, [businessId]);

  useEffect(() => { load(); }, [load]);

  const toggle = (name) => {
    setSelected((prev) => {
      const next = { ...prev, [name]: !prev[name] };
      if (!referenceName && next[name]) setReferenceName(name);
      return next;
    });
  };

  const selectedNames = Object.keys(selected).filter((n) => selected[n]);
  const canApply = selectedNames.length >= 1 && referenceName.trim();

  const applyCorrect = async () => {
    if (!canApply || applying) return;
    setApplying(true);
    setMessage("");
    const toFix = selectedNames.filter((n) => n !== referenceName);
    try {
      for (const wrongName of toFix) {
        await supabase.from("bill_scan_items").update({ name: referenceName.trim() }).eq("business_id", businessId).eq("name", wrongName);
      }
      setMessage(`Corrected ${toFix.length} name${toFix.length !== 1 ? "s" : ""} to "${referenceName.trim()}"`);
      setSelected({});
      load();
    } catch (e) {
      setMessage(e.message || "Could not apply correction.");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Shell>
      <button onClick={onBack} className="font-mono text-xs mb-6 flex items-center gap-1" style={{ color: TOKENS.ink, opacity: 0.68 }}><ArrowLeft size={13} /> back</button>
      <h2 className="font-display font-semibold text-xl mb-1" style={{ color: TOKENS.inkDeep }}>Fix Similar Names</h2>
      <p className="font-mono text-[11px] mb-6" style={{ color: TOKENS.ink, opacity: 0.68 }}>Tick the ones that are the same item, then pick the correct spelling</p>

      {loading ? (
        <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>Loading…</div>
      ) : names.length === 0 ? (
        <div className="text-center py-10 font-mono text-xs" style={{ color: TOKENS.ink, opacity: 0.58 }}>No scanned items yet</div>
      ) : (
        <div className="space-y-1.5 mb-6">
          {names.map(({ name, count }) => (
            <button key={name} onClick={() => toggle(name)} className="w-full flex items-center justify-between px-3.5 py-3 rounded-2xl" style={{ background: "#FFFFFF", boxShadow: "0 1px 3px rgba(10,25,48,0.08)" }}>
              <div className="flex items-center gap-3">
                <span className="w-5 h-5 rounded-2xl border-2 flex items-center justify-center shrink-0" style={{ borderColor: selected[name] ? TOKENS.stamp : TOKENS.line, background: selected[name] ? TOKENS.stamp : "#FFFFFF" }}>
                  {selected[name] && <Check size={12} color={TOKENS.paper} />}
                </span>
                <span className="font-sans text-[13px] text-left" style={{ color: TOKENS.inkDeep }}>{name}</span>
              </div>
              <span className="font-mono text-[10px]" style={{ color: TOKENS.ink, opacity: 0.58 }}>{count}×</span>
            </button>
          ))}
        </div>
      )}

      {selectedNames.length > 0 && (
        <div className="mb-6">
          <div className="font-mono text-[10px] uppercase tracking-wide mb-1.5" style={{ color: TOKENS.ink, opacity: 0.72 }}>Correct Spelling</div>
          <input value={referenceName} onChange={(e) => setReferenceName(e.target.value)}
            className="w-full bg-transparent border-0 border-b-2 pb-2 text-[15px] font-sans outline-none mb-2" style={{ borderColor: TOKENS.saffron, color: TOKENS.inkDeep }} />
          <div className="font-mono text-[9.5px]" style={{ color: TOKENS.ink, opacity: 0.58 }}>
            {selectedNames.filter((n) => n !== referenceName).length} item name(s) will be renamed to this
          </div>
        </div>
      )}

      {message && <div className="mb-4 px-3 py-2 rounded-xl font-mono text-[11px]" style={{ background: TOKENS.paperDeep, color: TOKENS.stamp }}>{message}</div>}

      <button disabled={!canApply || applying} onClick={applyCorrect} className="w-full py-3.5 rounded-2xl font-display font-semibold text-[15px] disabled:opacity-40" style={{ background: TOKENS.ink, color: TOKENS.paper }}>
        {applying ? "Correcting…" : "Correct"}
      </button>
    </Shell>
  );
}
