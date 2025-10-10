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

// Public Google Sheet CSV (viewer)
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/17oT8mprXy-eANUML4UYEqKFTjBJf9wsdOzfGUC6n73Y/export?format=csv&gid=862366080";

// Softer blue tones for the top chart
const COLORS = {
  spend: "#1f77b4", // mid blue
  impr: "#6baed6",  // light blue
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
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (!m) return new Date(s);
  const [, mm, dd, yyyy] = m;
  return new Date(`${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`);
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

// --------- YlGnBu palette (top-left from your grid) ----------
const YL_GN_BU_STOPS = ["#ffffcc","#c7e9b4","#7fcdbb","#41b6c4","#2c7fb8","#253494"];

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
// piecewise interpolate across the 6 stops
function ylgnbu(p) {
  const stops = YL_GN_BU_STOPS.map(_hexToRgb);
  const n = stops.length - 1;
  const x = Math.min(Math.max(p, 0), 1) * n;
  const i = Math.floor(x);
  const t = x - i;
  if (i >= n) return _rgbToHex(stops[n]);
  return _rgbToHex(_mix(stops[i], stops[i+1], t));
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

  // load data
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(SHEET_CSV, { cache: "no-store" });
        if (!r.ok) throw new Error(`CSV ${r.status}`);
        const text = await r.text();
        const csv = parseCSV(text);
        if (!csv.length) return setRows([]);

        const header = csv[0].map((h) => String(h).trim());
        const idx = (name) =>
          header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

        const cDay = idx("Day"),
          cPub = idx("Publisher Name"),
          cCr = idx("Creative Name"),
          cImp = idx("Impressions"),
          cSpend = idx("Total Spend"),
          cATC = idx("Add To Cart"),
          cSurv = idx("Survey"),
          cPurch = idx("Purchase");

        const parsed = csv.slice(1).map((r) => ({
          date: r[cDay],
          pub: r[cPub] || "Unknown",
          creative: r[cCr] || "Unknown",
          impressions: num(r[cImp]),
          spend: num(r[cSpend]),
          addToCart: num(r[cATC]),
          survey: num(r[cSurv]),
          purchases: num(r[cPurch]),
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
      const p = m.get(r.pub) || { pub: r.pub, spend: 0, impressions: 0, addToCart: 0, survey: 0, purchases: 0 };
      p.spend += r.spend || 0;
      p.impressions += r.impressions || 0;
      p.addToCart += r.addToCart || 0;
      p.survey += r.survey || 0;
      p.purchases += r.purchases || 0;
      m.set(r.pub, p);
    }
    return [...m.values()].map((p) => ({
      ...p,
      cpp: p.spend / Math.max(p.purchases, 1),
      cpatc: p.spend / Math.max(p.addToCart, 1),
      cps: p.spend / Math.max(p.survey, 1),
    }));
  }, [filteredRows]);

  const creativeTotals = useMemo(() => {
    const m = new Map();
    for (const r of filteredRows) {
      const key = r.creative;
      const c = m.get(key) || { creative: r.creative, spend: 0, impressions: 0, addToCart: 0, survey: 0, purchases: 0 };
      c.spend += r.spend || 0;
      c.impressions += r.impressions || 0;
      c.addToCart += r.addToCart || 0;
      c.survey += r.survey || 0;
      c.purchases += r.purchases || 0;
      m.set(key, c);
    }
    return [...m.values()].map((c) => ({
      ...c,
      cpp: c.spend / Math.max(c.purchases, 1),
      cpatc: c.spend / Math.max(c.addToCart, 1),
      cps: c.spend / Math.max(c.survey, 1),
    }));
  }, [filteredRows]);

  // KPIs
  const totalSpend = useMemo(() => filteredRows.reduce((s, r) => s + (r.spend || 0), 0), [filteredRows]);
  const totalImpr  = useMemo(() => filteredRows.reduce((s, r) => s + (r.impressions || 0), 0), [filteredRows]);
  const totalPurch = useMemo(() => filteredRows.reduce((s, r) => s + (r.purchases || 0), 0), [filteredRows]);

  const rowsEmpty = filteredRows.length === 0;

  return (
    <div className="min-h-screen p-6">
      {/* widened container */}
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-4">
            <img src="/brand/myntey.png" alt="Mynt Agency" className="h-8 w-auto md:h-10 select-none" draggable="false" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800">Performance Dashboard</h1>
              <p className="text-xs text-slate-500">
                Range: {minDate && maxDate ? `${minDate.toLocaleDateString()} — ${maxDate.toLocaleDateString()}` : "loading…"}
              </p>
            </div>
          </div>

          {/* Custom date only */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={startDate}
              min={minDate?.toISOString().slice(0, 10)}
              max={maxDate?.toISOString().slice(0, 10)}
              onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            />
            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={endDate}
              min={minDate?.toISOString().slice(0, 10)}
              max={maxDate?.toISOString().slice(0, 10)}
              onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            />
            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="px-3 py-2 text-xs rounded-xl border bg-white shadow-sm"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {rowsEmpty && (
          <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-4 py-3">
            No data in this range. Try clearing the custom dates.
          </div>
        )}

        {/* KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="Total Spend" value={fmtUsd0(totalSpend)} />
          <KPI title="Total Impressions" value={fmtInt(totalImpr)} />
          <KPI title="Total Purchases" value={fmtInt(totalPurch)} />
          <KPI title="Avg CPM" value={`$${((totalSpend / Math.max(totalImpr, 1)) * 1000).toFixed(2)}`} />
        </div>

        {/* Daily chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
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
                <Tooltip />
                <Area yAxisId="left" name="Spend" dataKey="spend" type="monotone" fill="url(#g1)" stroke={COLORS.spend} strokeWidth={2} />
                <Area yAxisId="right" name="Impressions" dataKey="impressions" type="monotone" fill="url(#g2)" stroke={COLORS.impr} strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Heatmaps — STACKED */}
        <div className="grid grid-cols-1 gap-6">
          {/* Publishers */}
          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full">
            <h3 className="text-lg font-semibold mb-2">Publisher Heatmap — Raw Totals</h3>
            <Heatmap
              rows={[...pubTotals]}
              rowKey={(r) => r.pub}
              nameColumnLabel="Publisher"
              metrics={[
                { k: "addToCart", label: "Add To Cart" },
                { k: "survey",    label: "Survey"     },
                { k: "purchases", label: "Purchases"  },
                { k: "cpp",       label: "CPP"        }, // currency
              ]}
              extras={[
                { k: "spend",       label: "Spend", fmt: fmtUsd0 },
                { k: "impressions", label: "Impr",  fmt: fmtInt },
              ]}
            />
          </div>

          {/* Creatives */}
          <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full">
            <h3 className="text-lg font-semibold mb-2">Creative Heatmap — Raw Totals</h3>
            <Heatmap
              rows={[...creativeTotals].slice(0, 40)}
              rowKey={(r, i) => r.creative + ":" + i}
              nameColumnLabel="Creative"
              metrics={[
                { k: "addToCart", label: "Add To Cart" },
                { k: "survey",    label: "Survey"     },
                { k: "purchases", label: "Purchases"  },
                { k: "cpp",       label: "CPP"        },
              ]}
              extras={[
                { k: "spend",       label: "Spend", fmt: fmtUsd0 },
                { k: "impressions", label: "Impr",  fmt: fmtInt },
              ]}
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
    <div className="bg-white rounded-2xl shadow-sm p-5">
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-semibold mt-1 text-slate-900">{value}</div>
    </div>
  );
}

// ---------- Heatmap (sortable, single YlGnBu scale) ----------
function Heatmap({ rows, rowKey, nameColumnLabel, metrics, extras }) {
  const [sortKey, setSortKey] = useState(metrics[0]?.k || extras?.[0]?.k || null);
  const [sortDir, setSortDir] = useState("desc");

  // per-metric max (for normalization)
  const maxByMetric = useMemo(() => {
    const m = {};
    for (const { k } of metrics) m[k] = Math.max(0, ...rows.map((r) => Number(r[k] || 0)));
    return m;
  }, [rows, metrics]);

function blendWithWhite(hex, amt = 0.8) {
  // amt: 0 = no blend, 1 = very white
  const a = _hexToRgb(hex);
  const w = { r: 255, g: 255, b: 255 };
  // mix from white -> base color
  const m = _mix(w, a, 1 - amt);
  return _rgbToHex(m);
}

const colorCell = (value, max) => {
  const v = Number(value || 0);
  const cap = Math.max(1, max || 1);
  let p = Math.min(1, v / cap);

  // Lighter overall: gamma > 1 compresses highs
  const gamma = 1.35;
  p = Math.pow(p, gamma);

  // Base YlGnBu color at intensity p
  const base = ylgnbu(p);

  // Strong blend to white; still varies with p
  // Low values ~85% white, high values ~65% white
  const whiteBlend = 0.85 - 0.20 * p; // range 0.85 → 0.65
  const bg = blendWithWhite(base, whiteBlend);

  // Keep dark text on very light backgrounds
  const textDark = luma(bg) > 0.7;
  return { backgroundColor: bg, color: textDark ? "#0f172a" : "white" };
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
    <div className="w-full">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
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
        <tbody className="divide-y">
          {sortedRows.map((r) => (
            <tr key={rowKey(r)}>
              <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">
                {r.pub || r.creative}
              </td>

              {metrics.map((m) => {
                const isCPP = m.k === "cpp";
                const val = r[m.k];
                return (
                  <td key={m.k} className="py-1 px-1">
                    <div
                      className="rounded-md text-center px-2 py-2 font-medium whitespace-nowrap"
                      style={colorCell(val, maxByMetric[m.k])}
                      title={`${m.label}: ${isCPP ? fmtUsd2(val) : fmtInt(val)}`}
                    >
                      {isCPP ? fmtUsd2(val) : fmtInt(val)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
