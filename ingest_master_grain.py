#!/usr/bin/env python3
"""
Ingest MasterGrain CSV files into Cloud SQL (Postgres) database.
Handles the master grain table with dimensions: Client, Market, Station, Creative, Daypart, Hour, Week.
"""

import os
import sys
import psycopg2
from psycopg2 import sql
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime
import re

# Load environment variables
load_dotenv()

DB_HOST = os.getenv("DB_HOST", "34.9.22.182")
DB_PORT = os.getenv("DB_PORT", "5432")
DB_NAME = os.getenv("DB_NAME", "mynt")
DB_USER = os.getenv("DB_USER", "writerapp")
DB_PASS = os.getenv("DB_PASSWORD")

def clean_numeric(value_str):
    """Strip $, commas from numeric strings."""
    if value_str is None or value_str == '':
        return None
    s = str(value_str).replace('$', '').replace(',', '').strip()
    try:
        return float(s)
    except ValueError:
        return None

def ingest_master_grain_csv(csv_path: Path):
    """Ingest a MasterGrain CSV file into the database."""

    print("=" * 80)
    print(f"MASTER GRAIN INGESTION: {csv_path.name}")
    print("=" * 80)

    # Connect to database
    print(f"\nConnecting to database...")
    print(f"  Host: {DB_HOST}:{DB_PORT}")
    print(f"  Database: {DB_NAME}")
    print(f"  User: {DB_USER}")

    conn = psycopg2.connect(
        host=DB_HOST,
        port=DB_PORT,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASS,
        sslmode='require'
    )
    conn.autocommit = False
    cur = conn.cursor()

    try:
        # Create staging table (all TEXT for raw CSV import)
        # NEW CSV format: Market,Station,Creative,Daypart,Hour,Week Of (Mon),Cost,Impressions,Responses,sale,Client
        print("\nCreating staging table...")
        cur.execute("""
            DROP TABLE IF EXISTS mynt.stg_master_grain;
            CREATE TABLE mynt.stg_master_grain (
                market TEXT,
                station TEXT,
                creative TEXT,
                daypart TEXT,
                hour TEXT,
                week_of TEXT,
                cost TEXT,
                impressions TEXT,
                responses TEXT,
                sale TEXT,
                client_name TEXT
            );
        """)
        print("[OK] Staging table created")

        # Load CSV using COPY
        print(f"\nLoading CSV file: {csv_path.name}")
        with open(csv_path, 'r', encoding='utf-8') as f:
            # Skip header
            next(f)
            cur.copy_expert(
                sql.SQL("""
                    COPY mynt.stg_master_grain (
                        market, station, creative, daypart, hour, week_of,
                        cost, impressions, responses, sale, client_name
                    )
                    FROM STDIN
                    WITH CSV NULL ''
                """),
                f
            )

        row_count = cur.rowcount
        print(f"[OK] Loaded {row_count:,} rows into staging")

        # Clean data - convert empty strings to NULL
        print("\nCleaning data...")
        cur.execute("""
            UPDATE mynt.stg_master_grain
            SET
                hour = NULLIF(hour, ''),
                cost = NULLIF(REPLACE(REPLACE(cost, '$', ''), ',', ''), ''),
                responses = NULLIF(responses, ''),
                sale = NULLIF(sale, ''),
                impressions = NULLIF(impressions, ''),
                week_of = NULLIF(week_of, '');
        """)
        print("[OK] Data cleaned")

        # Create/update fact table
        print("\nCreating fact table if not exists...")
        cur.execute("""
            CREATE TABLE IF NOT EXISTS mynt.fact_master_grain (
                client_name VARCHAR(100),
                market VARCHAR(100),
                station VARCHAR(50),
                creative VARCHAR(200),
                daypart VARCHAR(50),
                hour INTEGER,
                week_of DATE,
                cost NUMERIC(12,2),
                responses INTEGER,
                sale INTEGER,
                impressions BIGINT,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (client_name, market, station, creative, daypart, hour, week_of)
            );
        """)
        print("[OK] Fact table ready")

        # DEBUG: Check staging table cost before inserting
        cur.execute("""
            SELECT SUM(CAST(REPLACE(REPLACE(cost, '$', ''), ',', '') AS NUMERIC))
            FROM mynt.stg_master_grain
        """)
        staging_cost = cur.fetchone()[0]
        print(f"\n[DEBUG] Staging table total cost: ${staging_cost:,.2f}")

        # Clear existing data
        print("\nClearing existing data...")
        cur.execute("TRUNCATE TABLE mynt.fact_master_grain")
        print("[OK] Table cleared")

        # Merge data (upsert) - cast TEXT to proper types
        print("\nMerging data into fact table...")
        cur.execute("""
            INSERT INTO mynt.fact_master_grain (
                client_name, market, station, creative, daypart, hour, week_of,
                cost, responses, sale, impressions, updated_at
            )
            SELECT
                client_name,
                market,
                station,
                creative,
                daypart,
                CAST(FLOOR(CAST(hour AS NUMERIC)) AS INTEGER),
                CAST(week_of AS DATE),
                CAST(cost AS NUMERIC(12,2)),
                CAST(FLOOR(CAST(responses AS NUMERIC)) AS INTEGER),
                CAST(FLOOR(CAST(sale AS NUMERIC)) AS INTEGER),
                CAST(FLOOR(CAST(impressions AS NUMERIC)) AS BIGINT),
                CURRENT_TIMESTAMP
            FROM mynt.stg_master_grain
            ON CONFLICT (client_name, market, station, creative, daypart, hour, week_of)
            DO UPDATE SET
                cost = EXCLUDED.cost,
                responses = EXCLUDED.responses,
                sale = EXCLUDED.sale,
                impressions = EXCLUDED.impressions,
                updated_at = CURRENT_TIMESTAMP;
        """)

        merge_count = cur.rowcount
        print(f"[OK] Merged {merge_count:,} rows into fact table")

        # Get total rows in fact table
        cur.execute("SELECT COUNT(*) FROM mynt.fact_master_grain;")
        total_rows = cur.fetchone()[0]
        print(f"[OK] Total rows in fact_master_grain: {total_rows:,}")

        # Commit
        conn.commit()
        print("\n[OK] Transaction committed successfully!")

        # Summary
        print("\n" + "=" * 80)
        print("INGESTION SUMMARY")
        print("=" * 80)
        print(f"CSV file:        {csv_path.name}")
        print(f"Rows staged:     {row_count:,}")
        print(f"Rows merged:     {merge_count:,}")
        print(f"Total in table:  {total_rows:,}")
        print("=" * 80)

        return True

    except Exception as e:
        conn.rollback()
        print(f"\n[ERROR] Ingestion failed: {e}")
        import traceback
        traceback.print_exc()
        return False

    finally:
        cur.close()
        conn.close()

def main():
    """Main entry point."""
    if len(sys.argv) < 2:
        print("Usage: python ingest_master_grain.py <csv_file>")
        print("\nExample:")
        print("  python ingest_master_grain.py MasterGrain_20251004_123456.csv")
        sys.exit(1)

    csv_file = sys.argv[1]
    csv_path = Path(csv_file)

    if not csv_path.exists():
        print(f"[ERROR] File not found: {csv_path}")
        sys.exit(1)

    if not csv_path.suffix.lower() == '.csv':
        print(f"[ERROR] Not a CSV file: {csv_path}")
        sys.exit(1)

    success = ingest_master_grain_csv(csv_path)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
