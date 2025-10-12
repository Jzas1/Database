# Google Sheets API Setup Guide

## Step-by-Step Instructions

### 1. Go to Google Cloud Console
Visit: https://console.cloud.google.com/

### 2. Create or Select a Project
- Click the project dropdown at the top
- Click "New Project"
- Name it: "Prenuvo Automation" (or any name you prefer)
- Click "Create"

### 3. Enable Google Sheets API
- In the search bar at the top, search for "Google Sheets API"
- Click on "Google Sheets API"
- Click "Enable"

### 4. Create Service Account Credentials
1. In the left sidebar, click "Credentials"
2. Click "Create Credentials" at the top
3. Select "Service Account"
4. Fill in the details:
   - Service account name: `prenuvo-automation`
   - Service account ID: (auto-filled)
   - Click "Create and Continue"
5. Skip the optional steps (click "Continue" then "Done")

### 5. Create and Download JSON Key
1. You'll see your service account listed
2. Click on the service account email (looks like: `prenuvo-automation@...iam.gserviceaccount.com`)
3. Go to the "Keys" tab
4. Click "Add Key" → "Create new key"
5. Choose "JSON" format
6. Click "Create"
7. A JSON file will download automatically

### 6. Rename and Move the JSON File
- Find the downloaded JSON file (usually in Downloads folder)
- Rename it to: `credentials.json`
- Move it to: `C:\Users\joe\desktop\click\`

### 7. Share the Google Sheet
1. Open the JSON file you just saved
2. Find the line with `"client_email"` - copy that email address
3. Go to your Google Sheet: https://docs.google.com/spreadsheets/d/15p-R9xAMGSj1mcgJRkJO8xz9f0Ip1R1oIBYhxiWfyRE/edit
4. Click "Share" button in top-right
5. Paste the service account email
6. Make sure it has "Editor" access
7. Uncheck "Notify people" (it's a bot, no need to notify)
8. Click "Share"

### 8. Install Required Python Packages
Open command prompt in the click folder and run:
```bash
pip install pandas gspread oauth2client
```

### 9. Test the Integration
Run the append script:
```bash
python append_to_google_sheets.py
```

## Troubleshooting

### If you get "credentials.json not found"
- Make sure the file is in: `C:\Users\joe\desktop\click\credentials.json`
- Make sure it's named exactly `credentials.json` (not `credentials.json.txt`)

### If you get permission denied
- Make sure you shared the Google Sheet with the service account email
- Make sure the service account has "Editor" access (not just "Viewer")

### If you get API not enabled
- Go back to step 3 and make sure you enabled the Google Sheets API
- Wait a few minutes for it to propagate

## What the Script Does

Once credentials are set up, the script will:
1. Find the latest CSV files in downloads folders
2. Read each CSV into memory
3. Connect to your Google Sheet
4. For each tab (delivery, actions, response):
   - Read existing data from the tab
   - Compare new data with existing data
   - Only append rows that don't already exist (deduplication)
   - Show you how many rows were added

## Daily Workflow After Setup

Once everything is working, your daily workflow will be:

1. **Request exports** (run these 3 scripts):
   ```bash
   python innovid_automation.py
   python prenuvo_export.py
   python prenuvo_response_export.py
   ```

2. **Wait for downloads** (optional - run the monitor):
   ```bash
   python prenuvo_gmail_monitor.py
   ```
   OR just wait for the TVSquared emails and download manually

3. **Append to Google Sheets**:
   ```bash
   python append_to_google_sheets.py
   ```

That's it! The data will be in your Google Sheet without duplicates.

---

**Created:** October 11, 2025
