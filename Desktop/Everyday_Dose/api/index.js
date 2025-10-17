import express from 'express';
import cookieParser from 'cookie-parser';
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// IMPORTANT: Change this password to your desired password
const DASHBOARD_PASSWORD = 'mynt2025';

// Secret for signing cookies
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'everyday-dose-secret-key-change-in-production';

// Google Sheets Configuration
const SHEET_ID = '1F99B8A4BUH4KIBfmyZgXzMxaFuIBQ3REaZJVgRYEttw';
const SHEET_NAME = 'Delivery Data';

app.use(express.json());
app.use(cookieParser(COOKIE_SECRET));

// Serve static files
app.use('/videos', express.static(path.join(__dirname, '../'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.set('Content-Type', 'video/mp4');
    } else if (path.endsWith('.mov')) {
      res.set('Content-Type', 'video/quicktime');
    }
  }
}));

app.use('/images', express.static(path.join(__dirname, '../'), {
  setHeaders: (res, path) => {
    if (path.endsWith('.jpg') || path.endsWith('.jpeg')) {
      res.set('Content-Type', 'image/jpeg');
    } else if (path.endsWith('.png')) {
      res.set('Content-Type', 'image/png');
    } else if (path.endsWith('.svg')) {
      res.set('Content-Type', 'image/svg+xml');
    }
  }
}));

// Helper function to check if user is authenticated via cookie
function isAuthenticated(req) {
  return req.signedCookies.auth === 'authenticated';
}

// Check auth status
app.get('/api/auth', (req, res) => {
  res.json({ authenticated: isAuthenticated(req) });
});

// Login endpoint
app.post('/api/auth', (req, res) => {
  const { password } = req.body;

  if (password === DASHBOARD_PASSWORD) {
    // Set signed cookie that lasts 24 hours
    res.cookie('auth', 'authenticated', {
      signed: true,
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  res.clearCookie('auth');
  res.json({ success: true });
});

// Google Sheets data endpoint
app.get('/api/sheet-data', async (req, res) => {
  try {
    // Use environment variable for credentials in production
    let credentials;
    if (process.env.GOOGLE_CREDENTIALS) {
      credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    } else {
      const credPath = path.join(__dirname, '../credentials.json');
      if (!fs.existsSync(credPath)) {
        return res.status(500).json({
          error: 'Credentials file not found. Please set up Google Service Account.'
        });
      }
      credentials = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    }

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_NAME,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.json({ data: [] });
    }

    const csv = rows.map(row => row.join(',')).join('\n');
    res.json({ data: csv });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({
      error: 'Failed to fetch sheet data',
      message: error.message
    });
  }
});

export default app;
