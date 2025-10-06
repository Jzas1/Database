/**
 * Vercel Serverless Function - Dashboard API using Google Sheets
 */

const SHEET_ID = '1fxzBgdvOAnRy_OQhZEYLK9rttjagzukI4xajbxz7z68';
const SHEET_GID = '0';
const CLEARANCE_GID = '694714850'; // Clearance tab GID

async function fetchClearanceData() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${CLEARANCE_GID}`;
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error('Failed to fetch clearance sheet');

  const csvText = await response.text();
  const rows = csvText.split('\n').map(row => {
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

  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''));
  return rows.slice(1)
    .filter(row => row.length > 1 && row[0])
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        let value = row[i] || '';
        // Parse numbers
        if (header === 'ord_spots' || header === 'booked_gross' || header === 'spots_ran' ||
            header === 'cleared_gross' || header === 'booked_cf' || header === 'cleared_cf' ||
            header === 'pct_cleared') {
          value = value.replace(/[$,]/g, '');
          value = parseFloat(value) || 0;
        }
        obj[header] = value;
      });
      return obj;
    });
}

async function fetchSheetData() {
  const csvUrl = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;
  const response = await fetch(csvUrl);
  if (!response.ok) throw new Error('Failed to fetch sheet');

  const csvText = await response.text();
  const rows = csvText.split('\n').map(row => {
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

  const headers = rows[0].map(h => h.toLowerCase().replace(/\s+/g, '_').replace(/[()]/g, ''));
  return rows.slice(1)
    .filter(row => row.length > 1 && row[0])
    .map(row => {
      const obj = {};
      headers.forEach((header, i) => {
        let value = row[i] || '';
        // Parse numbers
        if (header === 'cost' || header === 'impressions' || header === 'responses' || header === 'sale') {
          value = value.replace(/[$,]/g, '');
          value = parseFloat(value) || 0;
        }
        // Parse dates to YYYY-MM-DD format
        else if (header === 'date' || header === 'week_of_mon') {
          if (value) {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
              // Format as YYYY-MM-DD
              const year = date.getFullYear();
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const day = String(date.getDate()).padStart(2, '0');
              value = `${year}-${month}-${day}`;
            }
          }
        }
        obj[header] = value;
      });
      return obj;
    });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { endpoint } = req.query;
    const data = await fetchSheetData();

    // Filter by query params
    const client = req.query.client;
    const start_date = req.query.start_date;
    const end_date = req.query.end_date;

    let filtered = data;
    if (client) filtered = filtered.filter(r => r.client === client);
    if (start_date) filtered = filtered.filter(r => r.date >= start_date);
    if (end_date) filtered = filtered.filter(r => r.date <= end_date);

    // Route to different endpoints
    switch (endpoint) {
      case 'clients':
        const clients = [...new Set(data.map(r => r.client))].filter(Boolean);
        return res.json(clients);

      case 'date-range':
        const dates = data.map(r => r.date).filter(Boolean).sort();
        return res.json({
          min_date: dates[0],
          max_date: dates[dates.length - 1]
        });

      case 'kpis':
        const kpis = {
          total_cost: filtered.reduce((sum, r) => sum + r.cost, 0),
          total_responses: filtered.reduce((sum, r) => sum + r.responses, 0),
          total_sales: filtered.reduce((sum, r) => sum + r.sale, 0),
          total_impressions: filtered.reduce((sum, r) => sum + r.impressions, 0)
        };
        kpis.avg_cost_per_sale = kpis.total_sales > 0 ? kpis.total_cost / kpis.total_sales : null;
        kpis.avg_cost_per_response = kpis.total_responses > 0 ? kpis.total_cost / kpis.total_responses : null;
        return res.json(kpis);

      case 'station-performance':
        const byStation = {};
        filtered.forEach(r => {
          if (!byStation[r.station]) byStation[r.station] = { station: r.station, total_cost: 0, total_responses: 0, total_sales: 0, total_impressions: 0 };
          byStation[r.station].total_cost += r.cost;
          byStation[r.station].total_responses += r.responses;
          byStation[r.station].total_sales += r.sale;
          byStation[r.station].total_impressions += r.impressions;
        });
        Object.values(byStation).forEach(s => {
          s.cost_per_sale = s.total_sales > 0 ? s.total_cost / s.total_sales : null;
          s.cost_per_response = s.total_responses > 0 ? s.total_cost / s.total_responses : null;
        });
        return res.json(Object.values(byStation).sort((a, b) => b.total_cost - a.total_cost));

      case 'daypart-performance':
        const byDaypart = {};
        filtered.forEach(r => {
          if (!byDaypart[r.daypart]) byDaypart[r.daypart] = { daypart: r.daypart, total_cost: 0, total_responses: 0, total_sales: 0, total_impressions: 0 };
          byDaypart[r.daypart].total_cost += r.cost;
          byDaypart[r.daypart].total_responses += r.responses;
          byDaypart[r.daypart].total_sales += r.sale;
          byDaypart[r.daypart].total_impressions += r.impressions;
        });
        Object.values(byDaypart).forEach(d => {
          d.cost_per_sale = d.total_sales > 0 ? d.total_cost / d.total_sales : null;
          d.cost_per_response = d.total_responses > 0 ? d.total_cost / d.total_responses : null;
        });
        return res.json(Object.values(byDaypart).sort((a, b) => b.total_cost - a.total_cost));

      case 'creative-performance':
        const byCreative = {};
        filtered.forEach(r => {
          if (!byCreative[r.creative]) byCreative[r.creative] = { creative: r.creative, total_cost: 0, total_sales: 0, total_responses: 0 };
          byCreative[r.creative].total_cost += r.cost;
          byCreative[r.creative].total_sales += r.sale;
          byCreative[r.creative].total_responses += r.responses;
        });
        Object.values(byCreative).forEach(c => {
          c.cost_per_sale = c.total_sales > 0 ? c.total_cost / c.total_sales : null;
        });
        return res.json(Object.values(byCreative).filter(c => c.total_sales > 0).sort((a, b) => b.total_sales - a.total_sales).slice(0, 20));

      case 'daily-trend':
        const byDate = {};
        filtered.forEach(r => {
          // Skip rows with invalid or empty dates
          if (!r.date || r.date === '' || r.date === 'Invalid Date') return;

          if (!byDate[r.date]) byDate[r.date] = { date: r.date, total_cost: 0, total_responses: 0, total_sales: 0, total_impressions: 0 };
          byDate[r.date].total_cost += r.cost;
          byDate[r.date].total_responses += r.responses;
          byDate[r.date].total_sales += r.sale;
          byDate[r.date].total_impressions += r.impressions;
        });
        return res.json(Object.values(byDate).filter(d => d.date).sort((a, b) => a.date.localeCompare(b.date)));

      case 'custom-breakdown':
        const dimensions = req.query.dimensions?.split(',') || ['station', 'daypart'];
        const grouped = {};
        filtered.forEach(r => {
          const key = dimensions.map(d => r[d]).join('|');
          if (!grouped[key]) {
            grouped[key] = { total_cost: 0, total_responses: 0, total_sales: 0, total_impressions: 0 };
            dimensions.forEach(d => grouped[key][d] = r[d]);
          }
          grouped[key].total_cost += r.cost;
          grouped[key].total_responses += r.responses;
          grouped[key].total_sales += r.sale;
          grouped[key].total_impressions += r.impressions;
        });
        Object.values(grouped).forEach(g => {
          g.cost_per_sale = g.total_sales > 0 ? g.total_cost / g.total_sales : null;
          g.cost_per_response = g.total_responses > 0 ? g.total_cost / g.total_responses : null;
        });
        return res.json(Object.values(grouped).sort((a, b) => b.total_cost - a.total_cost).slice(0, 500));

      case 'station-by-daypart':
        const byStationDaypart = {};
        filtered.forEach(r => {
          const key = `${r.station}|${r.daypart}`;
          if (!byStationDaypart[key]) byStationDaypart[key] = { station: r.station, daypart: r.daypart, total_cost: 0, total_responses: 0, total_sales: 0, total_impressions: 0 };
          byStationDaypart[key].total_cost += r.cost;
          byStationDaypart[key].total_responses += r.responses;
          byStationDaypart[key].total_sales += r.sale;
          byStationDaypart[key].total_impressions += r.impressions;
        });
        Object.values(byStationDaypart).forEach(s => {
          s.cost_per_sale = s.total_sales > 0 ? s.total_cost / s.total_sales : null;
          s.cost_per_response = s.total_responses > 0 ? s.total_cost / s.total_responses : null;
        });
        return res.json(Object.values(byStationDaypart).sort((a, b) => a.station.localeCompare(b.station) || b.total_cost - a.total_cost));

      case 'station-details':
        const station = req.query.station;
        if (!station) return res.status(400).json({ error: 'Station parameter required' });

        // Get master grain aggregates for this station
        const stationData = filtered.filter(r => r.station === station);
        const metrics = {
          total_cost: stationData.reduce((sum, r) => sum + r.cost, 0),
          total_impressions: stationData.reduce((sum, r) => sum + r.impressions, 0),
          total_responses: stationData.reduce((sum, r) => sum + r.responses, 0),
          total_sales: stationData.reduce((sum, r) => sum + r.sale, 0)
        };
        metrics.cpm = metrics.total_impressions > 0 ? (metrics.total_cost / metrics.total_impressions) * 1000 : null;

        // Get best daypart
        const dayparts = {};
        stationData.forEach(r => {
          if (!dayparts[r.daypart]) dayparts[r.daypart] = { daypart: r.daypart, total_sales: 0, total_cost: 0 };
          dayparts[r.daypart].total_sales += r.sale;
          dayparts[r.daypart].total_cost += r.cost;
        });
        const bestDaypart = Object.values(dayparts).sort((a, b) => b.total_sales - a.total_sales)[0] || null;
        if (bestDaypart) {
          bestDaypart.cost_per_sale = bestDaypart.total_sales > 0 ? bestDaypart.total_cost / bestDaypart.total_sales : null;
        }

        // Get best creative
        const creatives = {};
        stationData.forEach(r => {
          if (!creatives[r.creative]) creatives[r.creative] = { creative: r.creative, total_sales: 0, total_cost: 0 };
          creatives[r.creative].total_sales += r.sale;
          creatives[r.creative].total_cost += r.cost;
        });
        const bestCreative = Object.values(creatives).sort((a, b) => b.total_sales - a.total_sales)[0] || null;
        if (bestCreative) {
          bestCreative.cost_per_sale = bestCreative.total_sales > 0 ? bestCreative.total_cost / bestCreative.total_sales : null;
        }

        // Get clearance data
        const clearanceData = await fetchClearanceData();
        const clearanceFiltered = clearanceData.filter(r => r.station && r.station.trim() === station.trim());
        if (start_date) clearanceFiltered = clearanceFiltered.filter(r => r.week_of >= start_date);
        if (end_date) clearanceFiltered = clearanceFiltered.filter(r => r.week_of <= end_date);

        const clearance = {
          total_booked_cf: clearanceFiltered.reduce((sum, r) => sum + (r.booked_cf || 0), 0),
          total_cleared_cf: clearanceFiltered.reduce((sum, r) => sum + (r.cleared_cf || 0), 0),
          total_spots_ran: clearanceFiltered.reduce((sum, r) => sum + (r.spots_ran || 0), 0),
          total_ord_spots: clearanceFiltered.reduce((sum, r) => sum + (r.ord_spots || 0), 0)
        };
        clearance.clearance_pct = clearance.total_booked_cf > 0 ? clearance.total_cleared_cf / clearance.total_booked_cf : null;

        return res.json({
          station,
          metrics,
          best_daypart: bestDaypart,
          best_creative: bestCreative,
          clearance
        });

      default:
        return res.status(400).json({ error: 'Invalid endpoint' });
    }

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: error.message });
  }
}
