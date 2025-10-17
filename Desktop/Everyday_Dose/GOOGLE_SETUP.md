# Google Service Account Setup Guide

This guide will help you set up secure access to your private Google Sheet without making it publicly accessible.

## Why Use a Service Account?

Instead of making your Google Sheet public, a service account allows your dashboard backend to authenticate with Google and access your private sheet securely.

## Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Name it "Everyday Dose Dashboard" (or any name you prefer)
4. Click "Create"

### 2. Enable Google Sheets API

1. In your project, go to "APIs & Services" → "Library"
2. Search for "Google Sheets API"
3. Click on it and click "Enable"

### 3. Create a Service Account

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "Service Account"
3. Fill in the details:
   - **Service account name**: `everyday-dose-dashboard`
   - **Service account ID**: (auto-filled)
   - Click "Create and Continue"
4. Skip optional steps by clicking "Continue" and "Done"

### 4. Create and Download Service Account Key

1. Click on the service account you just created
2. Go to the "Keys" tab
3. Click "Add Key" → "Create new key"
4. Select **JSON** format
5. Click "Create"
6. A JSON file will be downloaded - this is your credentials file

### 5. Install the Credentials File

1. Rename the downloaded file to `credentials.json`
2. Move it to your project root directory (same folder as `server.js`)
3. **IMPORTANT**: Make sure `credentials.json` is in your `.gitignore` file (it already is!)

### 6. Share Your Google Sheet with the Service Account

1. Open the downloaded `credentials.json` file
2. Find the `client_email` field (it looks like: `name@project-id.iam.gserviceaccount.com`)
3. Copy this email address
4. Open your Everyday Dose Google Sheet
5. Click the "Share" button
6. Paste the service account email
7. Give it **Viewer** access
8. Uncheck "Notify people" (it's a service account, not a person)
9. Click "Share"

### 7. Configure the Dashboard

1. Open `server.js`
2. Update the `SHEET_NAME` constant (line 14):
   ```javascript
   const SHEET_NAME = 'Sheet1'; // Change to your actual sheet tab name
   ```
3. The `SHEET_ID` is already configured from your Google Sheet URL

### 8. Test the Connection

1. Make sure you've installed dependencies:
   ```bash
   npm install
   ```

2. Start the backend server:
   ```bash
   npm run server
   ```

3. You should see:
   ```
   Auth server running on http://localhost:3001
   Remember to change the DASHBOARD_PASSWORD in server.js
   Make sure credentials.json is in the root directory
   ```

4. In another terminal, start the frontend:
   ```bash
   npm run dev
   ```

5. Open your browser to `http://localhost:5173` and login

## Security Notes

✅ **DO:**
- Keep `credentials.json` private and never commit it to git
- Only grant "Viewer" access to the service account
- Regularly rotate your service account keys (every 90 days recommended)

❌ **DON'T:**
- Share your credentials file with anyone
- Commit credentials.json to version control
- Give the service account "Editor" permissions (it only needs read access)

## Troubleshooting

### Error: "Credentials file not found"
- Make sure `credentials.json` is in the root directory (same folder as `server.js`)
- Check that the file is named exactly `credentials.json` (not `credentials (1).json`)

### Error: "The caller does not have permission"
- Make sure you shared the sheet with the service account email
- Verify the email matches the `client_email` in your `credentials.json`
- Check that you gave at least "Viewer" permission

### Error: "Unable to parse range"
- Make sure `SHEET_NAME` in `server.js` matches your sheet tab name exactly (case-sensitive)
- Try using the full range like `Sheet1!A1:Z` if you have issues

### Data not loading
- Check browser console for errors
- Verify the backend server is running on port 3001
- Make sure the sheet has data and the correct column names

## Alternative: Keep Using Public Sheet

If you prefer to keep using the public CSV approach (simpler but less secure):

1. Open `components/ConversionDashboard.jsx`
2. Change the fetch URL back to:
   ```javascript
   const r = await fetch(SHEET_CSV, { cache: "no-store" });
   ```
3. You won't need the credentials file

## Need Help?

If you run into issues:
1. Check that all steps above are completed
2. Verify the service account email is correct
3. Make sure the sheet tab name matches exactly
4. Check console logs for detailed error messages
