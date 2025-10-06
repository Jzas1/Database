/**
 * Vercel Serverless Function - Fetch data from Google Sheets
 */

const SHEET_ID = '1fxzBgdvOAnRy_OQhZEYLK9rttjagzukI4xajbxz7z68';
const SHEET_GID = '0';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Fetch CSV export from Google Sheets
    const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
    const response = await fetch(csvUrl);

    if (!response.ok) {
      throw new Error(`Failed to fetch sheet: ${response.statusText}`);
    }

    const csvText = await response.text();

    // Parse CSV to JSON
    const rows = csvText.split('\n').map(row => {
      // Handle quoted fields properly
      const fields = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < row.length; i++) {
        const char = row[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          fields.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      fields.push(current.trim());
      return fields;
    });

    // Get headers from first row
    const headers = rows[0];

    // Convert rows to objects
    const data = rows.slice(1)
      .filter(row => row.length > 1 && row[0]) // Skip empty rows
      .map(row => {
        const obj = {};
        headers.forEach((header, i) => {
          obj[header.toLowerCase().replace(/\s+/g, '_')] = row[i] || '';
        });
        return obj;
      });

    res.status(200).json({
      success: true,
      count: data.length,
      data: data
    });

  } catch (error) {
    console.error('Error fetching sheet:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}
