// src/components/PerformanceDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  ScatterChart,
  Scatter,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ZAxis,
  Brush,
  ReferenceArea,
} from "recharts";

const API_BASE = "https://api-j82jh1pvm-joseph-zasiebidas-projects.vercel.app/api";

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

const fmtDate = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'numeric', day: 'numeric', year: '2-digit' });
};

// Cyan palette (Mantine colors - light and airy)
const YL_GN_BU_STOPS = ["#e3fafc","#c5f6fa","#99e9f2","#66d9e8","#3bc9db","#22b8cf","#15aabf"];

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
  const [dailyTrend, setDailyTrend] = useState([]);
  const [creativeData, setCreativeData] = useState([]);
  const [loading, setLoading] = useState(true);

  const [selectedStation, setSelectedStation] = useState(null);
  const [stationDetails, setStationDetails] = useState(null);
  const [loadingStationDetails, setLoadingStationDetails] = useState(false);

  const [daypartMetric, setDaypartMetric] = useState('total_sales');
  const [daypartChartType, setDaypartChartType] = useState('bar'); // 'bar' or 'pie'

  const [showAllStations, setShowAllStations] = useState(false);
  const [showIntro, setShowIntro] = useState(true);
  const [videoEnded, setVideoEnded] = useState(false);
  const [showClickHint, setShowClickHint] = useState(() => {
    // Only show hint if user hasn't clicked a station before
    return !localStorage.getItem('stationClicked');
  });
  const [showToggleHint, setShowToggleHint] = useState(() => {
    // Only show toggle hint if user hasn't toggled chart type before
    return !localStorage.getItem('chartToggled');
  });
  const [showBubbleHint, setShowBubbleHint] = useState(() => {
    // Only show bubble hint if user hasn't clicked a bubble before
    return !localStorage.getItem('bubbleClicked');
  });
  const [showBreakdownHint, setShowBreakdownHint] = useState(() => {
    // Only show breakdown hint if user hasn't interacted before
    return !localStorage.getItem('breakdownInteracted');
  });

  // Creative detail modal state
  const [selectedCreative, setSelectedCreative] = useState(null);

  // Bubble chart zoom state
  const [bubbleXDomain, setBubbleXDomain] = useState([0, 1400]); // Total Sales
  const [bubbleYDomain, setBubbleYDomain] = useState([0, 400]);  // Cost Per Sale

  // Custom breakdown state
  const [selectedDimensions, setSelectedDimensions] = useState(['station', 'daypart']);
  const [breakdownData, setBreakdownData] = useState([]);

  // Fetch custom breakdown data when dimensions change
  useEffect(() => {
    if (selectedDimensions.length === 0) {
      setBreakdownData([]);
      return;
    }

    (async () => {
      try {
        const params = new URLSearchParams({
          dimensions: selectedDimensions.join(','),
          ...(selectedClient && { client: selectedClient }),
          ...(startDate && { start_date: startDate }),
          ...(endDate && { end_date: endDate })
        });

        console.log('Fetching custom breakdown with params:', params.toString());

        const res = await fetch(`${API_BASE}/custom-breakdown?${params}`);
        const data = await res.json();
        console.log('Custom breakdown data received:', data.length, 'rows');
        setBreakdownData(data);
      } catch (e) {
        console.error('Breakdown fetch error:', e);
      }
    })();
  }, [selectedDimensions, selectedClient, startDate, endDate]);

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

        const [kpisRes, stationRes, daypartRes, stationDaypartRes, trendRes, creativeRes] = await Promise.all([
          fetch(`${API_BASE}/kpis?${params}`),
          fetch(`${API_BASE}/station-performance?${params}`),
          fetch(`${API_BASE}/daypart-performance?${params}`),
          fetch(`${API_BASE}/station-by-daypart?${params}`),
          fetch(`${API_BASE}/daily-trend?${params}`),
          fetch(`${API_BASE}/creative-performance?${params}`)
        ]);

        const [kpisData, stationDataRaw, daypartDataRaw, stationDaypartDataRaw, trendDataRaw, creativeDataRaw] = await Promise.all([
          kpisRes.json(),
          stationRes.json(),
          daypartRes.json(),
          stationDaypartRes.json(),
          trendRes.json(),
          creativeRes.json()
        ]);

        setKpis(kpisData);
        setStationData(stationDataRaw);
        setDaypartData(daypartDataRaw);
        setStationByDaypart(stationDaypartDataRaw);
        setDailyTrend(trendDataRaw);
        setCreativeData(creativeDataRaw);
      } catch (e) {
        console.error("Failed to load performance data:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [selectedClient, startDate, endDate]);

  // Load station details when a station is selected
  useEffect(() => {
    if (!selectedStation) {
      setStationDetails(null);
      return;
    }

    (async () => {
      setLoadingStationDetails(true);
      try {
        const params = new URLSearchParams({
          client: selectedClient,
          ...(startDate && { start_date: startDate }),
          ...(endDate && { end_date: endDate })
        });

        const res = await fetch(`${API_BASE}/station-details/${encodeURIComponent(selectedStation)}?${params}`);
        const data = await res.json();
        setStationDetails(data);
      } catch (e) {
        console.error("Failed to load station details:", e);
      } finally {
        setLoadingStationDetails(false);
      }
    })();
  }, [selectedStation, selectedClient, startDate, endDate]);

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
    <>
      {/* Intro Video Splash Screen */}
      {showIntro && (
        <div
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          style={{ animation: videoEnded ? 'fadeOut 0.8s ease-out forwards' : 'none' }}
        >
          <div className="relative">
            <video
              autoPlay
              muted
              playsInline
              className="max-w-full max-h-full"
              onEnded={() => {
                setVideoEnded(true);
                setTimeout(() => setShowIntro(false), 800);
              }}
              onClick={() => {
                setVideoEnded(true);
                setTimeout(() => setShowIntro(false), 800);
              }}
            >
              <source src="/intro.mp4" type="video/mp4" />
            </video>
            {/* Skip button positioned to cover bottom right of video */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                setVideoEnded(true);
                setTimeout(() => setShowIntro(false), 800);
              }}
              className="absolute bottom-4 right-4 px-12 py-5 bg-black/70 hover:bg-black/90 text-white rounded-lg backdrop-blur-sm transition-all text-sm font-medium shadow-lg"
            >
              Skip →
            </button>
          </div>
        </div>
      )}

    <div className="min-h-screen p-6 bg-slate-50">
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex items-center gap-4">
            <img src="/brand/myntey.png" alt="Mynt Agency" className="h-8 w-auto md:h-10 select-none" draggable="false" />
            <div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-800">Performance Dashboard</h1>
              <p className="text-xs text-slate-500">
                {selectedClient} | {fmtDate(dateRange.min_date)} — {fmtDate(dateRange.max_date)}
              </p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <KPI title="Total Cost" value={kpis ? fmtUsd0(kpis.total_cost) : "$0"} />
          <KPI title="Total Sales" value={kpis ? fmtInt(kpis.total_sales) : "0"} />
          <KPI title="Total Responses" value={kpis ? fmtInt(kpis.total_responses) : "0"} />
          <KPI title="Avg Cost per Sale" value={kpis?.avg_cost_per_sale ? fmtUsd2(kpis.avg_cost_per_sale) : "N/A"} highlight />
          <KPI title="Total Impressions" value={kpis ? fmtInt(kpis.total_impressions) : "0"} />
        </div>

        {/* Daily Trend Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <h3 className="text-lg font-semibold mb-2">Daily Trend</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyTrend}>
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
                <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={fmtDate} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip labelFormatter={fmtDate} />
                <Area yAxisId="left" name="Cost" dataKey="total_cost" type="monotone" fill="url(#costGrad)" stroke="#2c7fb8" strokeWidth={2} />
                <Area yAxisId="right" name="Sales" dataKey="total_sales" type="monotone" fill="url(#salesGrad)" stroke="#41b6c4" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Station Performance Heatmap */}
        <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto relative">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold">Station Performance</h3>
            {!showAllStations && stationData.length > 10 && (
              <div className="text-sm text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200">
                Showing top 10 of {stationData.length} stations
              </div>
            )}
          </div>

          {/* Click Me Hint - Only shows on first visit */}
          {showClickHint && stationData.length > 0 && (
            <div className="absolute left-4 top-24 z-10 pointer-events-none">
              <div className="relative" style={{ animation: 'wiggle 0.5s ease-in-out infinite' }}>
                <div className="bg-gradient-to-r from-cyan-500 to-cyan-600 text-white px-4 py-2 rounded-lg shadow-lg font-medium">
                  Click on a station for station details
                </div>
                <div className="absolute -right-2 top-1/2 -translate-y-1/2 w-0 h-0 border-t-8 border-b-8 border-l-8 border-transparent border-l-cyan-500"></div>
              </div>
            </div>
          )}

          <Heatmap
            rows={showAllStations ? stationData : stationData.slice(0, 10)}
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
            onRowClick={(row) => {
              setSelectedStation(row.station);
              if (showClickHint) {
                setShowClickHint(false);
                localStorage.setItem('stationClicked', 'true');
              }
            }}
          />
          {stationData.length > 10 && (
            <div className="mt-4 text-center">
              <button
                onClick={() => setShowAllStations(!showAllStations)}
                className="px-6 py-2.5 bg-gradient-to-br from-cyan-500 to-cyan-600 text-white rounded-lg shadow-md hover:shadow-lg transition-all font-medium"
              >
                {showAllStations ? `Show Less` : `Show ${stationData.length - 10} More Stations`}
              </button>
            </div>
          )}
        </div>

        {/* Station Details Modal */}
        {selectedStation && (
          <StationDetailsModal
            station={selectedStation}
            details={stationDetails}
            loading={loadingStationDetails}
            onClose={() => setSelectedStation(null)}
          />
        )}

        {/* Daypart Performance Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-lg font-semibold mb-3">Daypart Performance</h3>
              {/* Metric Toggle */}
              <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setDaypartMetric('total_sales')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'total_sales'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Sales
              </button>
              <button
                onClick={() => setDaypartMetric('total_responses')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'total_responses'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Responses
              </button>
              <button
                onClick={() => setDaypartMetric('cost_per_sale')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'cost_per_sale'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Cost per Sale
              </button>
              <button
                onClick={() => setDaypartMetric('cost_per_response')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'cost_per_response'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                CPR
              </button>
              <button
                onClick={() => setDaypartMetric('total_cost')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'total_cost'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Cost
              </button>
              <button
                onClick={() => setDaypartMetric('total_impressions')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-all ${
                  daypartMetric === 'total_impressions'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Impressions
              </button>
              </div>
            </div>

            {/* Chart Type Toggle - Right Aligned */}
            <div className="flex gap-1 bg-slate-100 p-1.5 rounded-xl relative">
              {/* Toggle Hint - Only shows on first visit */}
              {showToggleHint && (
                <div className="absolute -top-12 right-0 z-10 pointer-events-none">
                  <div className="relative" style={{ animation: 'wiggle 0.5s ease-in-out infinite' }}>
                    <div className="bg-gradient-to-r from-violet-500 to-indigo-500 text-white px-3 py-1.5 rounded-lg shadow-lg text-sm font-medium whitespace-nowrap">
                      Click to toggle chart type
                    </div>
                    <div className="absolute left-1/2 -translate-x-1/2 -bottom-1 w-0 h-0 border-l-6 border-r-6 border-t-6 border-transparent border-t-violet-500"></div>
                  </div>
                </div>
              )}

              <button
                onClick={() => {
                  setDaypartChartType('bar');
                  if (showToggleHint) {
                    setShowToggleHint(false);
                    localStorage.setItem('chartToggled', 'true');
                  }
                }}
                className={`px-5 py-2 text-base font-medium rounded-lg transition-all ${
                  daypartChartType === 'bar'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Bar
              </button>
              <button
                onClick={() => {
                  setDaypartChartType('pie');
                  if (showToggleHint) {
                    setShowToggleHint(false);
                    localStorage.setItem('chartToggled', 'true');
                  }
                }}
                className={`px-5 py-2 text-base font-medium rounded-lg transition-all ${
                  daypartChartType === 'pie'
                    ? 'bg-gradient-to-br from-violet-500 to-indigo-500 text-white shadow-md'
                    : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Pie
              </button>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              {daypartChartType === 'bar' ? (
                <BarChart data={daypartData.filter(d => d.daypart !== 'Overnight')}>
                  <defs>
                    <linearGradient id="barGradient3D" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" stopOpacity={1} />
                      <stop offset="50%" stopColor="#8b5cf6" stopOpacity={0.95} />
                      <stop offset="100%" stopColor="#6366f1" stopOpacity={0.85} />
                    </linearGradient>
                    <filter id="barShadow">
                      <feDropShadow dx="0" dy="4" stdDeviation="3" floodOpacity="0.3"/>
                    </filter>
                  </defs>
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                  <XAxis dataKey="daypart" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={(value) => {
                      if (daypartMetric.includes('cost') || daypartMetric === 'total_cost') {
                        return fmtUsd2(value);
                      }
                      return fmtInt(value);
                    }}
                  />
                  <Bar
                    dataKey={daypartMetric}
                    fill="url(#barGradient3D)"
                    radius={[12, 12, 0, 0]}
                    style={{ filter: 'url(#barShadow)' }}
                  />
                </BarChart>
              ) : (
                <PieChart>
                  <defs>
                    <filter id="pieShadow">
                      <feDropShadow dx="0" dy="6" stdDeviation="4" floodOpacity="0.25"/>
                    </filter>
                    <radialGradient id="pieGradient1">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#8b5cf6" />
                    </radialGradient>
                    <radialGradient id="pieGradient2">
                      <stop offset="0%" stopColor="#9c86f6" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </radialGradient>
                    <radialGradient id="pieGradient3">
                      <stop offset="0%" stopColor="#8b73e8" />
                      <stop offset="100%" stopColor="#6d28d9" />
                    </radialGradient>
                    <radialGradient id="pieGradient4">
                      <stop offset="0%" stopColor="#7c5fd9" />
                      <stop offset="100%" stopColor="#5b21b6" />
                    </radialGradient>
                  </defs>
                  <Pie
                    data={daypartData.filter(d => d.daypart !== 'Overnight').map(d => ({ name: d.daypart, value: Number(d[daypartMetric]) || 0 }))}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={140}
                    innerRadius={60}
                    dataKey="value"
                    style={{ filter: 'url(#pieShadow)' }}
                  >
                    {daypartData.filter(d => d.daypart !== 'Overnight').map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={`url(#pieGradient${(index % 4) + 1})`} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => {
                      if (daypartMetric.includes('cost') || daypartMetric === 'total_cost') {
                        return fmtUsd2(value);
                      }
                      return fmtInt(value);
                    }}
                  />
                  <Legend />
                </PieChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Creative Performance Bubble Chart */}
        <div className="bg-white rounded-2xl shadow-sm p-5 relative">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-lg font-semibold">Creative Performance</h3>
            <button
              onClick={() => {
                setBubbleXDomain([0, 1400]);
                setBubbleYDomain([0, 400]);
              }}
              className="px-3 py-1.5 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
            >
              Reset Zoom
            </button>
          </div>
          <p className="text-sm text-slate-500 mb-4">Bubble size = Total Cost | Top performers are in the top-right (high sales, low cost per sale) | Click a bubble to zoom & see details</p>

          {/* Click Bubble Hint - Only shows on first visit */}
          {showBubbleHint && creativeData.length > 0 && (
            <div className="absolute left-1/2 top-32 z-10 pointer-events-none -translate-x-1/2">
              <div className="relative" style={{ animation: 'wiggle 0.5s ease-in-out infinite' }}>
                <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white px-4 py-2 rounded-lg shadow-lg font-medium whitespace-nowrap">
                  Click a bubble for details & zoom
                </div>
                <div className="absolute left-1/2 -translate-x-1/2 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-orange-500"></div>
              </div>
            </div>
          )}

          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <defs>
                  <linearGradient id="bubbleGradient" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#f59e0b" />
                    <stop offset="100%" stopColor="#d97706" />
                  </linearGradient>
                  <filter id="bubbleShadow">
                    <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.3"/>
                  </filter>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                <XAxis
                  type="number"
                  dataKey="total_sales"
                  name="Total Sales"
                  domain={bubbleXDomain}
                  allowDataOverflow
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  label={{ value: 'Total Sales', position: 'bottom', offset: -5, style: { fontSize: 12, fill: '#64748b' } }}
                />
                <YAxis
                  type="number"
                  dataKey="cost_per_sale"
                  name="Cost Per Sale"
                  domain={bubbleYDomain}
                  allowDataOverflow
                  tick={{ fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(value) => `$${value.toFixed(0)}`}
                  label={{ value: 'Cost Per Sale', angle: -90, position: 'left', offset: 10, style: { fontSize: 12, fill: '#64748b' } }}
                />
                <ZAxis type="number" dataKey="total_cost" range={[100, 2000]} />
                <Tooltip
                  cursor={{ strokeDasharray: '3 3' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200">
                          <p className="font-semibold text-slate-800 mb-2">{data.creative}</p>
                          <p className="text-sm text-slate-600">Cost Per Sale: {fmtUsd2(data.cost_per_sale)}</p>
                          <p className="text-sm text-slate-600">Total Sales: {fmtInt(data.total_sales)}</p>
                          <p className="text-sm text-slate-600">Total Cost: {fmtUsd0(data.total_cost)}</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Scatter
                  data={creativeData}
                  fill="url(#bubbleGradient)"
                  style={{ filter: 'url(#bubbleShadow)' }}
                  onClick={(data) => {
                    if (data && data.payload) {
                      const creative = data.payload;

                      // Dismiss hint on first click
                      if (showBubbleHint) {
                        setShowBubbleHint(false);
                        localStorage.setItem('bubbleClicked', 'true');
                      }

                      // Zoom to center on this creative
                      const xCenter = creative.total_sales;
                      const yCenter = creative.cost_per_sale;

                      // Zoom window size (smaller = more zoomed in)
                      const xWindow = 300;
                      const yWindow = 100;

                      setBubbleXDomain([
                        Math.max(0, xCenter - xWindow),
                        xCenter + xWindow
                      ]);
                      setBubbleYDomain([
                        Math.max(0, yCenter - yWindow),
                        yCenter + yWindow
                      ]);

                      // Show modal
                      setSelectedCreative(creative);
                    }
                  }}
                  cursor="pointer"
                />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Custom Breakdown Table */}
        <div className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto relative">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Custom Breakdown</h3>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-500">Dimensions:</span>
              {['station', 'daypart', 'creative', 'market'].map((dim) => (
                <label key={dim} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedDimensions.includes(dim)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedDimensions([...selectedDimensions, dim]);
                      } else {
                        setSelectedDimensions(selectedDimensions.filter(d => d !== dim));
                      }
                    }}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300 focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm capitalize">{dim}</span>
                </label>
              ))}
            </div>
          </div>
          <CustomBreakdownTable
            data={breakdownData}
            dimensions={selectedDimensions}
            showHint={showBreakdownHint}
            onHintDismiss={() => {
              setShowBreakdownHint(false);
              localStorage.setItem('breakdownInteracted', 'true');
            }}
          />
        </div>

        {/* Creative Details Modal */}
        {selectedCreative && (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            style={{ animation: 'fadeIn 0.2s ease-out' }}
            onClick={() => setSelectedCreative(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6"
              style={{ animation: 'slideUp 0.3s ease-out' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-2xl font-bold text-slate-900">{selectedCreative.creative}</h3>
                  <p className="text-sm text-slate-500 mt-1">Creative Performance Details</p>
                </div>
                <button
                  onClick={() => setSelectedCreative(null)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-4 rounded-xl">
                  <div className="text-sm text-blue-600 font-medium">Total Cost</div>
                  <div className="text-2xl font-bold text-blue-900 mt-1">{fmtUsd0(selectedCreative.total_cost)}</div>
                </div>
                <div className="bg-gradient-to-br from-green-50 to-green-100 p-4 rounded-xl">
                  <div className="text-sm text-green-600 font-medium">Total Sales</div>
                  <div className="text-2xl font-bold text-green-900 mt-1">{fmtInt(selectedCreative.total_sales)}</div>
                </div>
                <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-4 rounded-xl">
                  <div className="text-sm text-orange-600 font-medium">Cost Per Sale</div>
                  <div className="text-2xl font-bold text-orange-900 mt-1">{fmtUsd2(selectedCreative.cost_per_sale)}</div>
                </div>
                <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-4 rounded-xl">
                  <div className="text-sm text-purple-600 font-medium">Total Responses</div>
                  <div className="text-2xl font-bold text-purple-900 mt-1">{fmtInt(selectedCreative.total_responses)}</div>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-200">
                <div className="text-sm text-slate-500">
                  {selectedCreative.total_sales > 0 && selectedCreative.cost_per_sale < 200 ? (
                    <span className="text-green-600 font-medium">✓ High performing creative</span>
                  ) : (
                    <span className="text-slate-600">Performance data</span>
                  )}
                </div>
                <button
                  onClick={() => setSelectedCreative(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
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
function Heatmap({ rows, rowKey, nameColumnLabel, metrics, extras, onRowClick }) {
  const [sortKey, setSortKey] = useState(metrics[0]?.k || extras?.[0]?.k || null);
  const [sortDir, setSortDir] = useState("desc");

  const maxByMetric = useMemo(() => {
    const m = {};
    for (const { k } of metrics) {
      m[k] = Math.max(0, ...rows.map((r) => Number(r[k] || 0)));
    }
    return m;
  }, [rows, metrics]);

  const colorCell = (value, max, isCurrency = false, metricKey = '') => {
    const v = Number(value || 0);
    if (v === 0 || max === 0) return { backgroundColor: "#f8f9fa", color: "#0f172a" };

    const cap = Math.max(1, max || 1);
    let p = Math.min(1, v / cap);

    // Reverse color mapping for cost metrics (lower is better)
    const isReversed = metricKey === 'cost_per_sale' || metricKey === 'cost_per_response';
    if (isReversed) {
      p = 1 - p; // Invert: low values get high intensity (good), high values get low intensity (bad)
    }

    const gamma = 1.2;
    p = Math.pow(p, gamma);

    const base = ylgnbu(p);
    const whiteBlend = 0.75 - 0.50 * p; // Light overall, low threshold fade to white
    const bg = blendWithWhite(base, whiteBlend);

    const textDark = luma(bg) > 0.65;
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
            <tr
              key={rowKey(r)}
              onClick={() => onRowClick?.(r)}
              className={onRowClick ? "cursor-pointer hover:bg-slate-50 transition-all hover:scale-[1.02] hover:shadow-md active:scale-[0.98]" : ""}
            >
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
                      style={colorCell(val, maxByMetric[m.k], m.isCurrency, m.k)}
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
    const gamma = 1.2;
    p = Math.pow(p, gamma);

    const base = ylgnbu(p);
    const whiteBlend = 0.75 - 0.50 * p; // Light overall, low threshold fade to white
    const bg = blendWithWhite(base, whiteBlend);
    const textDark = luma(bg) > 0.65;

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

// Custom Breakdown Table - sortable/filterable table with dynamic dimensions
function CustomBreakdownTable({ data, dimensions, showHint, onHintDismiss }) {
  const [sortKey, setSortKey] = useState('total_cost');
  const [sortDir, setSortDir] = useState('desc');
  const [filterText, setFilterText] = useState('');
  const [showAll, setShowAll] = useState(false);

  // Filter rows based on search text
  const filteredRows = useMemo(() => {
    if (!filterText.trim()) return data;
    const lower = filterText.toLowerCase();
    return data.filter(row => {
      // Check if any dimension value contains the filter text
      return dimensions.some(dim => {
        const val = String(row[dim] || '').toLowerCase();
        return val.includes(lower);
      });
    });
  }, [data, filterText, dimensions]);

  // Sort rows
  const sortedRows = useMemo(() => {
    if (!sortKey) return filteredRows;
    const arr = [...filteredRows];
    arr.sort((a, b) => {
      const av = Number(a[sortKey] ?? 0);
      const bv = Number(b[sortKey] ?? 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return arr;
  }, [filteredRows, sortKey, sortDir]);

  const onHeaderClick = (key) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const sortIndicator = (key) => (sortKey !== key ? '' : sortDir === 'asc' ? ' ↑' : ' ↓');

  // Limit displayed rows
  const displayedRows = showAll ? sortedRows : sortedRows.slice(0, 20);
  const hasMore = sortedRows.length > 20;

  // Define metric columns
  const metricColumns = [
    { key: 'total_cost', label: 'Total Cost', formatter: fmtUsd0 },
    { key: 'total_sales', label: 'Sales', formatter: fmtInt },
    { key: 'total_responses', label: 'Responses', formatter: fmtInt },
    { key: 'total_impressions', label: 'Impressions', formatter: fmtInt },
    { key: 'cost_per_sale', label: 'Cost/Sale', formatter: fmtUsd2 },
    { key: 'cost_per_response', label: 'Cost/Response', formatter: fmtUsd2 },
  ];

  // Generate dimension column labels
  const getDimensionLabel = (dim) => {
    const labels = {
      station: 'Station',
      daypart: 'Daypart',
      creative: 'Creative',
      market: 'Market'
    };
    return labels[dim] || dim;
  };

  return (
    <div className="w-full">
      {/* Search/Filter Input */}
      <div className="mb-4 relative">
        {/* Wiggling Hint */}
        {showHint && (
          <div className="absolute -top-12 left-0 z-10 pointer-events-none">
            <div className="relative" style={{ animation: 'wiggle 0.5s ease-in-out infinite' }}>
              <div className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-2 rounded-lg shadow-lg font-medium whitespace-nowrap">
                Filter by station, daypart, creative & more!
              </div>
              <div className="absolute left-8 -bottom-2 w-0 h-0 border-l-8 border-r-8 border-t-8 border-transparent border-t-cyan-500"></div>
            </div>
          </div>
        )}

        <input
          type="text"
          placeholder="Filter by dimension values..."
          value={filterText}
          onChange={(e) => {
            // Dismiss hint on first interaction
            if (showHint && onHintDismiss) {
              onHintDismiss();
            }
            setFilterText(e.target.value);
          }}
          className="px-4 py-2 border rounded-xl bg-white shadow-sm text-sm w-full max-w-md"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto border rounded-xl">
        <table className="w-full text-sm border-collapse">
          <thead className="bg-slate-50">
            <tr className="text-left">
              {/* Dimension columns */}
              {dimensions.map((dim) => (
                <th key={dim} className="py-3 px-4 font-bold text-slate-700 text-xs uppercase tracking-wider border-b-2 border-slate-200">
                  {getDimensionLabel(dim)}
                </th>
              ))}
              {/* Metric columns */}
              {metricColumns.map((col) => (
                <th
                  key={col.key}
                  className="py-3 px-4 text-right font-bold text-slate-700 text-xs uppercase tracking-wider border-b-2 border-slate-200 cursor-pointer select-none hover:bg-slate-100 transition-colors"
                  onClick={() => onHeaderClick(col.key)}
                  title={`Sort by ${col.label}`}
                >
                  {col.label}{sortIndicator(col.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={dimensions.length + metricColumns.length} className="py-12 text-center text-gray-400">
                  {filterText ? 'No results found' : 'No data available'}
                </td>
              </tr>
            ) : (
              displayedRows.map((row, idx) => (
                <tr key={idx} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                  {/* Dimension values */}
                  {dimensions.map((dim) => (
                    <td key={dim} className="py-3 px-4 font-semibold text-slate-800 whitespace-nowrap border-r border-slate-100">
                      {row[dim] || '-'}
                    </td>
                  ))}
                  {/* Metric values */}
                  {metricColumns.map((col) => (
                    <td key={col.key} className="py-3 px-4 text-right text-slate-700 whitespace-nowrap">
                      {row[col.key] != null ? col.formatter(row[col.key]) : '-'}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Results count and expand button */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-gray-500">
          Showing {displayedRows.length} of {sortedRows.length} row{sortedRows.length !== 1 ? 's' : ''}
          {filterText && ` (filtered from ${data.length} total)`}
        </div>
        {hasMore && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {showAll ? 'Show Less' : `Show All (${sortedRows.length})`}
          </button>
        )}
      </div>
    </div>
  );
}

// Station Details Modal
function StationDetailsModal({ station, details, loading, onClose }) {
  if (!station) return null;

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fadeIn"
      onClick={onClose}
      style={{
        animation: 'fadeIn 0.3s ease-out'
      }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full p-6 animate-slideUp"
        onClick={(e) => e.stopPropagation()}
        style={{
          animation: 'slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)'
        }}
      >
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-slate-800">{station}</h2>
            <p className="text-sm text-slate-500 mt-1">Station Performance Details</p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100"
          >
            ×
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-slate-500">Loading station details...</div>
          </div>
        ) : details ? (
          <div className="space-y-6">
            {/* Key Metrics */}
            <div>
              <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Key Metrics</h3>
              <div className="grid grid-cols-2 gap-4">
                <MetricCard label="Total Cost" value={fmtUsd0(details.metrics?.total_cost)} />
                <MetricCard label="CPM" value={details.metrics?.cpm ? fmtUsd2(details.metrics.cpm) : "N/A"} />
                <MetricCard label="Total Sales" value={fmtInt(details.metrics?.total_sales)} />
                <MetricCard label="Total Responses" value={fmtInt(details.metrics?.total_responses)} />
              </div>
            </div>

            {/* Best Performing */}
            <div className="grid grid-cols-2 gap-4">
              {/* Best Daypart */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">Best Daypart</h3>
                {details.best_daypart ? (
                  <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                    <div className="text-lg font-bold text-blue-900">{details.best_daypart.daypart}</div>
                    <div className="text-sm text-blue-700 mt-1">{fmtInt(details.best_daypart.total_sales)} sales</div>
                    <div className="text-xs text-blue-600 mt-1">{fmtUsd2(details.best_daypart.cost_per_sale)} per sale</div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">No data</div>
                )}
              </div>

              {/* Best Creative */}
              <div>
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-2">Best Creative</h3>
                {details.best_creative ? (
                  <div className="bg-green-50 rounded-lg p-4 border border-green-200">
                    <div className="text-sm font-bold text-green-900 truncate" title={details.best_creative.creative}>
                      {details.best_creative.creative}
                    </div>
                    <div className="text-sm text-green-700 mt-1">{fmtInt(details.best_creative.total_sales)} sales</div>
                    <div className="text-xs text-green-600 mt-1">{fmtUsd2(details.best_creative.cost_per_sale)} per sale</div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-400">No data</div>
                )}
              </div>
            </div>

            {/* Clearance */}
            {details.clearance && (details.clearance.total_booked_cf || details.clearance.clearance_pct) ? (
              <div>
                <h3 className="text-sm font-semibold text-slate-600 uppercase tracking-wide mb-3">Clearance</h3>
                <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
                  <div className="flex items-center gap-6">
                    {/* Circular Progress */}
                    {details.clearance.clearance_pct && (
                      <div className="flex-shrink-0">
                        <CircularProgress percentage={details.clearance.clearance_pct * 100} />
                      </div>
                    )}

                    {/* Stats Grid */}
                    <div className="flex-1 grid grid-cols-2 gap-3">
                      <div>
                        <div className="text-xs text-slate-500">Booked</div>
                        <div className="text-base font-semibold text-slate-800">{fmtUsd0(details.clearance.total_booked_cf)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Cleared</div>
                        <div className="text-base font-semibold text-slate-800">{fmtUsd0(details.clearance.total_cleared_cf)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Ordered Spots</div>
                        <div className="text-base font-semibold text-slate-800">{fmtInt(details.clearance.total_ord_spots)}</div>
                      </div>
                      <div>
                        <div className="text-xs text-slate-500">Spots Ran</div>
                        <div className="text-base font-semibold text-slate-800">{fmtInt(details.clearance.total_spots_ran)}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="text-center py-12 text-slate-500">No data available</div>
        )}
      </div>
    </div>
  );
}

// Metric Card for modal
function MetricCard({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg p-3 border border-slate-200">
      <div className="text-xs text-slate-500 mb-1">{label}</div>
      <div className="text-xl font-semibold text-slate-800">{value}</div>
    </div>
  );
}

// Circular Progress for clearance percentage
function CircularProgress({ percentage }) {
  const radius = 65;
  const strokeWidth = 10;
  const normalizedRadius = radius - strokeWidth / 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      {/* Glow effect */}
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-blue-400/20 to-blue-600/20 blur-xl animate-pulse"></div>

      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90 relative z-10 drop-shadow-lg">
        {/* Background circle with subtle inner shadow */}
        <circle
          stroke="#e2e8f0"
          fill="white"
          strokeWidth={strokeWidth}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          opacity="0.6"
        />
        {/* Inner shadow ring */}
        <circle
          stroke="url(#innerShadow)"
          fill="transparent"
          strokeWidth={strokeWidth - 2}
          r={normalizedRadius - 1}
          cx={radius}
          cy={radius}
          opacity="0.3"
        />
        {/* Progress circle with glow */}
        <circle
          stroke="url(#gradient)"
          fill="transparent"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference + ' ' + circumference}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)',
            filter: 'drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))'
          }}
        />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="50%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>
          <linearGradient id="innerShadow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>
        </defs>
      </svg>
      {/* Percentage text in center with enhanced styling */}
      <div className="absolute inset-0 flex items-center justify-center z-20">
        <div className="text-center">
          <div className="text-3xl font-bold bg-gradient-to-br from-slate-700 to-slate-900 bg-clip-text text-transparent drop-shadow-sm">
            {percentage.toFixed(1)}%
          </div>
          <div className="text-xs font-medium text-slate-500 mt-1 tracking-wide uppercase">cleared</div>
        </div>
      </div>
    </div>
  );
}

