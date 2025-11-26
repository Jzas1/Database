const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add getEnabledMetrics helper after isHeatmapEnabled
if (!content.includes('getEnabledMetrics')) {
  const searchStr = `// Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };`;

  const replaceStr = `// Helper to check if heatmap is enabled for a module
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

  if (content.includes(searchStr)) {
    content = content.replace(searchStr, replaceStr);
    console.log('Added getEnabledMetrics helper');
  } else {
    console.log('Could not find isHeatmapEnabled to add helper after');
  }
}

// Write the file
fs.writeFileSync(filePath, content);
console.log('getEnabledMetrics exists:', content.includes('getEnabledMetrics'));
