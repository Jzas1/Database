#!/usr/bin/env python3
"""
Auto6 - Modularized ad attribution analytics pipeline.
Clean, maintainable version of Auto5 with separated concerns.
"""

from __future__ import annotations
import re
import pandas as pd
from datetime import datetime
import sys
import traceback

from config import FOLDER, PATTERNS, OUTPUT_FILENAME_TEMPLATE
from file_utils import find_latest_by_pattern, read_sheet
from mapping import map_actions, map_response
from spend import build_compile_spend, build_station_priority
from dedupe import get_dedupe_mode, dedupe_actions, dedupe_response
from performance import build_performance_tables, build_market_table
from formatting import format_performance_sheet
from sheets import maybe_push_to_gsheets, _get_sheets_cli_overrides
from normalization import coerce_datetime
from revenue_ext import attach_action_revenue, inject_action_revenue, resolve_action_rev_mode
from logger import setup_logger, get_logger
from validation import (
    validate_actions_data,
    validate_response_data,
    validate_compile_data,
    validate_session_overlap,
    validate_environment
)


def main():
    """Main orchestration function for the analytics pipeline."""

    # Setup logging
    logger = setup_logger("auto6", log_dir=FOLDER / "logs")
    logger.info("="*80)
    logger.info("Starting Auto6 Analytics Pipeline")
    logger.info("="*80)

    try:
        # Validate environment
        logger.info("Validating environment...")
        env_report = validate_environment()
        env_report.print_summary()

        if env_report.has_errors():
            logger.error("Environment validation failed. Please fix errors and try again.")
            return 1

        # 1. Load data files
        logger.info("Loading data files...")
        actions_path = find_latest_by_pattern(FOLDER, PATTERNS["actions"])
        response_path = find_latest_by_pattern(FOLDER, PATTERNS["response"])
        compile_path = find_latest_by_pattern(FOLDER, PATTERNS["compile"])

        logger.info(f"Actions file: {actions_path.name}")
        logger.info(f"Response file: {response_path.name}")
        logger.info(f"Compile file: {compile_path.name}")

        # Extract client name from compile filename
        # Pattern: Compile_<ClientName>_<Date>_<Suffix>.xlsx
        compile_name = compile_path.stem  # e.g., "Compile_Pacagen_09.22.25_CF"
        client_match = re.match(r'^Compile_(.+?)_\d{2}\.\d{2}\.\d{2}', compile_name)
        if client_match:
            client_name = client_match.group(1)
            logger.info(f"Client: {client_name}")
        else:
            client_name = "UNKNOWN"
            logger.warning(f"Could not extract client name from '{compile_name}', using 'UNKNOWN'")

        df_actions_raw = read_sheet(actions_path)
        df_response_raw = read_sheet(response_path)
        df_compile = pd.read_excel(compile_path)

        # Drop unnamed columns
        for df in (df_actions_raw, df_response_raw):
            if df is not None:
                unnamed_cols = [c for c in df.columns if re.match(r"^Unnamed", str(c), flags=re.I)]
                if unnamed_cols:
                    logger.debug(f"Dropping {len(unnamed_cols)} unnamed columns")
                    df.drop(columns=unnamed_cols, inplace=True, errors="ignore")

        # Validate raw data
        logger.info("Validating raw data...")
        compile_report = validate_compile_data(df_compile)
        compile_report.print_summary()

        if compile_report.has_errors():
            logger.error("Compile data validation failed. Cannot continue.")
            return 1

        # 2. Map raw data to standardized format
        logger.info("Mapping raw data to standardized format...")
        actions_m = map_actions(df_actions_raw)
        response_m = map_response(df_response_raw)

        # Validate mapped data
        logger.info("Validating mapped data...")
        actions_report = validate_actions_data(actions_m)
        actions_report.print_summary()

        response_report = validate_response_data(response_m)
        response_report.print_summary()

        overlap_report = validate_session_overlap(actions_m, response_m)
        overlap_report.print_summary()

        if actions_report.has_errors() or response_report.has_errors():
            logger.error("Data validation failed. Cannot continue.")
            return 1

        # 3. Build station priority ranking
        logger.info("Building station priority ranking...")
        rank_table, top3 = build_station_priority(df_compile)
        logger.info(f"Top 3 stations: {', '.join(top3['Station'].astype(str).tolist())}")

        # 4. Deduplicate data
        mode = get_dedupe_mode(default="with_action")
        logger.info(f"Deduplication mode: {mode}")

        logger.info("Deduplicating actions...")
        actions_dedup, a_stats = dedupe_actions(actions_m, top3, mode=mode)
        logger.info(f"Actions deduplicated: {len(actions_m):,} -> {len(actions_dedup):,} rows")
        logger.info(f"  - Kept by Top-3 priority: {a_stats['kept_by_top3']:,}")
        logger.info(f"  - Kept by Probability: {a_stats['kept_by_probability']:,}")

        logger.info("Deduplicating responses...")
        response_dedup, r_stats = dedupe_response(response_m)
        logger.info(f"Responses deduplicated: {len(response_m):,} -> {len(response_dedup):,} rows")

        # 5. Handle action revenue
        action_rev_mode = resolve_action_rev_mode()
        logger.info(f"Action revenue mode: {action_rev_mode}")
        actions_dedup = attach_action_revenue(actions_m, actions_dedup, mode, action_rev_mode)

        # 6. Build performance tables
        logger.info("Building performance tables...")
        perf_tabs = build_performance_tables(actions_dedup, response_dedup, df_compile, rank_table, client_name, df_actions_raw, df_response_raw)
        spend = build_compile_spend(df_compile)
        market_df = build_market_table(actions_dedup, response_dedup, spend, client_name)

        logger.info(f"Generated {len(perf_tabs)} performance tables")

        # 7. Inject action revenue into performance tables
        logger.info("Injecting action revenue into performance tables...")
        perf_tabs, market_df = inject_action_revenue(perf_tabs, market_df, actions_dedup, action_rev_mode)

        # 8. Build report metadata
        logger.info("Building metadata report...")
        report = pd.DataFrame([
            {"Metric": "Dedupe mode", "Value": a_stats["mode"]},
            {"Metric": "(Actions) groups", "Value": a_stats["groups"]},
            {"Metric": "(Actions) group keys", "Value": a_stats["group_keys"]},
            {"Metric": "Kept by Top-3 priority", "Value": a_stats["kept_by_top3"]},
            {"Metric": "Kept by Probability", "Value": a_stats["kept_by_probability"]},
            {"Metric": "(Response) groups (SessionID)", "Value": r_stats["groups"]},
            {"Metric": "Top-3 stations", "Value": ", ".join(top3["Station"].astype(str))},
        ])

        # 9. Write Excel output
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        out_path = FOLDER / OUTPUT_FILENAME_TEMPLATE.format(ts=ts)

        logger.info(f"Writing Excel output to: {out_path.name}")

        with pd.ExcelWriter(out_path, engine="xlsxwriter") as xw:
            # Performance tabs (weekly)
            for name, df in perf_tabs.items():
                sheet = name[:31]
                df.to_excel(xw, index=False, sheet_name=sheet)
                logger.debug(f"  Wrote sheet: {sheet} ({len(df)} rows)")

            # Format performance tabs
            for sheet in [s for s in ["Channel", "Creative", "Channel by Creative", "Day", "Hour", "Channel by Hour"] if s in perf_tabs]:
                format_performance_sheet(xw, sheet, perf_tabs[sheet])

            # Market tab (weekly)
            market_df.to_excel(xw, index=False, sheet_name="Market")
            format_performance_sheet(xw, "Market", market_df)

            # Priority + report + dedup detail
            rank_table.to_excel(xw, index=False, sheet_name="Top3_Priority")
            report.to_excel(xw, index=False, sheet_name="Dedupe_Report")

            # Add week column to dedup outputs
            actions_dedup_out = actions_dedup.copy()
            if "Timestamp" in actions_dedup_out.columns:
                actions_dedup_out["Week Of (Mon)"] = coerce_datetime(actions_dedup_out["Timestamp"]).dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")

            response_dedup_out = response_dedup.copy()
            if "Timestamp" in response_dedup_out.columns:
                response_dedup_out["Week Of (Mon)"] = coerce_datetime(response_dedup_out["Timestamp"]).dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")

            actions_dedup_out = actions_dedup_out.drop(columns=["SourceRowID"], errors="ignore")
            actions_dedup_out.to_excel(xw, index=False, sheet_name="Actions_dedup")
            response_dedup_out.to_excel(xw, index=False, sheet_name="Response_dedup")

        logger.info(f"SUCCESS: Excel workbook written: {out_path}")
        logger.info(f"  File size: {out_path.stat().st_size / 1024 / 1024:.2f} MB")

        # 9b. Export MasterGrain to CSV for database ingestion
        master_grain_df = perf_tabs.get("MasterGrain")
        if master_grain_df is not None and len(master_grain_df) > 0:
            csv_path = FOLDER / f"MasterGrain_{ts}.csv"
            logger.info(f"Exporting MasterGrain to CSV: {csv_path.name}")
            master_grain_df.to_csv(csv_path, index=False)
            logger.info(f"  Exported {len(master_grain_df):,} rows to CSV")

            # Print total cost
            total_cost = master_grain_df["Cost"].sum()
            logger.info(f"  ✓ MasterGrain total Cost: ${total_cost:,.2f}")
            print(f"\n{'='*80}")
            print(f"MASTERGRAIN TOTAL COST: ${total_cost:,.2f}")
            print(f"{'='*80}\n")
        else:
            logger.warning("MasterGrain table is empty, skipping CSV export")

        # 10. Google Sheets push (optional)
        logger.info("Checking Google Sheets configuration...")
        sheets_mode_cli, sheets_client_cli, sheets_tabs_cli = _get_sheets_cli_overrides()
        maybe_push_to_gsheets(
            perf_tabs, market_df, actions_dedup, response_dedup, FOLDER,
            mode_override=sheets_mode_cli,
            client_override=sheets_client_cli,
            tabs_whitelist=sheets_tabs_cli
        )

        logger.info("="*80)
        logger.info("Pipeline completed successfully!")
        logger.info("="*80)
        return 0

    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        logger.error("Please ensure all required input files are present in the folder.")
        return 1

    except ValueError as e:
        logger.error(f"Data validation error: {e}")
        logger.error("Please check your input data format and column names.")
        return 1

    except Exception as e:
        logger.error("="*80)
        logger.error("FATAL ERROR: Pipeline failed")
        logger.error("="*80)
        logger.error(f"Error type: {type(e).__name__}")
        logger.error(f"Error message: {str(e)}")
        logger.error("\nFull traceback:")
        logger.error(traceback.format_exc())
        return 1


if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
