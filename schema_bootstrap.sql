-- Schema Bootstrap for Weekly Performance Ingest
-- Run this ONCE to set up the database tables
-- User: writer_app (must have CREATE permissions)

-- ============================================
-- 1. Staging Table (owned by writer_app)
-- ============================================

CREATE TABLE IF NOT EXISTS public._stg_weekly_ingest (
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

-- Grant ownership to writerapp
ALTER TABLE public._stg_weekly_ingest OWNER TO writerapp;

COMMENT ON TABLE public._stg_weekly_ingest IS 'Staging table for weekly performance CSV ingestion (all text for raw load)';


-- ============================================
-- 2. Fact Table (if not exists)
-- ============================================
-- NOTE: This assumes the table doesn't exist yet.
-- If mynt.fact_performance_weekly already exists, skip this section
-- or run ALTER TABLE to add missing columns (client_name, purchase, etc.)

CREATE SCHEMA IF NOT EXISTS mynt;

CREATE TABLE IF NOT EXISTS mynt.fact_performance_weekly (
    client_name text NOT NULL,
    week_start date NOT NULL,
    station_name text NOT NULL,
    creative_code text NOT NULL DEFAULT 'ALL',
    daypart text NOT NULL DEFAULT 'ALL',

    -- Metrics
    cost numeric(12,2),
    impressions bigint,
    response integer,

    -- Optional action metrics
    clicks integer,
    add_to_cart integer,
    checkout_initiated integer,
    checkout_completed integer,
    purchase integer,
    form_submit integer,
    lead integer,
    download integer,
    open_accounts integer,

    -- Lineage
    source_tab text,
    source_file text,
    updated_at timestamptz DEFAULT now(),

    -- Primary Key
    PRIMARY KEY (client_name, week_start, station_name, creative_code, daypart)
);

COMMENT ON TABLE mynt.fact_performance_weekly IS 'Weekly performance fact table with client, station, creative, and daypart grain';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_fact_performance_weekly_client_week
    ON mynt.fact_performance_weekly (client_name, week_start);

CREATE INDEX IF NOT EXISTS idx_fact_performance_weekly_week
    ON mynt.fact_performance_weekly (week_start);

CREATE INDEX IF NOT EXISTS idx_fact_performance_weekly_station
    ON mynt.fact_performance_weekly (station_name);


-- ============================================
-- 3. If table already exists, add missing columns
-- ============================================
-- Run these if mynt.fact_performance_weekly already exists
-- and needs client_name or purchase columns added

-- Uncomment and run if needed:
-- ALTER TABLE mynt.fact_performance_weekly ADD COLUMN IF NOT EXISTS client_name text;
-- ALTER TABLE mynt.fact_performance_weekly ADD COLUMN IF NOT EXISTS purchase integer;

-- If you need to update the primary key to include client_name:
-- (This is more complex and requires recreating the constraint)

-- Step 1: Drop old PK
-- ALTER TABLE mynt.fact_performance_weekly DROP CONSTRAINT IF EXISTS fact_performance_weekly_pkey;

-- Step 2: Add new PK with client_name
-- ALTER TABLE mynt.fact_performance_weekly
--     ADD PRIMARY KEY (client_name, week_start, station_name, creative_code, daypart);


-- ============================================
-- DONE
-- ============================================
-- Verify setup:
-- SELECT tablename, tableowner FROM pg_tables WHERE tablename IN ('_stg_weekly_ingest', 'fact_performance_weekly');
