"use client";

// src/components/ConversionDashboard.jsx
import { useEffect, useMemo, useState } from "react";
import { useUser, UserButton } from "@clerk/nextjs";
import AdminPanel from "./AdminPanel";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";



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


const fmtPct = (n) => {
  const v = Number(n || 0);
  return `${(v * 100).toFixed(1)}%`;
};

// All available metrics for heatmap modules
const ALL_METRICS = [
  { k: "spend",       label: "Spend",                  defaultVisible: true },
  { k: "impressions", label: "Impressions",            defaultVisible: true },
  { k: "responses",   label: "Responses",              defaultVisible: true },
  { k: "conversions", label: "Conversions",            defaultVisible: true },
  { k: "revenue",     label: "Revenue",                defaultVisible: true },
  { k: "cpr",         label: "Cost Per Response",      defaultVisible: true },
  { k: "cpc",         label: "Cost Per Conversion",    defaultVisible: true },
  { k: "roas",        label: "ROAS",                   defaultVisible: true },
  { k: "cpm",         label: "CPM",                    defaultVisible: false },
  { k: "spotCount",   label: "Spot Count",             defaultVisible: false },
  { k: "respConvRate", label: "Response to Conv %",    defaultVisible: false },
];

// Default enabled metrics for each module type
const DEFAULT_METRICS = ['spend', 'responses', 'cpr', 'conversions', 'cpc', 'revenue', 'impressions'];

// KPI metrics available for the top cards
const KPI_METRICS = [
  { k: "totalSpend",    label: "Total Spend" },
  { k: "totalRevenue",  label: "Total Revenue" },
  { k: "conversions",   label: "Conversions" },
  { k: "roas",          label: "ROAS" },
  { k: "avgCpp",        label: "Avg CPP" },
  { k: "impressions",   label: "Impressions" },
  { k: "responses",     label: "Responses" },
  { k: "cpr",           label: "Cost Per Response" },
];

const DEFAULT_KPI_METRICS = ['totalSpend', 'totalRevenue', 'conversions', 'roas', 'avgCpp'];

// Daily chart metric colors
const DAILY_CHART_COLORS = {
  spend: "#1f77b4",       // blue
  impressions: "#A78BFA", // purple
  conversions: "#22C55E", // green
  revenue: "#C49A49",     // gold
  responses: "#F97316",   // orange
};

const DEFAULT_DAILY_METRICS = ['spend', 'impressions'];

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

// --------- Color scales for heatmaps - Quicksilver Navy & Gold ----------
const SPEND_SCALE = ["#F7F5F0", "#E2D5C8", "#C49A49", "#8A5A30", "#5C3A1A", "#0B2A3C"]; // Ivory to Navy
const CONVERSIONS_SCALE = ["#FEF8EC", "#F5E6C8", "#E2C47A", "#C49A49", "#B0793B", "#8A5A30"]; // Light gold to amber
const REVENUE_SCALE = ["#FEF8EC", "#F5E6C8", "#E2C47A", "#C49A49", "#B0793B", "#8A5A30"]; // Gold scale
const IMPRESSIONS_SCALE = ["#E8EFF5", "#C5D7E6", "#8BABC8", "#5C7F9F", "#34526F", "#0B2A3C"]; // Light to navy
const CPC_SCALE = ["#FEF8EC", "#F5E6C8", "#E2C47A", "#C49A49", "#B0793B", "#8A5A30"]; // Gold scale (lower is better)

// ROAS diverging scale (low → neutral → high) - Navy to Gold
const ROAS_LOW = ["#34526F", "#5C7F9F", "#8BABC8"];
const ROAS_NEUTRAL = "#F7F5F0";
const ROAS_HIGH = ["#E2C47A", "#C49A49", "#8A5A30"];

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
  // Pre-aggregated data from fast API endpoint
  const [dashboardData, setDashboardData] = useState(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [multiplier, setMultiplier] = useState(1);

  // Clerk auth - check if user is admin via public metadata
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === "admin";

  // Loading and error states
  const [isLoading, setIsLoading] = useState(true);
  const [apiError, setApiError] = useState(null);

  // Dashboard layout config (from database)
  const CLIENT_ID = "quicksilver"; // TODO: make dynamic per tenant
  const DEFAULT_LAYOUT = {
    modules: [
      { id: 'kpis', name: 'KPI Cards', visible: true },
      { id: 'notes', name: 'Key Insights', visible: true, notes: [] },
      { id: 'dailyChart', name: 'Daily Spend & Impressions', visible: true },
      { id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
    ]
  };
  const [layout, setLayout] = useState(DEFAULT_LAYOUT);
  const [isSavingLayout, setIsSavingLayout] = useState(false);

  // Load layout config from database (with migration for new modules)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/api/config?clientId=${CLIENT_ID}`);
        if (res.ok) {
          const data = await res.json();
          if (data.layout) {
            // Merge saved layout with defaults to add any new modules
            const savedModuleIds = data.layout.modules.map(m => m.id);
            const newModules = DEFAULT_LAYOUT.modules.filter(m => !savedModuleIds.includes(m.id));
            if (newModules.length > 0) {
              // Insert new modules after KPIs (position 1)
              const mergedModules = [...data.layout.modules];
              mergedModules.splice(1, 0, ...newModules);
              setLayout({ ...data.layout, modules: mergedModules });
            } else {
              setLayout(data.layout);
            }
          }
        }
      } catch (e) {
        console.error("Failed to load layout config:", e);
      }
    })();
  }, []);

  // Save layout to database
  const saveLayout = async () => {
    setIsSavingLayout(true);
    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: CLIENT_ID, layout })
      });
      if (!res.ok) throw new Error('Save failed');
    } catch (e) {
      console.error("Failed to save layout:", e);
      alert("Failed to save layout");
    } finally {
      setIsSavingLayout(false);
    }
  };

  // Helper to check if a module is visible
  const isModuleVisible = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module ? module.visible : true;
  };

  // Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };


  // Helper to get enabled metrics for a module
  const getEnabledMetrics = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    const enabledKeys = module?.enabledMetrics || DEFAULT_METRICS;
    return ALL_METRICS.filter(m => enabledKeys.includes(m.k)).map(m => ({ k: m.k, label: m.label }));
  };

  // Helper to get enabled KPIs
  const getEnabledKpis = () => {
    const module = layout.modules.find(m => m.id === 'kpis');
    return module?.enabledKpis || DEFAULT_KPI_METRICS;
  };

  // Helper to get enabled daily chart metrics
  const getEnabledDailyMetrics = () => {
    const module = layout.modules.find(m => m.id === 'dailyChart');
    return module?.enabledDailyMetrics || DEFAULT_DAILY_METRICS;
  };

  // Helper to get notes
  const getNotes = () => {
    const module = layout.modules.find(m => m.id === 'notes');
    return module?.notes || [];
  };

  // Get modules in order
  const orderedModules = layout.modules;

  // Store all rows for date filtering
  const [allRows, setAllRows] = useState([]);
  const [isLoadingBackground, setIsLoadingBackground] = useState(false);

  // Initial load: Fetch just the most recent broadcast week FAST, then load all in background
  useEffect(() => {
    (async () => {
      try {
        if (startDate || endDate) return; // Already initialized
        setIsLoading(true);
        setApiError(null);

        // Step 1: Get date range (FAST - 1-2 seconds)
        const dateRangeResponse = await fetch(`http://localhost:8000/api/data/date-range?client_name=Quicksilver Scientific`, { cache: "no-store" });
        if (!dateRangeResponse.ok) throw new Error(`API ${dateRangeResponse.status}`);
        const dateRangeJson = await dateRangeResponse.json();

        if (!dateRangeJson.latest_date) {
          setDashboardData(null);
          return;
        }

        // Parse latest date as local date (avoid timezone issues)
        const [year, month, day] = dateRangeJson.latest_date.split('-').map(Number);
        const latestDate = new Date(year, month - 1, day);
        const dayOfWeek = latestDate.getDay();

        // Broadcast week = Monday to Sunday
        let weekEndDate = new Date(latestDate);
        if (dayOfWeek !== 0) {
          weekEndDate.setDate(latestDate.getDate() - dayOfWeek);
        }
        const weekStartDate = new Date(weekEndDate);
        weekStartDate.setDate(weekEndDate.getDate() - 6);

        const pad = (n) => String(n).padStart(2, '0');
        const weekStart = `${weekStartDate.getFullYear()}-${pad(weekStartDate.getMonth() + 1)}-${pad(weekStartDate.getDate())}`;
        const weekEnd = `${weekEndDate.getFullYear()}-${pad(weekEndDate.getMonth() + 1)}-${pad(weekEndDate.getDate())}`;

        console.log(`Broadcast week: ${weekStart} to ${weekEnd}`);

        // Step 2: Fetch JUST that week's data (FAST)
        const weekResponse = await fetch(`http://localhost:8000/api/data/daily?client_name=Quicksilver Scientific&start_date=${weekStart}&end_date=${weekEnd}`, { cache: "no-store" });
        if (!weekResponse.ok) throw new Error(`API ${weekResponse.status}`);
        const weekJson = await weekResponse.json();
        const weekRows = weekJson.rows || [];

        if (!weekRows.length) {
          setDashboardData(null);
          return;
        }

        // Aggregate and display the most recent week immediately
        const weekData = aggregateRows(weekRows, dateRangeJson.earliest_date, dateRangeJson.latest_date);
        setDashboardData(weekData);
        setAllRows(weekRows);
        setStartDate(weekStart);
        setEndDate(weekEnd);

        // Step 3: Load ALL data in the background for date filtering
        setIsLoadingBackground(true);
        setTimeout(async () => {
          try {
            const allDataResponse = await fetch(`http://localhost:8000/api/data/daily?client_name=Quicksilver Scientific`, { cache: "no-store" });
            if (allDataResponse.ok) {
              const allDataJson = await allDataResponse.json();
              const allDataRows = allDataJson.rows || [];
              setAllRows(allDataRows);
              console.log(`Background load complete: ${allDataRows.length} rows loaded`);
            }
          } catch (e) {
            console.error("Background data load failed:", e);
          } finally {
            setIsLoadingBackground(false);
          }
        }, 100);

      } catch (e) {
        console.error("Initial data load failed:", e);
        setApiError("Could not connect to data API. Make sure the backend server is running on localhost:8000");
        setDashboardData(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  // When user changes dates, filter from allRows and re-aggregate
  useEffect(() => {
    if (!startDate || !endDate || !allRows.length || isLoadingBackground) return;

    const filtered = allRows.filter((r) => {
      const d = parseMDY(r.Date);
      const s = parseMDY(startDate);
      const e = parseMDY(endDate);
      return d >= s && d <= e;
    });

    if (filtered.length > 0) {
      const data = aggregateRows(filtered, startDate, endDate);
      setDashboardData(data);
    }
  }, [startDate, endDate, allRows, isLoadingBackground]);

  // Helper function to aggregate raw rows into dashboard data format
  const aggregateRows = (rows, earliestDate, latestDate) => {
    const byChannel = new Map();
    const byCreative = new Map();
    const byDaypart = new Map();
    const byDayOfWeek = new Map();
    const channelByDaypart = new Map();
    const channelByCreative = new Map();
    const byDate = new Map();
    let totalSpend = 0, totalImpressions = 0, totalConversions = 0, totalRevenue = 0, totalResponses = 0;

    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

    for (const row of rows) {
      const spend = num(row.Cost);
      const impressions = num(row.Impressions);
      const conversions = num(row.sale);
      const revenue = num(row.Action_Revenue);
      const responses = num(row.Responses);

      totalSpend += spend;
      totalImpressions += impressions;
      totalConversions += conversions;
      totalRevenue += revenue;
      totalResponses += responses;

      // By Channel
      if (row.Station && row.Station !== "Unknown") {
        const c = byChannel.get(row.Station) || { Station: row.Station, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        c.spend += spend; c.impressions += impressions; c.conversions += conversions; c.revenue += revenue; c.responses += responses; c.spot_count += 1;
        byChannel.set(row.Station, c);
      }

      // By Creative
      if (row.Creative && row.Creative !== "Unknown") {
        const c = byCreative.get(row.Creative) || { Creative: row.Creative, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        c.spend += spend; c.impressions += impressions; c.conversions += conversions; c.revenue += revenue; c.responses += responses; c.spot_count += 1;
        byCreative.set(row.Creative, c);
      }

      // By Daypart
      if (row.Daypart && row.Daypart !== "Unknown") {
        const d = byDaypart.get(row.Daypart) || { Daypart: row.Daypart, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        d.spend += spend; d.impressions += impressions; d.conversions += conversions; d.revenue += revenue; d.responses += responses; d.spot_count += 1;
        byDaypart.set(row.Daypart, d);
      }

      // By Day of Week
      const dateObj = parseMDY(row.Date);
      if (dateObj) {
        const dayName = dayNames[dateObj.getDay()];
        const dow = byDayOfWeek.get(dayName) || { day_name: dayName, day_order: dateObj.getDay(), spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        dow.spend += spend; dow.impressions += impressions; dow.conversions += conversions; dow.revenue += revenue; dow.responses += responses; dow.spot_count += 1;
        byDayOfWeek.set(dayName, dow);
      }

      // Channel by Daypart
      if (row.Station && row.Station !== "Unknown" && row.Daypart && row.Daypart !== "Unknown") {
        const key = `${row.Station}|${row.Daypart}`;
        const cd = channelByDaypart.get(key) || { Station: row.Station, Daypart: row.Daypart, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        cd.spend += spend; cd.impressions += impressions; cd.conversions += conversions; cd.revenue += revenue; cd.responses += responses; cd.spot_count += 1;
        channelByDaypart.set(key, cd);
      }

      // Channel by Creative
      if (row.Station && row.Station !== "Unknown" && row.Creative && row.Creative !== "Unknown") {
        const key = `${row.Station}|${row.Creative}`;
        const cc = channelByCreative.get(key) || { Station: row.Station, Creative: row.Creative, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        cc.spend += spend; cc.impressions += impressions; cc.conversions += conversions; cc.revenue += revenue; cc.responses += responses; cc.spot_count += 1;
        channelByCreative.set(key, cc);
      }

      // Daily
      if (row.Date) {
        const d = byDate.get(row.Date) || { Date: row.Date, spend: 0, impressions: 0, conversions: 0, revenue: 0, responses: 0, spot_count: 0 };
        d.spend += spend; d.impressions += impressions; d.conversions += conversions; d.revenue += revenue; d.responses += responses; d.spot_count += 1;
        byDate.set(row.Date, d);
      }
    }

    return {
      kpis: {
        total_spend: totalSpend,
        total_impressions: totalImpressions,
        total_conversions: totalConversions,
        total_revenue: totalRevenue,
        total_responses: totalResponses,
        earliest_date: earliestDate,
        latest_date: latestDate,
      },
      byChannel: [...byChannel.values()],
      byCreative: [...byCreative.values()],
      byDaypart: [...byDaypart.values()],
      byDayOfWeek: [...byDayOfWeek.values()].sort((a, b) => a.day_order - b.day_order),
      channelByDaypart: [...channelByDaypart.values()],
      channelByCreative: [...channelByCreative.values()],
      daily: [...byDate.values()].sort((a, b) => parseMDY(a.Date) - parseMDY(b.Date)),
    };
  };

  // Date bounds from KPIs
  const [minDate, maxDate] = useMemo(() => {
    if (!dashboardData?.kpis) return [null, null];
    const earliest = dashboardData.kpis.earliest_date ? parseMDY(dashboardData.kpis.earliest_date) : null;
    const latest = dashboardData.kpis.latest_date ? parseMDY(dashboardData.kpis.latest_date) : null;
    return [earliest, latest];
  }, [dashboardData]);

  // Daily chart data - from pre-aggregated daily view (includes all metrics)
  const daily = useMemo(() => {
    if (!dashboardData?.daily) return [];
    return dashboardData.daily.map(d => ({
      date: d.Date,
      spend: num(d.spend),
      impressions: num(d.impressions),
      conversions: num(d.conversions),
      revenue: num(d.revenue),
      responses: num(d.responses),
    }));
  }, [dashboardData]);

  // Channel/Placement totals - from pre-aggregated view
  const placementTotals = useMemo(() => {
    if (!dashboardData?.byChannel) return [];
    return dashboardData.byChannel
      .filter(c => c.Station && c.Station !== "Unknown")
      .map(c => ({
        pub: c.Station,
        spend: num(c.spend) * multiplier,
        impressions: num(c.impressions),
        conversions: num(c.conversions) * multiplier,
        revenue: num(c.revenue) * multiplier,
        responses: num(c.responses),
        spotCount: num(c.spot_count),
        cpm: (num(c.spend) / Math.max(num(c.impressions), 1)) * 1000,
        cpc: num(c.spend) / Math.max(num(c.conversions), 1),
        cpr: num(c.spend) / Math.max(num(c.responses), 1),
        roas: num(c.revenue) / Math.max(num(c.spend), 1),
        respConvRate: num(c.conversions) / Math.max(num(c.responses), 1),
      }));
  }, [dashboardData, multiplier]);

  // Creative totals - from pre-aggregated view
  const creativeTotals = useMemo(() => {
    if (!dashboardData?.byCreative) return [];
    return dashboardData.byCreative
      .filter(c => c.Creative && c.Creative !== "Unknown")
      .map(c => ({
        creative: c.Creative,
        spend: num(c.spend) * multiplier,
        impressions: num(c.impressions),
        conversions: num(c.conversions) * multiplier,
        revenue: num(c.revenue) * multiplier,
        responses: num(c.responses),
        spotCount: num(c.spot_count),
        cpm: (num(c.spend) / Math.max(num(c.impressions), 1)) * 1000,
        cpc: num(c.spend) / Math.max(num(c.conversions), 1),
        cpr: num(c.spend) / Math.max(num(c.responses), 1),
        roas: num(c.revenue) / Math.max(num(c.spend), 1),
        respConvRate: num(c.conversions) / Math.max(num(c.responses), 1),
      }));
  }, [dashboardData, multiplier]);

  // Daypart totals - from pre-aggregated view
  const daypartTotals = useMemo(() => {
    if (!dashboardData?.byDaypart) return [];
    return dashboardData.byDaypart
      .filter(d => d.Daypart && d.Daypart !== "Unknown")
      .map(d => ({
        daypart: d.Daypart,
        spend: num(d.spend) * multiplier,
        impressions: num(d.impressions),
        conversions: num(d.conversions) * multiplier,
        revenue: num(d.revenue) * multiplier,
        responses: num(d.responses),
        spotCount: num(d.spot_count),
        cpm: (num(d.spend) / Math.max(num(d.impressions), 1)) * 1000,
        cpc: num(d.spend) / Math.max(num(d.conversions), 1),
        cpr: num(d.spend) / Math.max(num(d.responses), 1),
        roas: num(d.revenue) / Math.max(num(d.spend), 1),
        respConvRate: num(d.conversions) / Math.max(num(d.responses), 1),
      }));
  }, [dashboardData, multiplier]);

  // Day of Week totals - from pre-aggregated view
  const dayOfWeekTotals = useMemo(() => {
    if (!dashboardData?.byDayOfWeek) return [];
    return dashboardData.byDayOfWeek.map(d => ({
      dayOfWeek: d.day_name,
      dayIndex: d.day_order,
      spend: num(d.spend) * multiplier,
      impressions: num(d.impressions),
      conversions: num(d.conversions) * multiplier,
      revenue: num(d.revenue) * multiplier,
      responses: num(d.responses),
      spotCount: num(d.spot_count),
      cpm: (num(d.spend) / Math.max(num(d.impressions), 1)) * 1000,
      cpc: num(d.spend) / Math.max(num(d.conversions), 1),
      cpr: num(d.spend) / Math.max(num(d.responses), 1),
      roas: num(d.revenue) / Math.max(num(d.spend), 1),
      respConvRate: num(d.conversions) / Math.max(num(d.responses), 1),
    }));
  }, [dashboardData, multiplier]);

  // Channel by Daypart - from pre-aggregated view
  const channelByDaypartTotals = useMemo(() => {
    if (!dashboardData?.channelByDaypart) return [];
    return dashboardData.channelByDaypart
      .filter(d => d.Station && d.Station !== "Unknown" && d.Daypart && d.Daypart !== "Unknown")
      .map(d => ({
        channel: d.Station,
        daypart: d.Daypart,
        spend: num(d.spend) * multiplier,
        impressions: num(d.impressions),
        conversions: num(d.conversions) * multiplier,
        revenue: num(d.revenue) * multiplier,
        responses: num(d.responses),
        spotCount: num(d.spot_count),
        cpm: (num(d.spend) / Math.max(num(d.impressions), 1)) * 1000,
        cpc: num(d.spend) / Math.max(num(d.conversions), 1),
        cpr: num(d.spend) / Math.max(num(d.responses), 1),
        roas: num(d.revenue) / Math.max(num(d.spend), 1),
        respConvRate: num(d.conversions) / Math.max(num(d.responses), 1),
      }));
  }, [dashboardData, multiplier]);

  // Channel by Creative - from pre-aggregated view
  const channelByCreativeTotals = useMemo(() => {
    if (!dashboardData?.channelByCreative) return [];
    return dashboardData.channelByCreative
      .filter(d => d.Station && d.Station !== "Unknown" && d.Creative && d.Creative !== "Unknown")
      .map(d => ({
        channel: d.Station,
        creative: d.Creative,
        spend: num(d.spend) * multiplier,
        impressions: num(d.impressions),
        conversions: num(d.conversions) * multiplier,
        revenue: num(d.revenue) * multiplier,
        responses: num(d.responses),
        spotCount: num(d.spot_count),
        cpm: (num(d.spend) / Math.max(num(d.impressions), 1)) * 1000,
        cpc: num(d.spend) / Math.max(num(d.conversions), 1),
        cpr: num(d.spend) / Math.max(num(d.responses), 1),
        roas: num(d.revenue) / Math.max(num(d.spend), 1),
        respConvRate: num(d.conversions) / Math.max(num(d.responses), 1),
      }));
  }, [dashboardData, multiplier]);

  // KPIs - from pre-aggregated view
  const totalSpend = useMemo(() => num(dashboardData?.kpis?.total_spend) * multiplier, [dashboardData, multiplier]);
  const totalImpr = useMemo(() => num(dashboardData?.kpis?.total_impressions), [dashboardData]);
  const totalConv = useMemo(() => num(dashboardData?.kpis?.total_conversions) * multiplier, [dashboardData, multiplier]);
  const totalRev = useMemo(() => num(dashboardData?.kpis?.total_revenue) * multiplier, [dashboardData, multiplier]);
  const totalResponses = useMemo(() => num(dashboardData?.kpis?.total_responses), [dashboardData]);
  const totalRoas = useMemo(() => totalRev / Math.max(totalSpend, 1), [totalRev, totalSpend]);
  const avgCpp = useMemo(() => totalSpend / Math.max(totalConv, 1), [totalSpend, totalConv]);
  const avgCpr = useMemo(() => totalSpend / Math.max(totalResponses, 1), [totalSpend, totalResponses]);

  // KPI value lookup for dynamic rendering
  const kpiValues = useMemo(() => ({
    totalSpend: { value: fmtUsd0(totalSpend), label: "Total Spend" },
    totalRevenue: { value: fmtUsd0(totalRev), label: "Total Revenue" },
    conversions: { value: fmtInt(totalConv), label: "Conversions" },
    roas: { value: `${totalRoas.toFixed(2)}x`, label: "ROAS" },
    avgCpp: { value: fmtUsd2(avgCpp), label: "Avg CPP" },
    impressions: { value: fmtInt(totalImpr), label: "Impressions" },
    responses: { value: fmtInt(totalResponses), label: "Responses" },
    cpr: { value: fmtUsd2(avgCpr), label: "Cost Per Response" },
  }), [totalSpend, totalRev, totalConv, totalRoas, avgCpp, totalImpr, totalResponses, avgCpr]);

  // Check if there's more than one unique creative
  const hasMultipleCreatives = useMemo(() => {
    return (dashboardData?.byCreative?.length || 0) > 1;
  }, [dashboardData]);

  const rowsEmpty = !dashboardData || !dashboardData.daily || dashboardData.daily.length === 0;

  return (
    <div
      className="min-h-screen p-6"
      style={{
        background: '#FAFAF7'
      }}
    >
      {/* Admin Panel - only visible to admins */}
      {isAdmin && (
        <AdminPanel
          layout={layout}
          onLayoutChange={setLayout}
          onSave={saveLayout}
          isSaving={isSavingLayout}
        />
      )}

      {/* widened container */}
      <div className="mx-auto max-w-[1600px] space-y-6">
        {/* Header - Quicksilver Scientific */}
        <div className="rounded-2xl shadow-lg p-6" style={{ backgroundColor: '#0B2A3C' }}>
          <div className="flex flex-col gap-6 xl:flex-row xl:items-center xl:justify-between">
            {/* Logo Section */}
            <div className="flex items-center gap-6">
              <div>
                <h1 className="text-3xl font-bold tracking-tight" style={{ color: '#C49A49' }}>
                  Quicksilver Scientific
                </h1>
                <p className="text-sm" style={{ color: '#F7F5F0' }}>Linear TV Performance Dashboard</p>
              </div>

              {/* Divider */}
              <div className="hidden lg:block w-px h-12" style={{ background: 'linear-gradient(to bottom, transparent, rgba(196, 154, 73, 0.3), transparent)' }}></div>

              {/* Mynt Logo */}
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-xs uppercase tracking-wider" style={{ color: '#F7F5F0', opacity: 0.6 }}>Powered by</p>
                  <p className="text-lg font-bold" style={{ color: '#C49A49' }}>Mynt</p>
                </div>
              </div>
            </div>

            {/* Right side: Date Range + Admin Badge + User Menu */}
            <div className="flex items-center gap-4">
              {/* Date Range Info */}
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ backgroundColor: 'rgba(196, 154, 73, 0.1)', border: '1px solid rgba(196, 154, 73, 0.3)' }}>
                <svg className="w-4 h-4" style={{ color: '#C49A49' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <p className="text-sm font-medium" style={{ color: '#F7F5F0' }}>
                  {minDate && maxDate ? `${minDate.toLocaleDateString()} — ${maxDate.toLocaleDateString()}` : "loading…"}
                </p>
              </div>

              {/* Admin Badge - Only visible to admins */}
              {isAdmin && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ backgroundColor: 'rgba(34, 197, 94, 0.2)', border: '1px solid rgba(34, 197, 94, 0.5)' }}>
                  <svg className="w-4 h-4" style={{ color: '#22C55E' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <span className="text-sm font-medium" style={{ color: '#22C55E' }}>Admin</span>
                </div>
              )}

              {/* User Button - Logout, profile only (no org switcher) */}
              <UserButton
                afterSignOutUrl="/sign-in"
                showName={false}
                appearance={{
                  elements: {
                    avatarBox: "w-10 h-10",
                    organizationSwitcherTrigger: "hidden",
                    organizationPreview: "hidden",
                    organizationSwitcherPopoverCard: "hidden",
                  }
                }}
              />
            </div>
          </div>

          {/* Filters Row */}
          <div className="mt-4 pt-4 flex flex-wrap items-center gap-4" style={{ borderTop: '1px solid rgba(196, 154, 73, 0.2)' }}>

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

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white rounded-2xl shadow-sm p-8 border border-[#E9D5FF] text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#C49A49] mx-auto mb-4"></div>
            <p className="text-gray-600">Loading dashboard data...</p>
          </div>
        )}

        {/* API Error State */}
        {apiError && (
          <div className="bg-red-50 border border-red-200 text-red-800 rounded-xl px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>{apiError}</span>
            </div>
          </div>
        )}

        {rowsEmpty && !isLoading && !apiError && (
          <div className="bg-white/90 border border-white/50 text-amber-800 rounded-xl px-4 py-3 backdrop-blur-sm">
            No data in this range. Try clearing the custom dates.
          </div>
        )}

        {/* Render modules in order from layout.modules */}
        {layout.modules.map((module) => {
          if (!module.visible) return null;

          switch (module.id) {
            case 'kpis':
              const enabledKpis = getEnabledKpis();
              // Dynamic grid columns based on KPI count (2-6)
              const gridCols = enabledKpis.length <= 3 ? `lg:grid-cols-${enabledKpis.length}` :
                               enabledKpis.length === 4 ? 'lg:grid-cols-4' :
                               enabledKpis.length === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-6';
              return (
                <div key={module.id} className={`grid grid-cols-1 sm:grid-cols-2 ${gridCols} gap-4`}>
                  {enabledKpis.map(kpiKey => {
                    const kpi = kpiValues[kpiKey];
                    if (!kpi) return null;
                    return <KPI key={kpiKey} title={kpi.label} value={kpi.value} />;
                  })}
                </div>
              );

            case 'notes':
              const notes = getNotes();
              if (notes.length === 0) return null; // Don't show empty notes section
              return (
                <div key={module.id} className="bg-gradient-to-br from-[#0B2A3C] to-[#1a4a5e] rounded-2xl shadow-lg p-5 border border-[#C49A49]/20">
                  <div className="flex items-center gap-2 mb-4">
                    <svg className="w-5 h-5 text-[#C49A49]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                    <h3 className="text-lg font-semibold text-white">Key Insights</h3>
                  </div>
                  <ul className="space-y-3">
                    {notes.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-3">
                        <span className="text-[#C49A49] text-xl leading-none mt-0.5">&#8226;</span>
                        <span className="text-white/90 text-sm leading-relaxed">{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );

            case 'dailyChart':
              const enabledDailyMetrics = getEnabledDailyMetrics();
              const metricLabels = {
                spend: "Spend",
                impressions: "Impressions",
                conversions: "Conversions",
                revenue: "Revenue",
                responses: "Responses",
              };
              const chartTitle = enabledDailyMetrics.map(m => metricLabels[m]).join(" & ");
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Daily {chartTitle}</h3>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={daily}>
                        <defs>
                          {enabledDailyMetrics.map((metric, idx) => (
                            <linearGradient key={metric} id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor={DAILY_CHART_COLORS[metric]} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={DAILY_CHART_COLORS[metric]} stopOpacity={0.06} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid vertical={false} strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        {enabledDailyMetrics.length > 1 && (
                          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                        )}
                        <Tooltip formatter={(value, name) => {
                          if (name === "Spend" || name === "Revenue") return fmtUsd0(value);
                          return fmtInt(value);
                        }} />
                        {enabledDailyMetrics.map((metric, idx) => (
                          <Area
                            key={metric}
                            yAxisId={idx === 0 ? "left" : "right"}
                            name={metricLabels[metric]}
                            dataKey={metric}
                            type="monotone"
                            fill={`url(#gradient-${metric})`}
                            stroke={DAILY_CHART_COLORS[metric]}
                            strokeWidth={2}
                          />
                        ))}
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              );

            case 'channelHeatmap':
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Channel Heatmap</h3>
                  <Heatmap
                    rows={[...placementTotals]}
                    rowKey={(r) => r.pub}
                    nameColumnLabel="Channel"
                    showPublisherImages={true}
                    heatmapEnabled={isHeatmapEnabled('channelHeatmap')}
                    metrics={getEnabledMetrics('channelHeatmap')}
                    extras={[]}
                  />
                </div>
              );

            case 'creativeHeatmap':
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Creative Heatmap</h3>
                  <Heatmap
                    rows={[...creativeTotals].slice(0, 40)}
                    rowKey={(r, i) => r.creative + ":" + i}
                    nameColumnLabel="Creative"
                    heatmapEnabled={isHeatmapEnabled('creativeHeatmap')}
                    metrics={getEnabledMetrics('creativeHeatmap')}
                    extras={[]}
                  />
                </div>
              );

            case 'daypartHeatmap':
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Daypart Heatmap</h3>
                  <Heatmap
                    rows={[...daypartTotals]}
                    rowKey={(r) => r.daypart}
                    nameColumnLabel="Daypart"
                    nameField="daypart"
                    heatmapEnabled={isHeatmapEnabled('daypartHeatmap')}
                    metrics={getEnabledMetrics('daypartHeatmap')}
                    extras={[]}
                  />
                </div>
              );

            case 'dayOfWeekHeatmap':
              console.log('dayOfWeekTotals:', dayOfWeekTotals);
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Day of Week ({dayOfWeekTotals.length} rows)</h3>
                  <Heatmap
                    rows={[...dayOfWeekTotals]}
                    rowKey={(r) => r.dayOfWeek}
                    nameColumnLabel="Day"
                    nameField="dayOfWeek"
                    heatmapEnabled={isHeatmapEnabled('dayOfWeekHeatmap')}
                    metrics={getEnabledMetrics('dayOfWeekHeatmap')}
                    extras={[]}
                  />
                </div>
              );

            case 'channelByDaypart':
              console.log('channelByDaypartTotals:', channelByDaypartTotals);
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Channel by Daypart ({channelByDaypartTotals.length} rows)</h3>
                  <Heatmap
                    rows={[...channelByDaypartTotals]}
                    rowKey={(r) => `${r.channel}-${r.daypart}`}
                    nameColumnLabel="Channel / Daypart"
                    showChannelDaypart={true}
                    heatmapEnabled={isHeatmapEnabled('channelByDaypart')}
                    metrics={getEnabledMetrics('channelByDaypart')}
                    extras={[]}
                  />
                </div>
              );

            case 'channelByCreative':
              return (
                <div key={module.id} className="bg-white rounded-2xl shadow-sm p-5 overflow-x-auto w-full border border-[#E9D5FF]">
                  <h3 className="text-lg font-semibold mb-2">Channel by Creative</h3>
                  <Heatmap
                    rows={[...channelByCreativeTotals]}
                    rowKey={(r) => `${r.channel}-${r.creative}`}
                    nameColumnLabel="Channel / Creative"
                    showChannelCreative={true}
                    heatmapEnabled={isHeatmapEnabled('channelByCreative')}
                    metrics={getEnabledMetrics('channelByCreative')}
                    extras={[]}
                  />
                </div>
              );

            default:
              return null;
          }
        })}

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


// ---------- Heatmap (sortable, single YlGnBu scale) ----------
function Heatmap({
  rows,
  rowKey,
  nameColumnLabel,
  nameField = null,
  metrics,
  extras,
  showPublisherImages = false,
  showPlacementHierarchy = false,
  showChannelDaypart = false,
  showChannelCreative = false,
  heatmapEnabled = true
}) {
  const [sortKey, setSortKey] = useState(metrics[0]?.k || extras?.[0]?.k || null);
  const [sortDir, setSortDir] = useState("desc");

  // per-metric max (for normalization)
  const maxByMetric = useMemo(() => {
    const m = {};
    for (const { k } of metrics) m[k] = Math.max(0, ...rows.map((r) => Number(r[k] || 0)));
    return m;
  }, [rows, metrics]);

const colorCell = (value, max, metricKey) => {
  const v = Number(value || 0);

  // If heatmap is disabled, return no background color
  if (!heatmapEnabled) {
    return { backgroundColor: "transparent", color: "#0F172A" };
  }

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
              return (
                <tr key={rowKey(r)} className="hover:bg-[#F5F3FF] transition-colors">
                  <td className="py-2 pr-4 font-medium text-gray-800 whitespace-nowrap">
                    <div className="flex items-center gap-3">
                      {showPlacementHierarchy ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500">{r.pub}</span>
                          <span className="font-semibold">{r.placement}</span>
                        </div>
                      ) : showChannelDaypart ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500">{r.channel}</span>
                          <span className="font-semibold">{r.daypart}</span>
                        </div>
                      ) : showChannelCreative ? (
                        <div className="flex flex-col">
                          <span className="text-xs text-gray-500">{r.channel}</span>
                          <span className="font-semibold text-xs">{r.creative}</span>
                        </div>
                      ) : (
                        <span>{nameField ? r[nameField] : (r.pub || r.creative)}</span>
                      )}
                    </div>
                  </td>

              {metrics.map((m) => {
                const val = r[m.k];
                let displayVal;

                // Format based on metric type
                if (m.k === "spend" || m.k === "revenue") {
                  displayVal = fmtUsd0(val);
                } else if (m.k === "cpc" || m.k === "cpm" || m.k === "cpr") {
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
  );
}
