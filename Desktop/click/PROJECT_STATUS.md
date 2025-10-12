# Automation Project Status

## ✅ What's Working

### 1. Innovid Automation (`innovid_automation.py`)
**Status: COMPLETE ✅**
- Logs into Innovid Studio
- Navigates to campaign 224979 overview page
- Clicks 3-dots menu and exports campaign summary
- Downloads ZIP file
- Extracts ONLY `prenuvo_mynt_ctv_direct_io_Daily_Summary_pre_roll.csv`
- Renames to `delivery_data_{timestamp}.csv`
- Saves to: `downloads/innovid/`
- **Run:** `python innovid_automation.py`

### 2. Prenuvo All Action Export (`prenuvo_export.py`)
**Status: COMPLETE ✅**
- Logs into TVSquared (mynt-agency-xp)
- Navigates directly to Prenuvo export page
- Handles redirect-to-login automatically
- Exports `Prenuvo_All_Action` report
- Date range: Last 7 days
- **Run:** `python prenuvo_export.py`

### 3. Prenuvo Response Export (`prenuvo_response_export.py`)
**Status: COMPLETE ✅**
- Logs into TVSquared (mynt-agency-xp)
- Navigates directly to Prenuvo export page
- Handles redirect-to-login automatically
- Exports `Prenuvo_Response` report
- Date range: Last 7 days
- **Run:** `python prenuvo_response_export.py`

### 4. Gmail Monitor (`prenuvo_gmail_monitor.py`)
**Status: COMPLETE ✅**
- Monitors Gmail for TVSquared export emails
- Automatically downloads when "data exported" emails arrive
- Extracts CSV files from ZIP downloads
- Saves to: `downloads/prenuvo/`
- Files saved as:
  - `prenuvo_all_action_{timestamp}.csv`
  - `prenuvo_response_{timestamp}.csv`
- **Run:** `python prenuvo_gmail_monitor.py` (keeps running)

---

## 🚧 Next Steps - Google Sheets Integration

### Goal
Append the 3 CSV files to Google Sheet tabs WITHOUT duplicating data:
- **Sheet:** https://docs.google.com/spreadsheets/d/15p-R9xAMGSj1mcgJRkJO8xz9f0Ip1R1oIBYhxiWfyRE/edit
- **Tab mappings:**
  - `delivery` tab ← Innovid delivery_data CSV
  - `actions` tab ← Prenuvo all_action CSV
  - `response` tab ← Prenuvo response CSV

### What's Ready
- ✅ Script created: `append_to_google_sheets.py`
- ✅ Deduplication logic implemented (checks existing rows)
- ✅ Requirements added to `requirements.txt`

### What's Needed
1. **Google Sheets API Credentials**
   - Need to create `credentials.json` file
   - Steps to create:
     1. Go to https://console.cloud.google.com/
     2. Create/select project
     3. Enable Google Sheets API
     4. Create Service Account credentials
     5. Download JSON → save as `credentials.json` in click folder
     6. Share the Google Sheet with service account email

2. **Install new packages:**
   ```bash
   pip install pandas gspread oauth2client
   ```

3. **Test the append script:**
   ```bash
   python append_to_google_sheets.py
   ```

---

## 📁 Project Structure

```
click/
├── innovid_automation.py          # Innovid export automation
├── prenuvo_export.py               # Prenuvo All Action export
├── prenuvo_response_export.py     # Prenuvo Response export
├── prenuvo_gmail_monitor.py       # Email monitor & downloader
├── append_to_google_sheets.py     # Google Sheets append (needs credentials)
├── requirements.txt                # Python dependencies
├── .env.example                    # Config template
├── downloads/
│   ├── innovid/                    # Innovid delivery data
│   │   └── delivery_data_*.csv
│   └── prenuvo/                    # Prenuvo exports
│       ├── prenuvo_all_action_*.csv
│       └── prenuvo_response_*.csv
└── PROJECT_STATUS.md               # This file
```

---

## 🔑 Credentials

### Innovid
- Username: `shane@myntagency.com`
- Password: `MyntAgency2025$`
- Campaign: 224979

### TVSquared (Prenuvo)
- Username: `joe@myntagency.com`
- Password: `123Places12`
- Client: Mynt Agency XP/Prenuvo

### Gmail (for monitoring)
- Email: `joe@myntagency.com`
- App Password: `qbsz rgho lzzo fyxj`

---

## 🎯 Daily Workflow (Once Setup Complete)

1. **Request exports:**
   ```bash
   python innovid_automation.py
   python prenuvo_export.py
   python prenuvo_response_export.py
   ```

2. **Start monitor** (optional - auto-downloads Prenuvo):
   ```bash
   python prenuvo_gmail_monitor.py
   ```

3. **Append to Google Sheets:**
   ```bash
   python append_to_google_sheets.py
   ```

---

## 📝 Notes

- All scripts use clear cache to avoid session issues
- Download wait times increased to 30s for large files
- Prenuvo exports pull last 7 days of data
- Gmail monitor extracts ZIPs automatically
- Deduplication uses first column as unique key

---

**Last Updated:** October 11, 2025
**Status:** Ready for Google Sheets credentials setup
