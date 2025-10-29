// src/components/ConversionDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

// Everyday Dose Google Sheet CSV export
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/1F99B8A4BUH4KIBfmyZgXzMxaFuIBQ3REaZJVgRYEttw/export?format=csv&gid=0";

// Video mapping - EXACT creative name matches only (no auto-matching)
// Add your creative names EXACTLY as they appear in your Google Sheet
// Videos are hosted on Vercel Blob Storage
const VIDEO_MAP = {
  "CTV_Ben_DoseStories_10.9_MA": "https://5fabelv9kxxsxxko.public.blob.vercel-storage.com/videos/CTV_DoseStories_Ben.mp4",
  "CTV_CoffeeUpgrade_10.9_MA": "https://5fabelv9kxxsxxko.public.blob.vercel-storage.com/videos/CTV_coffeeupgrade.mp4",
  "CTV_Jack_Rudi_10.9_MA": "https://5fabelv9kxxsxxko.public.blob.vercel-storage.com/videos/JACK%20CTV%20%28RUDI%29.mov",
  "CTV_Mike_LetMeGuess_10.9_MA": "https://5fabelv9kxxsxxko.public.blob.vercel-storage.com/videos/CTV_Mike_letmeguess.mov",
  "EVERYDAY DOSE WIDE 30 H264_BEN_1": "https://5fabelv9kxxsxxko.public.blob.vercel-storage.com/videos/EVERYDAY%20DOSE%20WIDE%2030%20H264-compressed.mp4",
};

// Publisher/Station image mapping - flexible matching
// Maps keywords to image files (case-insensitive, partial match)
const PUBLISHER_IMAGE_MAP = {
  "roku": "Roku.png",
  "paramount": "Paramount.png",
  "samsung": "Samsung.png",
  "tubi": "Tubi.png",
};

// Helper function to find video for a creative name (EXACT MATCH ONLY)
function getVideoForCreative(creativeName) {
  if (!creativeName) return null;
  const name = String(creativeName).trim();

  // Only exact matches - no fuzzy matching
  return VIDEO_MAP[name] || null;
}

// Helper function to find image for a publisher name (SMART MATCHING)
function getImageForPublisher(publisherName) {
  if (!publisherName) return null;
  const name = String(publisherName).trim().toLowerCase();

  // Check if publisher name contains any of our keywords
  for (const [keyword, imageFile] of Object.entries(PUBLISHER_IMAGE_MAP)) {
    if (name.includes(keyword)) {
      return imageFile;
    }
  }

  return null;
}

// Chart colors - distinct and matches dashboard theme
const COLORS = {
  spend: "#1f77b4",  // blue for spend
  impr: "#A78BFA",   // purple for impressions (matches dashboard gradient)
};

// ---------- helpers ----------
const num = (v) => Number(String(v ?? 0).replace(/[$,]/g, "")) || 0;

const fmtInt = (n) => {
  const v = Number(n || 0);
  try { return v.toLocaleString(); }
  catch { return String(Math.round(v)); }
};
const fmtUsd0 = (n) => {
  const v = Number(n || 0);
  try { return v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }); }
  catch { return `$${Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`; }
};
// CPP: fixed 2 decimals
const fmtUsd2 = (n) => {
  const v = Number(n || 0);
  try { return v.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { return `$${(Math.round(v * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`; }
};

function parseMDY(mdy) {
  if (!mdy) return null;
  const s = String(mdy).trim();

  // Try M/D/YYYY or MM/DD/YYYY format (from Google Sheets)
  const mdyMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (mdyMatch) {
    const [, mm, dd, yyyy] = mdyMatch;
    // Create date at noon UTC to avoid timezone issues
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0));
  }

  // Try YYYY-MM-DD format (from HTML5 date inputs)
  const isoMatch = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const [, yyyy, mm, dd] = isoMatch;
    // Create date at noon UTC to avoid timezone issues
    return new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd), 12, 0, 0));
  }

  // Fallback for other formats
  return new Date(s);
}

function parseCSV(text) {
  const rows = [];
  let row = [], cell = "", inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') inQ = !inQ;
    else if (c === "," && !inQ) { row.push(cell); cell = ""; }
    else if ((c === "\n" || c === "\r") && !inQ) {
      if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
      row = []; cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length && r.some((x) => String(x).trim() !== ""));
}

// --------- Color scales for heatmaps ----------
const SPEND_SCALE = ["#F5F3FF", "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#7C3AED"];
const CONVERSIONS_SCALE = ["#ECFEFF", "#CFFAFE", "#A5F3FC", "#67E8F9", "#22D3EE", "#06B6D4"];
const REVENUE_SCALE = ["#F0FDF4", "#DCFCE7", "#A7F3D0", "#6EE7B7", "#34D399", "#059669"];
const IMPRESSIONS_SCALE = ["#F5F3FF", "#EDE9FE", "#DDD6FE", "#C4B5FD", "#A78BFA", "#7C3AED"];
const CPC_SCALE = ["#D1FAE5", "#A7F3D0", "#6EE7B7", "#FEF3C7", "#FCA5A5", "#EF4444"]; // Green (low/good) to Red (high/bad)

// ROAS diverging scale (low → neutral → high)
const ROAS_LOW = ["#FDE2E7", "#F9A8C7", "#EC4899"];
const ROAS_NEUTRAL = "#FFF7ED";
const ROAS_HIGH = ["#D1FAE5", "#34D399", "#16A34A"];

function _hexToRgb(h) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h);
  return m ? { r: parseInt(m[1],16), g: parseInt(m[2],16), b: parseInt(m[3],16) } : {r:255,g:255,b:255};
}
function _mix(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}
function _rgbToHex({r,g,b}) {
  const s = (v) => v.toString(16).padStart(2,"0");
  return `#${s(r)}${s(g)}${s(b)}`;
}
// Generic function to interpolate across any color scale
function interpolateScale(p, scale) {
  const stops = scale.map(_hexToRgb);
  const n = stops.length - 1;
  const x = Math.min(Math.max(p, 0), 1) * n;
  const i = Math.floor(x);
  const t = x - i;
  if (i >= n) return _rgbToHex(stops[n]);
  return _rgbToHex(_mix(stops[i], stops[i+1], t));
}

// ROAS diverging scale (centered at 1.0)
function roasColor(roasValue) {
  if (roasValue < 0.5) {
    // Very low ROAS: darkest red
    return ROAS_LOW[2];
  } else if (roasValue < 0.8) {
    // Low ROAS: interpolate in low range
    const p = (roasValue - 0.5) / 0.3; // 0.5-0.8 → 0-1
    return interpolateScale(p, ROAS_LOW);
  } else if (roasValue < 1.2) {
    // Near 1.0: neutral
    return ROAS_NEUTRAL;
  } else if (roasValue < 2.0) {
    // Good ROAS: interpolate in high range
    const p = (roasValue - 1.2) / 0.8; // 1.2-2.0 → 0-1
    return interpolateScale(p, ROAS_HIGH);
  } else {
    // Excellent ROAS: darkest green
    return ROAS_HIGH[2];
  }
}
function luma(hex) {
  const {r,g,b} = _hexToRgb(hex);
  return (0.2126*r + 0.7152*g + 0.0722*b) / 255; // 0..1
}

// ---------- component ----------
export default function ConversionDashboard() {
  const [rows, setRows] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [multiplier, setMultiplier] = useState(1);

  // load data
  useEffect(() => {
    (async () => {
      try {
        // Fetch from backend API for private sheet access
        const r = await fetch('/api/sheet-data', { cache: "no-store" });
        if (!r.ok) throw new Error(`API ${r.status}`);
        const json = await r.json();
        const text = json.data;
        const csv = parseCSV(text);
        if (!csv.length) return setRows([]);

        const header = csv[0].map((h) => String(h).trim());
        const idx = (name) =>
          header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

        const cDay = idx("Date"),
          cPub = idx("Publisher Name"),
          cCr = idx("Creative Name"),
          cImp = idx("Impressions"),
          cSpend = idx("Total Spend"),
          cConv = idx("checkoutcompleted"),
          cRev = idx("Revenue");

        const parsed = csv.slice(1).map((r) => ({
          date: r[cDay],
          pub: r[cPub] || "Unknown",
          creative: r[cCr] || "Unknown",
          impressions: num(r[cImp]),
          spend: num(r[cSpend]),
          conversions: num(r[cConv]),
          revenue: num(r[cRev]),
        }));

        setRows(parsed);
      } catch (e) {
        console.error("Data load failed:", e);
        setRows([]);
      }
    })();
  }, []);

  // bounds
  const [minDate, maxDate] = useMemo(() => {
    if (!rows.length) return [null, null];
    const ds = rows.map((r) => parseMDY(r.date));
    return [new Date(Math.min(...ds)), new Date(Math.max(...ds))];
  }, [rows]);

  // filter (custom dates only)
  const filteredRows = useMemo(() => {
    if (!rows.length) return [];
    if (startDate && endDate) {
      const s = parseMDY(startDate), e = parseMDY(endDate);
      return rows.filter((r) => {
        const d = parseMDY(r.date);
        return d >= s && d <= e;
      });
    }
    return rows;
  }, [rows, startDate, endDate]);

  // daily chart data
  const daily = useMemo(() => {
    const byDate = new Map();
    for (const r of filteredRows) {
      const d = byDate.get(r.date) || { date: r.date, spend: 0, impressions: 0 };
      d.spend += r.spend || 0;
      d.impressions += r.impressions || 0;
      byDate.set(r.date, d);
    }
    return [...byDate.values()].sort((a, b) => parseMDY(a.date) - parseMDY(b.date));
  }, [filteredRows]);

  // totals
  const pubTotals = useMemo(() => {
    const m = new Map();
    for (const r of filteredRows) {
      const p = m.get(r.pub) || { pub: r.pub, spend: 0, impressions: 0, conversions: 0, revenue: 0 };
      p.spend += r.spend || 0;
      p.impressions += r.impressions || 0;
      p.conversions += (r.conversions || 0) * multiplier;
      p.revenue += (r.revenue || 0) * multiplier;
      m.set(r.pub, p);
    }
    return [...m.values()].map((p) => ({
      ...p,
      cpc: p.spend / Math.max(p.conversions, 1),
      roas: p.revenue / Math.max(p.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  const creativeTotals = useMemo(() => {
    const m = new Map();
    for (const r of filteredRows) {
      const key = r.creative;
      const c = m.get(key) || { creative: r.creative, spend: 0, impressions: 0, conversions: 0, revenue: 0 };
      c.spend += r.spend || 0;
      c.impressions += r.impressions || 0;
      c.conversions += (r.conversions || 0) * multiplier;
      c.revenue += (r.revenue || 0) * multiplier;
      m.set(key, c);
    }
    return [...m.values()].map((c) => ({
      ...c,
      cpc: c.spend / Math.max(c.conversions, 1),
      roas: c.revenue / Math.max(c.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  // KPIs
  const totalSpend = useMemo(() => filteredRows.reduce((s, r) => s + (r.spend || 0), 0), [filteredRows]);
  const totalImpr  = useMemo(() => filteredRows.reduce((s, r) => s + (r.impressions || 0), 0), [filteredRows]);
  const totalConv = useMemo(() => filteredRows.reduce((s, r) => s + ((r.conversions || 0) * multiplier), 0), [filteredRows, multiplier]);
  const totalRev = useMemo(() => filteredRows.reduce((s, r) => s + ((r.revenue || 0) * multiplier), 0), [filteredRows, multiplier]);

  const rowsEmpty = filteredRows.length === 0;

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: `
          radial-gradient(1100px 700px at 85% 12%, #FFFFFFA6, transparent 60%),
          radial-gradient(900px 520px at 80% 88%, #FFFFFF2E, transparent 70%),
          linear-gradient(90deg, #FFF5F8 0%, #FEE5FF 40%, #EDD4FF 75%, #D4C4F6 100%)
        `,
        backgroundAttachment: 'fixed'
      }}
    >
      {/* widened container */}
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 border border-[#E9D5FF]">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-6">
              {/* Everyday Dose Logo */}
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white rounded-xl flex items-center justify-center border-2 border-purple-100 shadow-sm p-2">
                  <img
                    src="/images/everyday-dose-logo.webp"
                    alt="Everyday Dose"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-800">
                    Everyday Dose
                  </h1>
                  <p className="text-sm text-slate-600">Performance Dashboard</p>
                </div>
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-12 bg-gradient-to-b from-transparent via-slate-300 to-transparent"></div>

              {/* Mynt Logo - Horizontal */}
              <div className="flex items-center gap-3">
                <div className="w-24 h-12 bg-white rounded-lg flex items-center justify-center border-2 border-slate-100 shadow-sm px-3 py-2">
                  <img
                    src="/images/mynt-logo.png"
                    alt="Mynt"
                    className="w-full h-full object-contain"
                  />
                </div>
                <div>
                  <p className="text-xs text-slate-500 uppercase tracking-wider">Powered by</p>
                  <p className="text-lg font-bold text-slate-800">Mynt</p>
                </div>
              </div>
            </div>

            {/* Date Range Info */}
            <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl border border-purple-100">
              <svg className="w-4 h-4 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm text-slate-700 font-medium">
                {minDate && maxDate ? `${minDate.toLocaleDateString()} — ${maxDate.toLocaleDateString()}` : "loading…"}
              </p>
            </div>
          </div>

          {/* Filters Row */}
          <div className="mt-4 pt-4 border-t border-slate-200 flex flex-wrap items-center gap-4">
            {/* Advanced Attribution Multiplier control */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl">
              <label className="text-xs text-slate-600 font-medium whitespace-nowrap">Advanced Attribution Multiplier</label>
              <input
                type="number"
                step="0.1"
                min="0"
                max="10"
                value={multiplier}
                onChange={(e) => setMultiplier(parseFloat(e.target.value) || 0)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm w-20 focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
              />
            </div>

            {/* Date filters */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 rounded-xl">
              <label className="text-xs text-slate-600 font-medium">From</label>
              <input
                type="date"
                value={startDate}
                min={minDate?.toISOString().slice(0, 10)}
                max={maxDate?.toISOString().slice(0, 10)}
                onChange={(e) => setStartDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
              />
              <label className="text-xs text-slate-600 font-medium">To</label>
              <input
                type="date"
                value={endDate}
                min={minDate?.toISOString().slice(0, 10)}
                max={maxDate?.toISOString().slice(0, 10)}
                onChange={(e) => setEndDate(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white shadow-sm focus:border-purple-400 focus:ring-2 focus:ring-purple-100 outline-none transition-all"
              />
              {(startDate || endDate) && (
                <button
                  onClick={() => { setStartDate(""); setEndDate(""); }}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-300 bg-white shadow-sm hover:bg-red-50 hover:border-red-300 hover:text-red-700 transition-all"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {rowsEmpty && (
          <div className="bg-white/90 border border-white/50 text-amber-800 rounded-xl px-4 py-3 backdrop-blur-sm">
            No data in this range. Try clearing the custom dates.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPI title="Total Spend" value={fmtUsd0(totalSpend)} />
          <KPI title="Total Revenue" value={fmtUsd0(totalRev)} />
          <KPI title="Conversions" value={fmtInt(totalConv)} />
          <KPI title="ROAS" value={`${(totalRev / Math.max(totalSpend, 1)).toFixed(2)}x`} />
          <KPI title="Avg CPP" value={fmtUsd2(totalSpend / Math.max(totalConv, 1))} />
        </div>

        {/* Daily chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5 border border-[#E9D5FF]">
          <h3 className="text-lg font-semibold mb-2">Daily Spend & Impressions</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.spend} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={COLORS.spend} stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="g2" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.impr} stopOpacity={0.30} />
                    <stop offset="100%" stopColor={COLORS.impr} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value, name) => {
                  if (name === "Spend") return fmtUsd0(value);
                  if (name === "Impressions") return fmtInt(value);
                  return value;
                }} />
                <Area yAxisId="left" name="Spend" dataKey="spend" type="monotone" fill="url(#g1)" stroke={COLORS.spend} strokeWidth={2} />
                <Area yAxisId="right" name="Impressions" dataKey="impressions" type="monotone" fill="url(#g2)" stroke={COLORS.impr} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmaps — STACKED */}
        <div className="grid grid-cols-1 gap-6">
          {/* Publishers */}
          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
            <h3 className="text-lg font-semibold mb-2">Publisher Heatmap — Raw Totals</h3>
            <Heatmap
              rows={[...pubTotals]}
              rowKey={(r) => r.pub}
              nameColumnLabel="Publisher"
              showPublisherImages={true}
              metrics={[
                { k: "spend",       label: "Spend"       },
                { k: "conversions", label: "Conversions" },
                { k: "cpc",         label: "Cost Per Conversion" },
                { k: "revenue",     label: "Revenue"     },
                { k: "roas",        label: "ROAS"        },
                { k: "impressions", label: "Impressions" },
              ]}
              extras={[]}
            />
          </div>

          {/* Creatives */}
          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
            <h3 className="text-lg font-semibold mb-2">Creative Heatmap — Raw Totals</h3>
            <Heatmap
              rows={[...creativeTotals].slice(0, 40)}
              rowKey={(r, i) => r.creative + ":" + i}
              nameColumnLabel="Creative"
              showVideos={true}
              metrics={[
                { k: "spend",       label: "Spend"       },
                { k: "conversions", label: "Conversions" },
                { k: "cpc",         label: "Cost Per Conversion" },
                { k: "revenue",     label: "Revenue"     },
                { k: "roas",        label: "ROAS"        },
                { k: "impressions", label: "Impressions" },
              ]}
              extras={[]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// KPI card
function KPI({ title, value }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm p-5 border border-[#E9D5FF]">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-semibold mt-1 text-[#0F172A]">{value}</div>
    </div>
  );
}

// Video Modal Component
function VideoModal({ videoUrl, onClose }) {
  if (!videoUrl) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <div
        className="relative bg-black rounded-lg max-w-4xl w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute -top-10 right-0 text-white text-2xl font-bold hover:text-gray-300"
        >
          ✕
        </button>
        <video
          controls
          autoPlay
          className="w-full rounded-lg"
          src={videoUrl}
        >
          Your browser does not support the video tag.
        </video>
      </div>
    </div>
  );
}

// ---------- Heatmap (sortable, single YlGnBu scale) ----------
function Heatmap({ rows, rowKey, nameColumnLabel, metrics, extras, showVideos = false, showPublisherImages = false }) {
  const [sortKey, setSortKey] = useState(metrics[0]?.k || extras?.[0]?.k || null);
  const [sortDir, setSortDir] = useState("desc");
  const [videoUrl, setVideoUrl] = useState(null);

  // per-metric max (for normalization)
  const maxByMetric = useMemo(() => {
    const m = {};
    for (const { k } of metrics) m[k] = Math.max(0, ...rows.map((r) => Number(r[k] || 0)));
    return m;
  }, [rows, metrics]);

const colorCell = (value, max, metricKey) => {
  const v = Number(value || 0);

  // Only apply heatmap colors to conversions, revenue, and cpc
  if (metricKey === "conversions") {
    const cap = Math.max(1, max || 1);
    const p = Math.min(1, v / cap);
    const bg = interpolateScale(p, CONVERSIONS_SCALE);
    const textDark = luma(bg) > 0.6;
    return { backgroundColor: bg, color: textDark ? "#0F172A" : "white" };
  }

  if (metricKey === "revenue") {
    const cap = Math.max(1, max || 1);
    const p = Math.min(1, v / cap);
    const bg = interpolateScale(p, REVENUE_SCALE);
    const textDark = luma(bg) > 0.6;
    return { backgroundColor: bg, color: textDark ? "#0F172A" : "white" };
  }

  if (metricKey === "cpc") {
    // For CPC: LOW is good (green), HIGH is bad (red) - so invert the scale
    const cap = Math.max(1, max || 1);
    const p = Math.min(1, v / cap);
    const invertedP = 1 - p; // Invert so low CPC gets high score (green)
    const bg = interpolateScale(invertedP, CPC_SCALE);
    const textDark = luma(bg) > 0.6;
    return { backgroundColor: bg, color: textDark ? "#0F172A" : "white" };
  }

  // All other metrics: no background color, just dark text
  return { backgroundColor: "transparent", color: "#0F172A" };
};

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    const arr = [...rows];
    arr.sort((a, b) => {
      const av = Number(a[sortKey] ?? 0);
      const bv = Number(b[sortKey] ?? 0);
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return arr;
  }, [rows, sortKey, sortDir]);

  const onHeaderClick = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortIndicator = (key) => (sortKey !== key ? "" : sortDir === "asc" ? " ↑" : " ↓");

  return (
    <>
      <VideoModal videoUrl={videoUrl} onClose={() => setVideoUrl(null)} />
      <div className="w-full">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b border-[#E9D5FF]">
              <th className="py-2 pr-4 w-48">{nameColumnLabel}</th>
              {metrics.map((m) => (
                <th
                  key={m.k}
                  className="py-2 pr-2 text-center cursor-pointer select-none"
                  onClick={() => onHeaderClick(m.k)}
                  title={`Sort by ${m.label}`}
                >
                  {m.label}{sortIndicator(m.k)}
                </th>
              ))}
              {extras?.map((e) => (
                <th
                  key={e.k}
                  className="py-2 px-2 text-right cursor-pointer select-none"
                  onClick={() => onHeaderClick(e.k)}
                  title={`Sort by ${e.label}`}
                >
                  {e.label}{sortIndicator(e.k)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDE9FE]">
            {sortedRows.map((r) => {
              const videoFile = showVideos ? getVideoForCreative(r.creative) : null;
              const publisherImage = showPublisherImages ? getImageForPublisher(r.pub) : null;

              return (
                <tr key={rowKey(r)} className="hover:bg-[#F5F3FF] transition-colors">
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {videoFile && (
                        <div
                          onClick={() => setVideoUrl(videoFile)}
                          className="relative flex-shrink-0 w-20 h-12 rounded-md overflow-hidden cursor-pointer group border border-gray-300 hover:border-blue-400 transition-all bg-gray-100"
                          title="Click to play video"
                        >
                          <video
                            src={videoFile}
                            className="w-full h-full object-cover"
                            preload="metadata"
                            muted
                          />
                        </div>
                      )}
                      {publisherImage && (
                        <div className="flex-shrink-0 w-16 h-10 rounded-md overflow-hidden border border-gray-200 bg-white">
                          <img
                            src={`/images/${publisherImage}`}
                            alt={r.pub}
                            className="w-full h-full object-contain p-1"
                          />
                        </div>
                      )}
                      <span>{r.pub || r.creative}</span>
                    </div>
                  </td>

              {metrics.map((m) => {
                const val = r[m.k];
                let displayVal;

                // Format based on metric type
                if (m.k === "spend" || m.k === "revenue") {
                  displayVal = fmtUsd0(val);
                } else if (m.k === "cpc") {
                  displayVal = fmtUsd2(val);
                } else if (m.k === "roas") {
                  displayVal = `${val.toFixed(2)}x`;
                } else {
                  displayVal = fmtInt(val);
                }
                return (
                  <td key={m.k} className="py-1 px-1">
                    <div
                      className="rounded-md text-center px-2 py-2 font-medium whitespace-nowrap"
                      style={colorCell(val, maxByMetric[m.k], m.k)}
                      title={`${m.label}: ${displayVal}`}
                    >
                      {displayVal}
                    </div>
                  </td>
                );
              })}

                  {extras?.map((e) => (
                    <td key={e.k} className="py-2 px-2 text-right whitespace-nowrap">
                      {e.fmt ? e.fmt(r[e.k]) : fmtInt(r[e.k])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
