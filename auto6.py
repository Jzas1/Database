#!/usr/bin/env python3
"""
Auto6 - Modularized ad attribution analytics pipeline.
Clean, maintainable version of Auto5 with separated concerns.
"""

from __future__ import annotations
import re
import pandas as pd
from datetime import datetime

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


def main():
    """Main orchestration function for the analytics pipeline."""

    # 1. Load data files
    actions_path = find_latest_by_pattern(FOLDER, PATTERNS["actions"])
    response_path = find_latest_by_pattern(FOLDER, PATTERNS["response"])
    compile_path = find_latest_by_pattern(FOLDER, PATTERNS["compile"])

    df_actions_raw = read_sheet(actions_path)
    df_response_raw = read_sheet(response_path)
    df_compile = pd.read_excel(compile_path)

    # Drop unnamed columns
    for df in (df_actions_raw, df_response_raw):
        if df is not None:
            df.drop(columns=[c for c in df.columns if re.match(r"^Unnamed", str(c), flags=re.I)],
                   inplace=True, errors="ignore")

    # 2. Map raw data to standardized format
    actions_m = map_actions(df_actions_raw)
    response_m = map_response(df_response_raw)

    # 3. Build station priority ranking
    rank_table, top3 = build_station_priority(df_compile)

    # 4. Deduplicate data
    mode = get_dedupe_mode(default="with_action")
    print(f"[dedupe] mode={mode}")

    actions_dedup, a_stats = dedupe_actions(actions_m, top3, mode=mode)
    response_dedup, r_stats = dedupe_response(response_m)

    # 5. Handle action revenue
    action_rev_mode = resolve_action_rev_mode()
    actions_dedup = attach_action_revenue(actions_m, actions_dedup, mode, action_rev_mode)

    # 6. Build performance tables
    perf_tabs = build_performance_tables(actions_dedup, response_dedup, df_compile, rank_table)
    spend = build_compile_spend(df_compile)
    market_df = build_market_table(actions_dedup, response_dedup, spend)

    # 7. Inject action revenue into performance tables
    perf_tabs, market_df = inject_action_revenue(perf_tabs, market_df, actions_dedup, action_rev_mode)

    # 8. Build report metadata
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

    with pd.ExcelWriter(out_path, engine="xlsxwriter") as xw:
        # Performance tabs (weekly)
        for name, df in perf_tabs.items():
            sheet = name[:31]
            df.to_excel(xw, index=False, sheet_name=sheet)

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

    print("Top-3 stations:", ", ".join(top3["Station"].astype(str).tolist()))
    print(f"Wrote workbook: {out_path}")

    # 10. Google Sheets push (optional)
    sheets_mode_cli, sheets_client_cli, sheets_tabs_cli = _get_sheets_cli_overrides()
    maybe_push_to_gsheets(
        perf_tabs, market_df, actions_dedup, response_dedup, FOLDER,
        mode_override=sheets_mode_cli,
        client_override=sheets_client_cli,
        tabs_whitelist=sheets_tabs_cli
    )


if __name__ == "__main__":
    main()
