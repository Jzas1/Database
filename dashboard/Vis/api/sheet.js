// api/sheet.js
const SHEET_CSV =
  "https://docs.google.com/spreadsheets/d/17oT8mprXy-eANUML4UYEqKFTjBJf9wsdOzfGUC6n73Y/export?format=csv&gid=862366080";

// tiny CSV parser (handles quoted commas)
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
  return rows.filter(r => r.length && r.some(x => String(x).trim() !== ""));
}

const num = (v) => Number(String(v ?? 0).replace(/[$,]/g, "")) || 0;

export default async function handler(req, res) {
  try {
    const r = await fetch(SHEET_CSV, { cache: "no-store" });
    if (!r.ok) return res.status(502).json({ error: `CSV fetch ${r.status}` });

    const text = await r.text();
    const csv = parseCSV(text);
    if (!csv.length) return res.status(200).json({ rows: [] });

    const header = csv[0].map(h => String(h).trim());
    const idx = (name) => header.findIndex(h => h.toLowerCase() === name.toLowerCase());

    const cDay   = idx("Day");
    const cPub   = idx("Publisher Name");
    const cCr    = idx("Creative Name");
    const cImp   = idx("Impressions");
    const cSpend = idx("Total Spend");
    const cATC   = idx("Add To Cart");
    const cSurv  = idx("Survey");
    const cPurch = idx("Purchase");

    const rows = csv.slice(1).map(r => ({
      date:        r[cDay],
      pub:         r[cPub] || "Unknown",
      creative:    r[cCr]  || "Unknown",
      impressions: num(r[cImp]),
      spend:       num(r[cSpend]),
      addToCart:   num(r[cATC]),
      survey:      num(r[cSurv]),
      purchases:   num(r[cPurch]),
    }));

    res.status(200).json({ rows });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
}
