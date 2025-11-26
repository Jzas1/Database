const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Update DEFAULT_LAYOUT to include enabledMetrics for each heatmap module
const oldLayout = `const DEFAULT_LAYOUT = {
    modules: [
      { id: 'kpis', name: 'KPI Cards', visible: true },
      { id: 'dailyChart', name: 'Daily Spend & Impressions', visible: true },
      { id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true },
      { id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true },
      { id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true },
      { id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true },
      { id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true },
      { id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true },
    ]
  };`;

const newLayout = `const DEFAULT_LAYOUT = {
    modules: [
      { id: 'kpis', name: 'KPI Cards', visible: true },
      { id: 'dailyChart', name: 'Daily Spend & Impressions', visible: true },
      { id: 'channelHeatmap', name: 'Channel Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'creativeHeatmap', name: 'Creative Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'daypartHeatmap', name: 'Daypart Heatmap', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'dayOfWeekHeatmap', name: 'Day of Week', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'channelByDaypart', name: 'Channel by Daypart', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
      { id: 'channelByCreative', name: 'Channel by Creative', visible: true, heatmapEnabled: true, enabledMetrics: DEFAULT_METRICS },
    ]
  };`;

if (content.includes(oldLayout)) {
  content = content.replace(oldLayout, newLayout);
  console.log('1. Updated DEFAULT_LAYOUT with enabledMetrics');
} else {
  console.log('1. DEFAULT_LAYOUT already has enabledMetrics or different format');
}

// 2. Add getEnabledMetrics helper after isHeatmapEnabled
const afterHeatmapEnabled = `// Helper to check if heatmap is enabled for a module
  const isHeatmapEnabled = (moduleId) => {
    const module = layout.modules.find(m => m.id === moduleId);
    return module?.heatmapEnabled !== false; // default to true
  };`;

const withGetEnabledMetrics = `// Helper to check if heatmap is enabled for a module
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

if (!content.includes('getEnabledMetrics')) {
  content = content.replace(afterHeatmapEnabled, withGetEnabledMetrics);
  console.log('2. Added getEnabledMetrics helper');
} else {
  console.log('2. getEnabledMetrics already exists');
}

// 3. Update placementTotals to include spotCount and respConvRate
const oldPlacementReturn = `return [...m.values()].map((p) => ({
      ...p,
      cpm: (p.spend / Math.max(p.impressions, 1)) * 1000,
      cpc: p.spend / Math.max(p.conversions, 1),
      cpr: p.spend / Math.max(p.responses, 1),
      roas: p.revenue / Math.max(p.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  const daypartTotals`;

const newPlacementReturn = `return [...m.values()].map((p) => ({
      ...p,
      cpm: (p.spend / Math.max(p.impressions, 1)) * 1000,
      cpc: p.spend / Math.max(p.conversions, 1),
      cpr: p.spend / Math.max(p.responses, 1),
      roas: p.revenue / Math.max(p.spend, 1),
      respConvRate: p.conversions / Math.max(p.responses, 1),
    }));
  }, [filteredRows, multiplier]);

  const daypartTotals`;

if (content.includes(oldPlacementReturn)) {
  content = content.replace(oldPlacementReturn, newPlacementReturn);
  console.log('3. Added respConvRate to placementTotals');
} else {
  console.log('3. placementTotals already updated or different format');
}

// 4. Update daypartTotals to include spotCount and respConvRate
const oldDaypartReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  // Day of Week`;

const newDaypartReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
      respConvRate: d.conversions / Math.max(d.responses, 1),
    }));
  }, [filteredRows, multiplier]);

  // Day of Week`;

if (content.includes(oldDaypartReturn)) {
  content = content.replace(oldDaypartReturn, newDaypartReturn);
  console.log('4. Added respConvRate to daypartTotals');
} else {
  console.log('4. daypartTotals already updated or different format');
}

// 5. Update dayOfWeekTotals
const oldDowReturn = `return [...m.values()]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d) => ({
        ...d,
        cpc: d.spend / Math.max(d.conversions, 1),
        cpr: d.spend / Math.max(d.responses, 1),
        roas: d.revenue / Math.max(d.spend, 1),
      }));
  }, [filteredRows, multiplier]);

  // Channel by Daypart`;

const newDowReturn = `return [...m.values()]
      .sort((a, b) => a.dayIndex - b.dayIndex)
      .map((d) => ({
        ...d,
        cpc: d.spend / Math.max(d.conversions, 1),
        cpr: d.spend / Math.max(d.responses, 1),
        roas: d.revenue / Math.max(d.spend, 1),
        respConvRate: d.conversions / Math.max(d.responses, 1),
      }));
  }, [filteredRows, multiplier]);

  // Channel by Daypart`;

if (content.includes(oldDowReturn)) {
  content = content.replace(oldDowReturn, newDowReturn);
  console.log('5. Added respConvRate to dayOfWeekTotals');
} else {
  console.log('5. dayOfWeekTotals already updated or different format');
}

// 6. Update channelByDaypartTotals
const oldCbdReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  // Channel by Creative`;

const newCbdReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
      respConvRate: d.conversions / Math.max(d.responses, 1),
    }));
  }, [filteredRows, multiplier]);

  // Channel by Creative`;

if (content.includes(oldCbdReturn)) {
  content = content.replace(oldCbdReturn, newCbdReturn);
  console.log('6. Added respConvRate to channelByDaypartTotals');
} else {
  console.log('6. channelByDaypartTotals already updated or different format');
}

// 7. Update channelByCreativeTotals
const oldCbcReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
    }));
  }, [filteredRows, multiplier]);

  // totals KPIs`;

const newCbcReturn = `return [...m.values()].map((d) => ({
      ...d,
      cpc: d.spend / Math.max(d.conversions, 1),
      cpr: d.spend / Math.max(d.responses, 1),
      roas: d.revenue / Math.max(d.spend, 1),
      respConvRate: d.conversions / Math.max(d.responses, 1),
    }));
  }, [filteredRows, multiplier]);

  // totals KPIs`;

if (content.includes(oldCbcReturn)) {
  content = content.replace(oldCbcReturn, newCbcReturn);
  console.log('7. Added respConvRate to channelByCreativeTotals');
} else {
  console.log('7. channelByCreativeTotals already updated or different format');
}

// Write the updated content
fs.writeFileSync(filePath, content);
console.log('\nAll updates applied to ConversionDashboard.jsx');
