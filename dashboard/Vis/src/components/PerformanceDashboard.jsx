// src/components/PerformanceDashboard.jsx
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

const API_BASE = "http://localhost:3001/api";

// ---------- helpers ----------
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

const fmtUsd2 = (n) => {
  const v = Number(n || 0);
  try { return v.toLocaleString(undefined, { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  catch { return `$${(Math.round(v * 100) / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`; }
};

// YlGnBu palette
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
  return (0.2126*r + 0.7152*g + 0.0722*b) / 255;
}

function blendWithWhite(hex, amt = 0.8) {
  const a = _hexToRgb(hex);
  const w = { r: 255, g: 255, b: 255 };
  const m = _mix(w, a, 1 - amt);
  return _rgbToHex(m);
}

// ---------- Main Component ----------
export default function PerformanceDashboard() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState("");
  const [dateRange, setDateRange] = useState({ min_date: null, max_date: null });
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [kpis, setKpis] = useState(null);
  const [stationData, setStationData] = useState([]);
  const [daypartData, setDaypartData] = useState([]);
  const [stationByDaypart, setStationByDaypart] = useState([]);
  const [weeklyTrend, setWeeklyTrend] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load initial data (clients, date range)
  useEffect(() => {
    (async () => {
      try {
        const [clientsRes, rangeRes] = await Promise.all([
          fetch(`${API_BASE}/clients`),
          fetch(`${API_BASE}/date-range`)
        ]);

        const clientsData = await clientsRes.json();
        const rangeData = await rangeRes.json();

        setClients(clientsData);
        setDateRange(rangeData);

        if (clientsData.length > 0) {
          setSelectedClient(clientsData[0]);
        }
      } catch (e) {
        console.error("Failed to load initial data:", e);
      }
    })();
  }, []);

  // Load performance data when filters change
  useEffect(() => {
    if (!selectedClient) return;

    (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({
          client: selectedClient,
          ...(startDate && { start_date: startDate }),
          ...(endDate && { end_date: endDate })
        });

        console.log("Fetching with params:", params.toString());

        const [kpisRes, stationRes, daypartRes, stationDaypartRes, trendRes] = await Promise.all([
          fetch(`${API_BASE}/kpis?${params}`),
          fetch(`${API_BASE}/station-performance?${params}`),
          fetch(`${API_BASE}/daypart-performance?${params}`),
          fetch(`${API_BASE}/station-by-daypart?${params}`),
          fetch(`${API_BASE}/weekly-trend?${params}`)
        ]);

        const [kpisData, stationDataRaw, daypartDataRaw, stationDaypartDataRaw, trendDataRaw] = await Promise.all([
          kpisRes.json(),
          stationRes.json(),
          daypartRes.json(),
          stationDaypartRes.json(),
          trendRes.json()
        ]);

        setKpis(kpisData);
        setStationData(stationDataRaw);
        setDaypartData(daypartDataRaw);
        setStationByDaypart(stationDaypartDataRaw);
        setWeeklyTrend(trendDataRaw);
      } catch (e) {
        console.error("Failed to load performance data:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedClient, startDate, endDate]);

  // Transform station by daypart data for heatmap
  const stationDaypartHeatmap = useMemo(() => {
    const stationMap = new Map();

    for (const row of stationByDaypart) {
      if (!stationMap.has(row.station)) {
        stationMap.set(row.station, {
          station: row.station,
          total_cost: 0,
          total_sales: 0,
          total_responses: 0,
        });
      }

      const station = stationMap.get(row.station);
      station[row.daypart] = Number(row.cost_per_sale) || 0;
      station.total_cost += Number(row.total_cost) || 0;
      station.total_sales += Number(row.total_sales) || 0;
      station.total_responses += Number(row.total_responses) || 0;
    }

    return Array.from(stationMap.values())
      .map(s => ({
        ...s,
        avg_cost_per_sale: s.total_sales > 0 ? s.total_cost / s.total_sales : null
      }))
      .sort((a, b) => b.total_cost - a.total_cost);
  }, [stationByDaypart]);

  // Get unique dayparts for heatmap columns
  const dayparts = useMemo(() => {
    const parts = new Set(stationByDaypart.map(r => r.daypart));
    return ["Daytime", "Prime", "Late Fringe", "Overnight", "Early Morning"].filter(d => parts.has(d));
  }, [stationByDaypart]);

  if (loading && !kpis) {
    return (
      <div className="min-h-screen p-6 flex items-center justify-center">
        <div className="text-xl text-slate-600">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-4">
            <img src="/brand/myntey.png" alt="Mynt Agency" className="h-8 w-auto md:h-10 select-none" draggable="false" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800">Performance Dashboard</h1>
              <p className="text-xs text-slate-500">
                Client: {selectedClient} | Range: {dateRange.min_date} — {dateRange.max_date}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <select
              value={selectedClient}
              onChange={(e) => setSelectedClient(e.target.value)}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            >
              {clients.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>

            <label className="text-xs text-slate-500">From</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                console.log("Start date changed to:", e.target.value);
                setStartDate(e.target.value);
              }}
              min={dateRange.min_date || ""}
              max={dateRange.max_date || ""}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            />

            <label className="text-xs text-slate-500">To</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                console.log("End date changed to:", e.target.value);
                setEndDate(e.target.value);
              }}
              min={dateRange.min_date || ""}
              max={dateRange.max_date || ""}
              className="border rounded-xl px-3 py-2 text-sm bg-white shadow-sm"
            />

            {(startDate || endDate) && (
              <button
                onClick={() => { setStartDate(""); setEndDate(""); }}
                className="px-3 py-2 text-xs rounded-xl border bg-white shadow-sm hover:bg-slate-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* KPIs */}
        {kpis && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <KPI title="Total Cost" value={fmtUsd0(kpis.total_cost)} />
            <KPI title="Total Sales" value={fmtInt(kpis.total_sales)} />
            <KPI title="Total Responses" value={fmtInt(kpis.total_responses)} />
            <KPI title="Avg Cost per Sale" value={kpis.avg_cost_per_sale ? fmtUsd2(kpis.avg_cost_per_sale) : "N/A"} highlight />
            <KPI title="Total Impressions" value={fmtInt(kpis.total_impressions)} />
          </div>
        )}

        {/* Weekly Trend Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-2">Weekly Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyTrend}>
                <defs>
                  <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#2c7fb8" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#2c7fb8" stopOpacity={0.06} />
                  </linearGradient>
                  <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#41b6c4" stopOpacity={0.30} />
                    <stop offset="100%" stopColor="#41b6c4" stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="week_of" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area yAxisId="left" name="Cost" dataKey="total_cost" type="monotone" fill="url(#costGrad)" stroke="#2c7fb8" strokeWidth={2} />
                <Area yAxisId="right" name="Sales" dataKey="total_sales" type="monotone" fill="url(#salesGrad)" stroke="#41b6c4" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Station Performance Heatmap */}
        <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
          <h3 className="text-lg font-semibold mb-3">Station Performance</h3>
          <Heatmap
            rows={stationData.slice(0, 30)}
            rowKey={(r) => r.station}
            nameColumnLabel="Station"
            metrics={[
              { k: "total_sales", label: "Sales" },
              { k: "total_responses", label: "Responses" },
              { k: "cost_per_sale", label: "Cost per Sale", isCurrency: true },
              { k: "cost_per_response", label: "CPR", isCurrency: true },
            ]}
            extras={[
              { k: "total_cost", label: "Total Cost", fmt: fmtUsd0 },
              { k: "total_impressions", label: "Impressions", fmt: fmtInt },
            ]}
          />
        </div>

        {/* Daypart Performance Heatmap */}
        <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
          <h3 className="text-lg font-semibold mb-3">Daypart Performance</h3>
          <Heatmap
            rows={daypartData}
            rowKey={(r) => r.daypart}
            nameColumnLabel="Daypart"
            metrics={[
              { k: "total_sales", label: "Sales" },
              { k: "total_responses", label: "Responses" },
              { k: "cost_per_sale", label: "Cost per Sale", isCurrency: true },
              { k: "cost_per_response", label: "CPR", isCurrency: true },
            ]}
            extras={[
              { k: "total_cost", label: "Total Cost", fmt: fmtUsd0 },
              { k: "total_impressions", label: "Impressions", fmt: fmtInt },
            ]}
          />
        </div>

        {/* Station by Daypart Heatmap */}
        <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto">
          <h3 className="text-lg font-semibold mb-3">Station by Daypart — Cost per Sale</h3>
          <StationDaypartHeatmap rows={stationDaypartHeatmap.slice(0, 25)} dayparts={dayparts} />
        </div>
      </div>
    </div>
  );
}

// KPI Card
function KPI({ title, value, highlight = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm p-5 ${highlight ? 'ring-2 ring-blue-400' : ''}`}>
      <div className="text-sm text-gray-500">{title}</div>
      <div className="text-3xl font-semibold mt-1 text-slate-900">{value}</div>
    </div>
  );
}

// Generic Heatmap Component
function Heatmap({ rows, rowKey, nameColumnLabel, metrics, extras }) {
  const [sortKey, setSortKey] = useState(metrics[0]?.k || extras?.[0]?.k || null);
  const [sortDir, setSortDir] = useState("desc");

  const maxByMetric = useMemo(() => {
    const m = {};
    for (const { k } of metrics) {
      m[k] = Math.max(0, ...rows.map((r) => Number(r[k] || 0)));
    }
    return m;
  }, [rows, metrics]);

  const colorCell = (value, max, isCurrency = false) => {
    const v = Number(value || 0);
    if (v === 0 || max === 0) return { backgroundColor: "#f8f9fa", color: "#0f172a" };

    const cap = Math.max(1, max || 1);
    let p = Math.min(1, v / cap);

    const gamma = 1.35;
    p = Math.pow(p, gamma);

    const base = ylgnbu(p);
    const whiteBlend = 0.85 - 0.20 * p;
    const bg = blendWithWhite(base, whiteBlend);

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
                {r.station || r.daypart || r.creative}
              </td>

              {metrics.map((m) => {
                const val = r[m.k];
                const displayVal = m.isCurrency ? fmtUsd2(val) : fmtInt(val);
                return (
                  <td key={m.k} className="py-1 px-1">
                    <div
                      className="rounded-md text-center px-2 py-2 font-medium whitespace-nowrap"
                      style={colorCell(val, maxByMetric[m.k], m.isCurrency)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Station by Daypart Heatmap
function StationDaypartHeatmap({ rows, dayparts }) {
  const [sortKey, setSortKey] = useState("total_cost");
  const [sortDir, setSortDir] = useState("desc");

  const maxByDaypart = useMemo(() => {
    const m = {};
    for (const dp of dayparts) {
      m[dp] = Math.max(0, ...rows.map(r => Number(r[dp] || 0)));
    }
    return m;
  }, [rows, dayparts]);

  const colorCell = (value, max) => {
    const v = Number(value || 0);
    if (v === 0 || max === 0 || !value) return { backgroundColor: "#f8f9fa", color: "#94a3b8" };

    const cap = Math.max(1, max);
    let p = Math.min(1, v / cap);
    const gamma = 1.35;
    p = Math.pow(p, gamma);

    const base = ylgnbu(p);
    const whiteBlend = 0.85 - 0.20 * p;
    const bg = blendWithWhite(base, whiteBlend);
    const textDark = luma(bg) > 0.7;

    return { backgroundColor: bg, color: textDark ? "#0f172a" : "white" };
  };

  const sortedRows = useMemo(() => {
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
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 pr-4 w-32 sticky left-0 bg-white z-10">Station</th>
            {dayparts.map(dp => (
              <th key={dp} className="py-2 px-2 text-center">{dp}</th>
            ))}
            <th
              className="py-2 px-2 text-right cursor-pointer select-none"
              onClick={() => onHeaderClick("avg_cost_per_sale")}
              title="Sort by Avg Cost/Sale"
            >
              Avg CPS{sortIndicator("avg_cost_per_sale")}
            </th>
            <th
              className="py-2 px-2 text-right cursor-pointer select-none"
              onClick={() => onHeaderClick("total_cost")}
              title="Sort by Total Cost"
            >
              Total Cost{sortIndicator("total_cost")}
            </th>
            <th
              className="py-2 px-2 text-right cursor-pointer select-none"
              onClick={() => onHeaderClick("total_sales")}
              title="Sort by Total Sales"
            >
              Sales{sortIndicator("total_sales")}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {sortedRows.map((r) => (
            <tr key={r.station}>
              <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap sticky left-0 bg-white">
                {r.station}
              </td>
              {dayparts.map(dp => (
                <td key={dp} className="py-1 px-1">
                  <div
                    className="rounded-md text-center px-2 py-2 font-medium whitespace-nowrap text-xs"
                    style={colorCell(r[dp], maxByDaypart[dp])}
                    title={r[dp] ? fmtUsd2(r[dp]) : "No data"}
                  >
                    {r[dp] ? fmtUsd2(r[dp]) : "—"}
                  </div>
                </td>
              ))}
              <td className="py-2 px-2 text-right whitespace-nowrap text-xs">
                {r.avg_cost_per_sale ? fmtUsd2(r.avg_cost_per_sale) : "—"}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap text-xs">
                {fmtUsd0(r.total_cost)}
              </td>
              <td className="py-2 px-2 text-right whitespace-nowrap text-xs">
                {fmtInt(r.total_sales)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
