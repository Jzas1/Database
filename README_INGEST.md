# Weekly Performance Data Ingest to Cloud SQL

Automated ingestion of weekly performance CSV files into Cloud SQL (Postgres) for analytics.

## Overview

After your local Python processing (`auto6.py`) finishes, this script pushes the weekly CSV output into Cloud SQL and upserts into the `mynt.fact_performance_weekly` table.

**Key Features:**
- ✅ CSV → Staging → Fact table pipeline
- ✅ Data cleaning (strip `$`, `,` from numbers, parse multiple date formats)
- ✅ Upsert logic (latest data wins on conflict)
- ✅ Fast COPY-based bulk loading
- ✅ Automatic header/total row filtering

---

## Database Connection

**Cloud SQL Instance:**
- Host: `34.9.22.182`
- Port: `5432`
- Database: `mynt`
- User: `writer_app`
- SSL: Required

---

## Setup

### 1. Install Dependencies

```bash
pip install psycopg2-binary python-dotenv
```

### 2. Configure Environment Variables

Create a `.env` file in the project directory:

```bash
# Database credentials
DB_HOST=34.9.22.182
DB_PORT=5432
DB_NAME=mynt
DB_USER=writer_app
DB_PASSWORD=your_password_here
DB_SSLMODE=require
```

⚠️ **Never commit `.env` to git!** Add it to `.gitignore`.

### 3. Bootstrap Database Schema (ONE TIME)

Run the bootstrap SQL to create tables:

```bash
psql -h 34.9.22.182 -U writer_app -d mynt -f schema_bootstrap.sql
```

Or run manually in your SQL client.

---

## Usage

### Basic Usage

```bash
python ingest_weekly.py <csv_file> --client <client_name> [--source-tab <tab_name>]
```

### Example: Ingest Channel Data for Pacagen

```bash
python ingest_weekly.py channel_export.csv --client Pacagen --source-tab Channel
```

### Export CSV from Excel First

You need to export the "Channel" tab from your Output Excel file to CSV:

**Option 1: Python Script to Export**
```python
import pandas as pd

# Read specific tab and export to CSV
df = pd.read_excel('Output_20251004_083039.xlsx', sheet_name='Channel')
df.to_csv('channel_export.csv', index=False)
```

**Option 2: Manual Export in Excel**
1. Open `Output_YYYYMMDD_HHMMSS.xlsx`
2. Select "Channel" tab
3. Save As → CSV (Comma delimited)

### Full Workflow Example

```bash
# 1. Run your pipeline
python auto6.py

# 2. Export Channel tab to CSV
python -c "import pandas as pd; pd.read_excel('Output_20251004_083039.xlsx', sheet_name='Channel').to_csv('channel_export.csv', index=False)"

# 3. Ingest to database
python ingest_weekly.py channel_export.csv --client Pacagen --source-tab Channel
```

---

## How It Works

### 1. Data Flow

```
CSV File
  ↓ (COPY command - fast bulk load)
public._stg_weekly_ingest (staging - all text)
  ↓ (Clean + transform)
mynt.fact_performance_weekly (final - typed columns)
```

### 2. Data Cleaning

The script automatically:
- **Strips `$` and `,` from numbers**: `$1,234.56` → `1234.56`
- **Parses multiple date formats**:
  - `YYYY-MM-DD` → `2025-09-22`
  - `MM/DD/YYYY` → `09/22/2025`
  - `M/D/YYYY` → `9/22/2025`
- **Filters header/total rows**: Only rows with valid dates are inserted
- **Defaults**: `creative_code='ALL'`, `daypart='ALL'` (constants for now)

### 3. Upsert Logic

**Uniqueness Key:** `(client_name, week_start, station_name, creative_code, daypart)`

**On Conflict:** Latest data wins
- Updates: `cost`, `impressions`, `response`, `purchase`, `source_tab`, `source_file`, `updated_at`

---

## Schema

### Staging Table: `public._stg_weekly_ingest`

All columns are `text` for raw CSV loading:

```sql
CREATE TABLE public._stg_weekly_ingest (
    client_name text,
    station_name text,
    cost text,
    responses text,
    cost_per_response text,
    sale text,
    cost_per_sale text,
    week_start text,
    actions_total text,
    cost_per_actions_total text,
    impressions text,
    source_tab text,
    source_file text
);
```

### Fact Table: `mynt.fact_performance_weekly`

```sql
CREATE TABLE mynt.fact_performance_weekly (
    client_name text NOT NULL,
    week_start date NOT NULL,
    station_name text NOT NULL,
    creative_code text NOT NULL DEFAULT 'ALL',
    daypart text NOT NULL DEFAULT 'ALL',

    -- Metrics
    cost numeric(12,2),
    impressions bigint,
    response integer,
    purchase integer,

    -- Optional actions (for future)
    clicks, add_to_cart, checkout_initiated, etc.

    -- Lineage
    source_tab text,
    source_file text,
    updated_at timestamptz DEFAULT now(),

    PRIMARY KEY (client_name, week_start, station_name, creative_code, daypart)
);
```

---

## Verification

### Check staging table

```sql
SELECT COUNT(*) FROM public._stg_weekly_ingest;
```

### Check fact table

```sql
SELECT
    client_name,
    week_start,
    station_name,
    COUNT(*) as row_count,
    SUM(cost) as total_cost,
    SUM(response) as total_responses
FROM mynt.fact_performance_weekly
GROUP BY client_name, week_start, station_name
ORDER BY week_start DESC, total_cost DESC
LIMIT 20;
```

### Check specific client data

```sql
SELECT *
FROM mynt.fact_performance_weekly
WHERE client_name = 'Pacagen'
  AND week_start >= '2025-09-01'
ORDER BY week_start DESC, cost DESC;
```

---

## Logging

The script outputs:
- ✓ Connection status
- ✓ Staging table creation
- ✓ Rows loaded into staging
- ✓ Rows upserted into fact table
- ❌ Errors with rollback

Example output:
```
============================================================
Weekly Ingest: channel_export.csv
Client: Pacagen
Source Tab: Channel
============================================================

✓ Connected to mynt @ 34.9.22.182
✓ Staging table public._stg_weekly_ingest ready
✓ Loaded 50 rows into staging
✓ Staging table has 50 rows
✓ Upserted 48 rows into mynt.fact_performance_weekly

============================================================
✅ SUCCESS
   Loaded: 50 rows
   Upserted: 48 rows
============================================================
```

(Note: 50 loaded → 48 upserted means 2 header/total rows were filtered)

---

## Troubleshooting

### Error: `DB_PASSWORD environment variable is required`
- Make sure `.env` file exists with `DB_PASSWORD=...`
- Or set environment variable: `export DB_PASSWORD=your_password`

### Error: `relation "mynt.fact_performance_weekly" does not exist`
- Run `schema_bootstrap.sql` first to create tables

### Error: `permission denied for schema mynt`
- Ensure `writer_app` user has CREATE/INSERT permissions on `mynt` schema

### Date parsing issues
- Check that `Week Of (Mon)` column has valid dates
- Supported formats: `YYYY-MM-DD`, `MM/DD/YYYY`, `M/D/YYYY`

### CSV encoding issues
- Ensure CSV is UTF-8 encoded
- Check for special characters in station names

---

## Next Steps

1. **Add more tabs**: Extend to ingest Creative, Market, etc.
2. **Automate**: Create a wrapper script to export all tabs and ingest
3. **Scheduling**: Set up weekly cron job or Cloud Scheduler
4. **Monitoring**: Add alerting for failed ingests

---

## Files

- `ingest_weekly.py` - Main ingest script
- `schema_bootstrap.sql` - Database schema setup (run once)
- `.env` - Database credentials (not committed to git)
- `README_INGEST.md` - This documentation
