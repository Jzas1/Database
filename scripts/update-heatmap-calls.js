const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace hardcoded metrics with getEnabledMetrics() calls

// Channel Heatmap
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.placementTotals\]\}[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('channelHeatmap'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'channelHeatmap\')}'
);

// Creative Heatmap
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.creativeTotals\]\.slice[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('creativeHeatmap'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'creativeHeatmap\')}'
);

// Daypart Heatmap
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.daypartTotals\]\}[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('daypartHeatmap'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'daypartHeatmap\')}'
);

// Day of Week Heatmap
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.dayOfWeekTotals\]\}[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('dayOfWeekHeatmap'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'dayOfWeekHeatmap\')}'
);

// Channel by Daypart
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.channelByDaypartTotals\]\}[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('channelByDaypart'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'channelByDaypart\')}'
);

// Channel by Creative
content = content.replace(
  /(<Heatmap[\s\S]*?rows=\{\[\.\.\.channelByCreativeTotals\]\}[\s\S]*?heatmapEnabled=\{isHeatmapEnabled\('channelByCreative'\)\}[\s\S]*?)metrics=\{\[[\s\S]*?\]\}/,
  '$1metrics={getEnabledMetrics(\'channelByCreative\')}'
);

fs.writeFileSync(filePath, content);

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
const count = (verify.match(/getEnabledMetrics\(/g) || []).length;
console.log('getEnabledMetrics calls found:', count);
