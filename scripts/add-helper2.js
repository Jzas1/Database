const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find and replace
const searchStr = `  // Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };

  // Get modules in order`;

const replaceStr = `  // Helper to check if heatmap is enabled for a module
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

  // Get modules in order`;

if (!content.includes('getEnabledMetrics') && content.includes('// Get modules in order')) {
  content = content.replace(searchStr, replaceStr);
  fs.writeFileSync(filePath, content);
  console.log('Added getEnabledMetrics');
} else {
  console.log('getEnabledMetrics already exists or pattern not found');
}

console.log('getEnabledMetrics exists:', content.includes('getEnabledMetrics'));
