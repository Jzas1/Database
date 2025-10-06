#!/usr/bin/env node
/**
 * Mynt Dashboard API - Connects to Cloud SQL Postgres
 * Provides endpoints for performance data visualization
 */

import express from 'express';
import pg from 'pg';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config({ path: '../../.env' }); // Load from main project .env

const app = express();
const PORT = process.env.API_PORT || 3001;

// Database connection
const pool = new pg.Pool({
  host: process.env.DB_HOST || '34.9.22.182',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'mynt',
  user: process.env.DB_USER || 'writerapp',
  password: process.env.DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW()');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: result.rows[0].now
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Get available date range
app.get('/api/date-range', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        MIN(date) as min_date,
        MAX(date) as max_date
      FROM mynt.fact_master_grain
    `);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Date range error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get clients
app.get('/api/clients', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT DISTINCT client_name
      FROM mynt.fact_master_grain
      ORDER BY client_name
    `);
    res.json(result.rows.map(r => r.client_name));
  } catch (error) {
    console.error('Clients error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get KPIs (total metrics)
app.get('/api/kpis', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as avg_cost_per_sale,
        CASE WHEN SUM(responses) > 0 THEN SUM(cost) / SUM(responses) ELSE NULL END as avg_cost_per_response
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (error) {
    console.error('KPIs error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Station performance
app.get('/api/station-performance', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        station,
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale,
        CASE WHEN SUM(responses) > 0 THEN SUM(cost) / SUM(responses) ELSE NULL END as cost_per_response
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY station
      ORDER BY total_cost DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Station performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Daypart performance
app.get('/api/daypart-performance', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        daypart,
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale,
        CASE WHEN SUM(responses) > 0 THEN SUM(cost) / SUM(responses) ELSE NULL END as cost_per_response
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY daypart
      ORDER BY total_cost DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Daypart performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get Station by Daypart (heatmap data)
app.get('/api/station-by-daypart', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        station,
        daypart,
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale,
        CASE WHEN SUM(responses) > 0 THEN SUM(cost) / SUM(responses) ELSE NULL END as cost_per_response
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY station, daypart
      ORDER BY station, total_cost DESC
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Station by daypart error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get custom breakdown (flexible dimensions)
app.get('/api/custom-breakdown', async (req, res) => {
  try {
    const { client, start_date, end_date, dimensions } = req.query;
    console.log('Custom breakdown request:', { client, start_date, end_date, dimensions });

    // dimensions can be: creative, station, daypart, market (comma-separated)
    const validDimensions = ['creative', 'station', 'daypart', 'market'];
    const selectedDimensions = dimensions
      ? dimensions.split(',').filter(d => validDimensions.includes(d))
      : ['station', 'daypart'];

    if (selectedDimensions.length === 0) {
      return res.status(400).json({ error: 'No valid dimensions provided' });
    }

    const dimColumns = selectedDimensions.join(', ');

    let query = `
      SELECT
        ${dimColumns},
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale,
        CASE WHEN SUM(responses) > 0 THEN SUM(cost) / SUM(responses) ELSE NULL END as cost_per_response
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY ${dimColumns}
      ORDER BY total_cost DESC
      LIMIT 500
    `;

    console.log('Executing query:', query);
    console.log('With params:', params);

    const result = await pool.query(query, params);
    console.log('Custom breakdown returned', result.rows.length, 'rows');
    res.json(result.rows);
  } catch (error) {
    console.error('Custom breakdown error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get creative performance for bubble chart
app.get('/api/creative-performance', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        creative,
        SUM(cost) as total_cost,
        SUM(sale) as total_sales,
        SUM(responses) as total_responses,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY creative
      HAVING SUM(sale) > 0
      ORDER BY total_sales DESC
      LIMIT 20
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Creative performance error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get daily trend
app.get('/api/daily-trend', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        date,
        SUM(cost) as total_cost,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        SUM(impressions) as total_impressions
      FROM mynt.fact_master_grain
      WHERE 1=1
    `;

    const params = [];
    if (client) {
      params.push(client);
      query += ` AND client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      query += ` AND date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND date <= $${params.length}`;
    }

    query += `
      GROUP BY date
      ORDER BY date
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Daily trend error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get station details (clearance, best daypart, best creative, CPM)
app.get('/api/station-details/:station', async (req, res) => {
  try {
    const { station } = req.params;
    const { client, start_date, end_date } = req.query;

    const params = [station];
    let whereClause = 'WHERE mg.station = $1';

    if (client) {
      params.push(client);
      whereClause += ` AND mg.client_name = $${params.length}`;
    }
    if (start_date) {
      params.push(start_date);
      whereClause += ` AND mg.date >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      whereClause += ` AND mg.date <= $${params.length}`;
    }

    // Get master grain aggregates
    const masterGrainQuery = `
      SELECT
        SUM(cost) as total_cost,
        SUM(impressions) as total_impressions,
        SUM(responses) as total_responses,
        SUM(sale) as total_sales,
        CASE WHEN SUM(impressions) > 0 THEN (SUM(cost) / SUM(impressions)) * 1000 ELSE NULL END as cpm
      FROM mynt.fact_master_grain mg
      ${whereClause}
    `;

    // Get best daypart
    const bestDaypartQuery = `
      SELECT
        daypart,
        SUM(sale) as total_sales,
        SUM(cost) as total_cost,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale
      FROM mynt.fact_master_grain mg
      ${whereClause}
      GROUP BY daypart
      ORDER BY total_sales DESC
      LIMIT 1
    `;

    // Get best creative
    const bestCreativeQuery = `
      SELECT
        creative,
        SUM(sale) as total_sales,
        SUM(cost) as total_cost,
        CASE WHEN SUM(sale) > 0 THEN SUM(cost) / SUM(sale) ELSE NULL END as cost_per_sale
      FROM mynt.fact_master_grain mg
      ${whereClause}
      GROUP BY creative
      ORDER BY total_sales DESC
      LIMIT 1
    `;

    // Get clearance data (if available)
    let clearanceQuery = `
      SELECT
        SUM(booked_cf) as total_booked_cf,
        SUM(cleared_cf) as total_cleared_cf,
        SUM(spots_ran) as total_spots_ran,
        SUM(ord_spots) as total_ord_spots,
        CASE WHEN SUM(booked_cf) > 0 THEN SUM(cleared_cf) / SUM(booked_cf) ELSE NULL END as clearance_pct
      FROM mynt.fact_clearance
      WHERE TRIM(station) = $1
    `;

    const clearanceParams = [station];
    if (start_date) {
      clearanceParams.push(start_date);
      clearanceQuery += ` AND week_of >= $${clearanceParams.length}`;
    }
    if (end_date) {
      clearanceParams.push(end_date);
      clearanceQuery += ` AND week_of <= $${clearanceParams.length}`;
    }

    const [masterGrain, bestDaypart, bestCreative, clearance] = await Promise.all([
      pool.query(masterGrainQuery, params),
      pool.query(bestDaypartQuery, params),
      pool.query(bestCreativeQuery, params),
      pool.query(clearanceQuery, clearanceParams)
    ]);

    res.json({
      station,
      metrics: masterGrain.rows[0],
      best_daypart: bestDaypart.rows[0] || null,
      best_creative: bestCreative.rows[0] || null,
      clearance: clearance.rows[0] || null
    });
  } catch (error) {
    console.error('Station details error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✓ API server running on http://localhost:${PORT}`);
  console.log(`✓ Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
  console.log(`✓ Health check: http://localhost:${PORT}/health`);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing database pool...');
  await pool.end();
  process.exit(0);
});
