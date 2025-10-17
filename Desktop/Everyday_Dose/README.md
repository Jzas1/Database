# Everyday Dose Performance Dashboard

A React-based analytics dashboard for tracking marketing performance metrics including spend, impressions, conversions, and more.

## Features

- Real-time data loading from Google Sheets
- Interactive date range filtering
- KPI cards showing key metrics
- Daily performance charts
- Publisher and Creative heatmaps with sortable columns
- Password-protected access

## Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- A Google Sheet with marketing data

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Google Sheet Data Source

1. Open your Google Sheet with Everyday Dose marketing data
2. Make sure the sheet has these columns:
   - Day (date in M/D/YYYY format)
   - Publisher Name
   - Creative Name
   - Impressions
   - Total Spend
   - checkoutcompleted
   - revenue

3. Get the CSV export URL:
   - Go to File > Share > Publish to web
   - Choose the specific sheet/tab
   - Select "Comma-separated values (.csv)"
   - Copy the URL

4. Update the data source in `components/ConversionDashboard.jsx`:
   ```javascript
   const SHEET_CSV = "YOUR_GOOGLE_SHEET_CSV_URL_HERE";
   ```

### 3. Configure Authentication

1. Open `server.js`
2. Change the password:
   ```javascript
   const DASHBOARD_PASSWORD = 'your_secure_password_here';
   ```
3. (Optional) Update the session secret for added security

### 4. Run the Application

You need to run two servers:

**Terminal 1 - Backend Server:**
```bash
npm run server
```

**Terminal 2 - Frontend Dev Server:**
```bash
npm run dev
```

The dashboard will be available at `http://localhost:5173`

## Project Structure

```
Everyday_Dose/
├── components/
│   ├── ConversionDashboard.jsx  # Main dashboard component
│   └── Login.jsx                # Login page
├── App.jsx                      # Main app with auth logic
├── main.jsx                     # React entry point
├── index.css                    # Global styles
├── server.js                    # Express auth server
├── package.json                 # Dependencies
├── vite.config.js              # Vite configuration
├── tailwind.config.js          # Tailwind CSS config
└── index.html                  # HTML entry point
```

## Dashboard Metrics

The dashboard tracks and displays:

- **Total Spend**: Sum of all marketing spend
- **Total Revenue**: Total revenue generated from conversions
- **Conversions**: Number of completed checkouts
- **ROAS**: Return on Ad Spend (Revenue / Spend)
- **Avg CPC**: Average cost per conversion
- **Revenue per Publisher/Creative**: Revenue breakdown by source
- **Impressions**: Total ad impressions tracked

## Customization

### Change Color Scheme

Edit the `COLORS` object in `components/ConversionDashboard.jsx`:

```javascript
const COLORS = {
  spend: "#1f77b4", // mid blue
  impr: "#6baed6",  // light blue
};
```

### Modify Metrics

Update the `metrics` array in the Heatmap components to add/remove columns.

## Building for Production

```bash
npm run build
```

The production build will be in the `dist/` directory.

## Troubleshooting

### Data not loading
- Check that the Google Sheet CSV URL is correct and publicly accessible
- Verify the sheet has the correct column names
- Check browser console for errors

### Authentication not working
- Make sure the backend server is running on port 3001
- Check that vite.config.js has the correct proxy configuration

## Support

For issues or questions, contact your development team.
