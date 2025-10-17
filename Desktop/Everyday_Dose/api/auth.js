import cookieParser from 'cookie-parser';

const DASHBOARD_PASSWORD = 'mynt2025';
const COOKIE_SECRET = process.env.COOKIE_SECRET || 'everyday-dose-secret-key-change-in-production';

// Helper to parse cookies
function parseCookies(req) {
  const cookies = {};
  const signedCookies = {};

  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      const name = parts[0].trim();
      const value = decodeURIComponent(parts.slice(1).join('='));

      if (name.startsWith('s:')) {
        // Signed cookie
        signedCookies[name.substring(2)] = value;
      } else {
        cookies[name] = value;
      }
    });
  }

  return { cookies, signedCookies };
}

function isAuthenticated(req) {
  const { signedCookies } = parseCookies(req);
  return signedCookies.auth === 's:authenticated.' + COOKIE_SECRET;
}

export default async function handler(req, res) {
  // Handle CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Cookie');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET - Check auth status
  if (req.method === 'GET') {
    const authenticated = isAuthenticated(req);
    res.json({ authenticated });
    return;
  }

  // POST - Login
  if (req.method === 'POST') {
    const { password } = req.body;

    if (password === DASHBOARD_PASSWORD) {
      // Set signed cookie
      res.setHeader('Set-Cookie', `auth=s:authenticated.${COOKIE_SECRET}; HttpOnly; Path=/; Max-Age=86400; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      res.json({ success: true });
    } else {
      res.status(401).json({ success: false, message: 'Invalid password' });
    }
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
