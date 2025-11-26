const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Add the new code after fmtUsd2 function
const insertAfter = `catch { return \`\$\${(Math.round(v * 100) / 100).toFixed(2).replace(/\\B(?=(\\d{3})+(?!\\d))/g, ",")}\`; }
};`;

const newCode = `

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

if (!content.includes('ALL_METRICS')) {
  content = content.replace(insertAfter, insertAfter + newCode);
  fs.writeFileSync(filePath, content);
  console.log('Added ALL_METRICS to ConversionDashboard.jsx');
} else {
  console.log('ALL_METRICS already exists');
}
