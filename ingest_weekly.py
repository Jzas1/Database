#!/usr/bin/env python3
"""
Weekly performance data ingest to Cloud SQL (Postgres)
Loads CSV → staging → fact_performance_weekly with upsert logic
"""

import os
import sys
import psycopg2
from psycopg2 import sql
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT
from io import StringIO
import csv
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database configuration
DB_CONFIG = {
    'host': os.getenv('DB_HOST', '34.9.22.182'),
    'port': int(os.getenv('DB_PORT', '5432')),
    'database': os.getenv('DB_NAME', 'mynt'),
    'user': os.getenv('DB_USER', 'writer_app'),
    'password': os.getenv('DB_PASSWORD'),
    'sslmode': os.getenv('DB_SSLMODE', 'require')
}

# Staging table schema (all text for raw CSV ingestion)
STAGING_TABLE = "public._stg_weekly_ingest"
STAGING_COLUMNS = [
    "client_name",
    "station_name",
    "cost",
    "responses",
    "cost_per_response",
    "sale",
    "cost_per_sale",
    "week_start",
    "actions_total",
    "cost_per_actions_total",
    "impressions",
    "source_tab",
    "source_file"
]

# Final fact table
FACT_TABLE = "mynt.fact_performance_weekly"


def get_connection():
    """Create database connection with SSL."""
    if not DB_CONFIG['password']:
        raise ValueError("DB_PASSWORD environment variable is required")

    conn = psycopg2.connect(
        host=DB_CONFIG['host'],
        port=DB_CONFIG['port'],
        database=DB_CONFIG['database'],
        user=DB_CONFIG['user'],
        password=DB_CONFIG['password'],
        sslmode=DB_CONFIG['sslmode']
    )
    return conn


def ensure_staging_table(conn):
    """Create staging table if it doesn't exist."""
    create_sql = f"""
    CREATE TABLE IF NOT EXISTS {STAGING_TABLE} (
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
    """

    with conn.cursor() as cur:
        cur.execute(create_sql)
        conn.commit()
        print(f"[OK] Staging table {STAGING_TABLE} ready")


def copy_csv_to_staging(conn, csv_path: Path, source_tab: str, source_file: str, client_name: str):
    """
    Load CSV into staging using COPY command.
    Maps Output CSV columns to staging table columns.
    """

    # Read CSV and map columns
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        rows = []

        for row in reader:
            # Map CSV columns to staging columns
            # Skip header/total rows (will be filtered in merge)
            mapped_row = [
                client_name,  # from parameter
                row.get('Station', ''),
                row.get('Cost', ''),
                row.get('Responses', ''),
                row.get('Cost per Response', ''),
                row.get('sale', ''),
                row.get('Cost per sale', ''),
                row.get('Week Of (Mon)', ''),
                row.get('Actions_Total', ''),
                row.get('Cost per Actions_Total', ''),
                row.get('Impressions', ''),
                source_tab,
                source_file
            ]
            rows.append(mapped_row)

    if not rows:
        print(f"[WARN] No data rows found in {csv_path}")
        return 0

    # TRUNCATE staging before loading
    with conn.cursor() as cur:
        cur.execute(f"TRUNCATE {STAGING_TABLE};")

    # Use COPY for bulk insert
    buffer = StringIO()
    writer = csv.writer(buffer, delimiter='\t')
    writer.writerows(rows)
    buffer.seek(0)

    with conn.cursor() as cur:
        # Parse schema.table for COPY command
        if '.' in STAGING_TABLE:
            schema, table = STAGING_TABLE.split('.')
            copy_sql = sql.SQL("COPY {}.{} FROM STDIN WITH (FORMAT CSV, DELIMITER E'\\t', NULL '')").format(
                sql.Identifier(schema), sql.Identifier(table)
            )
        else:
            copy_sql = sql.SQL("COPY {} FROM STDIN WITH (FORMAT CSV, DELIMITER E'\\t', NULL '')").format(
                sql.Identifier(STAGING_TABLE)
            )
        cur.copy_expert(copy_sql, buffer)
        conn.commit()
        print(f"[OK] Loaded {len(rows)} rows into staging")

    return len(rows)


def merge_staging_to_fact(conn):
    """
    Merge staging data into fact table with cleaning and upsert logic.
    """

    merge_sql = """
    WITH cleaned AS (
        SELECT
            client_name,
            station_name,
            'ALL' AS creative_code,
            'ALL' AS daypart,
            -- Clean and cast numeric fields
            regexp_replace(cost, '[^0-9.\\-]', '', 'g')::numeric(12,2) AS cost,
            regexp_replace(impressions, '[^0-9]', '', 'g')::bigint AS impressions,
            regexp_replace(responses, '[^0-9]', '', 'g')::integer AS response,
            regexp_replace(sale, '[^0-9]', '', 'g')::integer AS purchase,
            -- Parse week_start (multiple date formats)
            COALESCE(
                to_date(week_start, 'YYYY-MM-DD'),
                to_date(week_start, 'MM/DD/YYYY'),
                to_date(week_start, 'M/D/YYYY')
            ) AS week_start,
            source_tab,
            source_file
        FROM public._stg_weekly_ingest
        WHERE
            -- Only rows with valid dates (filters out headers/totals)
            week_start ~ '^\\s*\\d{4}-\\d{2}-\\d{2}\\s*$'
            OR week_start ~ '^\\s*\\d{1,2}/\\d{1,2}/\\d{2,4}\\s*$'
    )
    INSERT INTO mynt.fact_performance_weekly (
        client_name,
        week_start,
        station_name,
        creative_code,
        daypart,
        cost,
        impressions,
        response,
        purchase,
        source_tab,
        source_file,
        updated_at
    )
    SELECT
        client_name,
        week_start,
        station_name,
        creative_code,
        daypart,
        cost,
        impressions,
        response,
        purchase,
        source_tab,
        source_file,
        now() AS updated_at
    FROM cleaned
    ON CONFLICT (client_name, week_start, station_name, creative_code, daypart)
    DO UPDATE SET
        cost = EXCLUDED.cost,
        impressions = EXCLUDED.impressions,
        response = EXCLUDED.response,
        purchase = EXCLUDED.purchase,
        source_tab = EXCLUDED.source_tab,
        source_file = EXCLUDED.source_file,
        updated_at = now();
    """

    with conn.cursor() as cur:
        cur.execute(merge_sql)
        affected_rows = cur.rowcount
        conn.commit()
        print(f"[OK] Upserted {affected_rows} rows into {FACT_TABLE}")

    return affected_rows


def ingest_weekly(csv_path: str, source_tab: str, client_name: str):
    """
    Main ingest function: CSV → staging → fact table
    """
    csv_path = Path(csv_path)
    if not csv_path.exists():
        raise FileNotFoundError(f"CSV file not found: {csv_path}")

    source_file = csv_path.name

    print(f"\n{'='*60}")
    print(f"Weekly Ingest: {source_file}")
    print(f"Client: {client_name}")
    print(f"Source Tab: {source_tab}")
    print(f"{'='*60}\n")

    conn = None
    try:
        # Connect
        conn = get_connection()
        print(f"[OK] Connected to {DB_CONFIG['database']} @ {DB_CONFIG['host']}")

        # Ensure staging table exists
        ensure_staging_table(conn)

        # Load CSV → staging
        staging_count = copy_csv_to_staging(conn, csv_path, source_tab, source_file, client_name)

        # Check staging data
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM {STAGING_TABLE};")
            stg_count = cur.fetchone()[0]
            print(f"[OK] Staging table has {stg_count} rows")

        # Merge staging → fact
        upserted_count = merge_staging_to_fact(conn)

        # Optional: clean up staging
        with conn.cursor() as cur:
            cur.execute(f"TRUNCATE {STAGING_TABLE};")
            conn.commit()

        print(f"\n{'='*60}")
        print(f"[SUCCESS]")
        print(f"   Loaded: {staging_count} rows")
        print(f"   Upserted: {upserted_count} rows")
        print(f"{'='*60}\n")

        return upserted_count

    except Exception as e:
        if conn:
            conn.rollback()
        print(f"\n[ERROR] {type(e).__name__}: {e}", file=sys.stderr)
        raise
    finally:
        if conn:
            conn.close()


def main():
    """CLI entry point"""
    import argparse

    parser = argparse.ArgumentParser(description='Ingest weekly performance CSV to Cloud SQL')
    parser.add_argument('csv_path', help='Path to CSV file')
    parser.add_argument('--client', required=True, help='Client name (e.g., Pacagen)')
    parser.add_argument('--source-tab', default='Channel', help='Source tab name (default: Channel)')

    args = parser.parse_args()

    ingest_weekly(args.csv_path, args.source_tab, args.client)


if __name__ == '__main__':
    main()
