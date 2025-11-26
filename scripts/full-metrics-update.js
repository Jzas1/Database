const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');
let changesMade = [];

// 1. Add ALL_METRICS constants if not present
if (!content.includes('const ALL_METRICS')) {
  const lines = content.split('\n');
  let insertIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('function parseMDY(mdy)')) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex > 0) {
    const metricsCode = `
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
const DEFAULT_METRICS = ['spend', 'responses', 'cpr', 'conversions', 'cpc', 'revenue', 'impressions'];
`;
    lines.splice(insertIndex, 0, metricsCode);
    content = lines.join('\n');
    changesMade.push('Added ALL_METRICS and DEFAULT_METRICS constants');
  }
}

// 2. Update DEFAULT_LAYOUT modules with enabledMetrics
if (!content.includes('enabledMetrics:')) {
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
  changesMade.push('Added enabledMetrics to DEFAULT_LAYOUT modules');
}

// 3. Add getEnabledMetrics helper
if (!content.includes('getEnabledMetrics')) {
  const lines = content.split('\n');
  let insertIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('// Get modules in order')) {
      insertIndex = i;
      break;
    }
  }

  if (insertIndex > 0) {
    const helperCode = `
  // Helper to get enabled metrics for a module
  const getEnabledMetrics = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    const enabledKeys = module?.enabledMetrics || DEFAULT_METRICS;
    return ALL_METRICS.filter(m => enabledKeys.includes(m.k)).map(m => ({ k: m.k, label: m.label }));
  };
`;
    lines.splice(insertIndex, 0, helperCode);
    content = lines.join('\n');
    changesMade.push('Added getEnabledMetrics helper');
  }
}

// Write file
fs.writeFileSync(filePath, content, 'utf8');

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('Changes made:', changesMade);
console.log('Verification:');
console.log('  ALL_METRICS:', verify.includes('const ALL_METRICS'));
console.log('  DEFAULT_METRICS:', verify.includes("const DEFAULT_METRICS = ['spend'"));
console.log('  enabledMetrics:', verify.includes('enabledMetrics:'));
console.log('  getEnabledMetrics:', verify.includes('getEnabledMetrics'));
