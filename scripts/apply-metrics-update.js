const fs = require('fs');
const path = require('path');

// Read the file
const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Check if ALL_METRICS already exists
if (content.includes('ALL_METRICS')) {
  console.log('ALL_METRICS already exists, skipping metric constants');
} else {
  // Insert after fmtUsd2 closing brace
  const insertPoint = 'catch { return `$${(Math.round(v * 100) / 100).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")}`; }\n};';
  const metricsCode = `catch { return \`\$\${(Math.round(v * 100) / 100).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")}\`; }
};

const fmtPct = (n) => {
  const v = Number(n || 0);
  return \`\${(v * 100).toFixed(1)}%\`;
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
const DEFAULT_METRICS = ['spend', 'responses', 'cpr', 'conversions', 'cpc', 'revenue', 'impressions'];`;

  content = content.replace(insertPoint, metricsCode);
  console.log('Added ALL_METRICS constants');
}

// Update DEFAULT_LAYOUT to include enabledMetrics
if (!content.includes('enabledMetrics')) {
  content = content.replace(
    /{ id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true }/g,
    "{ id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  content = content.replace(
    /{ id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true }/g,
    "{ id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  content = content.replace(
    /{ id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true }/g,
    "{ id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  content = content.replace(
    /{ id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true }/g,
    "{ id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  content = content.replace(
    /{ id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true }/g,
    "{ id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  content = content.replace(
    /{ id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true }/g,
    "{ id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS }"
  );
  console.log('Added enabledMetrics to DEFAULT_LAYOUT modules');
}

// Add getEnabledMetrics helper if it doesn't exist
if (!content.includes('getEnabledMetrics')) {
  const helperInsertPoint = `// Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };`;

  const helperWithMetrics = `// Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };

  // Helper to get enabled metrics for a module
  const getEnabledMetrics = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    const enabledKeys = module?.enabledMetrics || DEFAULT_METRICS;
    return ALL_METRICS.filter(m => enabledKeys.includes(m.k)).map(m => ({ k: m.k, label: m.label }));
  };`;

  content = content.replace(helperInsertPoint, helperWithMetrics);
  console.log('Added getEnabledMetrics helper');
}

// Write back atomically
fs.writeFileSync(filePath, content, { encoding: 'utf8', flag: 'w' });
console.log('File saved successfully');

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('ALL_METRICS exists:', verify.includes('ALL_METRICS'));
console.log('enabledMetrics exists:', verify.includes('enabledMetrics'));
console.log('getEnabledMetrics exists:', verify.includes('getEnabledMetrics'));
