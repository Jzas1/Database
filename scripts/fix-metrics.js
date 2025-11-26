const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../components/ConversionDashboard.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// Find the line after fmtUsd2 function ends with }; and before function parseMDY
const lines = content.split('\n');
let insertIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('function parseMDY(mdy)')) {
    insertIndex = i;
    break;
  }
}

if (insertIndex > 0 && !content.includes('ALL_METRICS')) {
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
  console.log('Added ALL_METRICS and DEFAULT_METRICS at line', insertIndex);
}

// Write the file
fs.writeFileSync(filePath, content);

// Verify
const verify = fs.readFileSync(filePath, 'utf8');
console.log('ALL_METRICS exists:', verify.includes('ALL_METRICS'));
console.log('DEFAULT_METRICS definition exists:', verify.includes("const DEFAULT_METRICS = ['spend'"));
