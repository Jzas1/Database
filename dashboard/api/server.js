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
        MIN(week_of) as min_date,
        MAX(week_of) as max_date
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
      query += ` AND week_of >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND week_of <= $${params.length}`;
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
        SUM(actions_total) as total_actions,
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
      query += ` AND week_of >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND week_of <= $${params.length}`;
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
        SUM(actions_total) as total_actions,
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
      query += ` AND week_of >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND week_of <= $${params.length}`;
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
        SUM(actions_total) as total_actions,
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
      query += ` AND week_of >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND week_of <= $${params.length}`;
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

// Get weekly trend
app.get('/api/weekly-trend', async (req, res) => {
  try {
    const { client, start_date, end_date } = req.query;

    let query = `
      SELECT
        week_of,
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
      query += ` AND week_of >= $${params.length}`;
    }
    if (end_date) {
      params.push(end_date);
      query += ` AND week_of <= $${params.length}`;
    }

    query += `
      GROUP BY week_of
      ORDER BY week_of
    `;

    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (error) {
    console.error('Weekly trend error:', error);
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
