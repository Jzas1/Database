import express from 'express';
import session from 'express-session';
import { google } from 'googleapis';
import fs from 'fs';

const app = express();
const PORT = 3001;

// IMPORTANT: Change this password to your desired password
const DASHBOARD_PASSWORD = 'mynt2025';

// Google Sheets Configuration
const SHEET_ID = '1F99B8A4BUH4KIBfmyZgXzMxaFuIBQ3REaZJVgRYEttw';
const SHEET_NAME = 'Delivery Data';
const CREDENTIALS_PATH = './credentials.json';

app.use(express.json());

// Serve video files from root directory
app.use('/videos', express.static('./', {
  setHeaders: (res, path) => {
    if (path.endsWith('.mp4')) {
      res.set('Content-Type', 'video/mp4');
    } else if (path.endsWith('.mov')) {
      res.set('Content-Type', 'video/quicktime');
    }
  }
}));

// Serve image files from root directory
app.use('/images', express.static('./', {
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

app.use(
  session({
    secret: 'your-session-secret-key-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: false, // Set to true if using HTTPS
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    },
  })
);

// Check auth status
app.get('/api/auth', (req, res) => {
  res.json({ authenticated: req.session.authenticated || false });
});

// Login endpoint
app.post('/api/auth', (req, res) => {
  const { password } = req.body;

  if (password === DASHBOARD_PASSWORD) {
    req.session.authenticated = true;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: 'Invalid password' });
  }
});

// Logout endpoint
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Google Sheets data endpoint
app.get('/api/sheet-data', async (req, res) => {
  try {
    // Check if credentials file exists
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      return res.status(500).json({
        error: 'Credentials file not found. Please set up Google Service Account.'
      });
    }

    // Load credentials
    const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

    // Create auth client
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    });

    const authClient = await auth.getClient();
    const sheets = google.sheets({ version: 'v4', auth: authClient });

    // Fetch sheet data
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: SHEET_ID,
      range: SHEET_NAME,
    });

    const rows = response.data.values;

    if (!rows || rows.length === 0) {
      return res.json({ data: [] });
    }

    // Convert to CSV format for compatibility with existing frontend
    // Properly escape values that contain commas, quotes, or newlines
    function escapeCsvValue(value) {
      const str = String(value ?? '');
      // If value contains comma, quote, or newline, wrap in quotes and escape quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    }

    const csv = rows.map(row => row.map(escapeCsvValue).join(',')).join('\n');

    res.json({ data: csv });
  } catch (error) {
    console.error('Error fetching sheet data:', error);
    res.status(500).json({
      error: 'Failed to fetch sheet data',
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Auth server running on http://localhost:${PORT}`);
  console.log(`Remember to change the DASHBOARD_PASSWORD in server.js`);
  console.log(`Make sure credentials.json is in the root directory`);
});
