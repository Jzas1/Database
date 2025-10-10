#!/usr/bin/env python3
"""
Revenue extension module for handling action revenue in the analytics pipeline.
Provides functionality to attach and inject revenue metrics into performance tables.
"""

from typing import Dict, Optional
import os
import sys
import argparse
import pandas as pd
import numpy as np


def resolve_action_rev_mode() -> str:
    """
    Resolve action revenue mode from CLI, env, or interactive prompt.
    Returns 'on', 'off', or 'auto'.
    Priority: --action-revenue -> ACTION_REVENUE_MODE env -> interactive -> 'auto'
    """
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--action-revenue", choices=["on", "off", "auto"], default=None)
    try:
        args, _ = parser.parse_known_args()
        if args.action_revenue:
            return args.action_revenue
    except SystemExit:
        pass

    env_mode = os.getenv("ACTION_REVENUE_MODE", "").strip().lower()
    if env_mode in ("on", "off", "auto"):
        return env_mode

    # Interactive prompt
    try:
        if not sys.stdin.isatty():
            return "auto"  # Non-interactive default
        ans = input("Include action revenue in reports? [Y/n/auto]: ").strip().lower()
        if ans in ("y", "yes"):
            return "on"
        elif ans in ("n", "no"):
            return "off"
        else:
            return "auto"
    except (EOFError, KeyboardInterrupt):
        return "auto"


def attach_action_revenue(actions_mapped: pd.DataFrame,
                          actions_dedup: pd.DataFrame,
                          dedupe_mode: str,
                          revenue_mode: str) -> pd.DataFrame:
    """
    Attach revenue from mapped actions to deduplicated actions.

    Args:
        actions_mapped: Original mapped actions with TotalActionRevenue column (if present)
        actions_dedup: Deduplicated actions dataframe
        dedupe_mode: 'with_action' or 'session_only'
        revenue_mode: 'on', 'off', or 'auto'

    Returns:
        actions_dedup with TotalActionRevenue column added if applicable
    """
    # If mode is 'off', don't add revenue
    if revenue_mode == "off":
        return actions_dedup

    # Check if revenue column exists in source
    has_revenue = "TotalActionRevenue" in actions_mapped.columns

    # Auto mode: only include if revenue exists
    if revenue_mode == "auto" and not has_revenue:
        return actions_dedup

    # If we don't have revenue and mode is 'on', warn but continue
    if not has_revenue:
        if revenue_mode == "on":
            print("[Revenue] Warning: Action revenue requested but TotalActionRevenue column not found in source data.")
        return actions_dedup

    # Attach revenue from original mapped data using SourceRowID
    if "SourceRowID" not in actions_dedup.columns:
        print("[Revenue] Warning: Cannot attach revenue - SourceRowID not found in deduplicated actions.")
        return actions_dedup

    # Create revenue lookup from original data
    revenue_lookup = actions_mapped[["TotalActionRevenue"]].copy()
    revenue_lookup["SourceRowID"] = actions_mapped.index

    # Merge revenue into dedup data
    result = actions_dedup.copy()
    result = result.merge(
        revenue_lookup,
        on="SourceRowID",
        how="left"
    )

    # Fill missing revenue with 0
    if "TotalActionRevenue" in result.columns:
        result["TotalActionRevenue"] = result["TotalActionRevenue"].fillna(0)
        print(f"[Revenue] Attached action revenue: {result['TotalActionRevenue'].sum():,.2f} total")

    return result


def inject_action_revenue(perf_tabs: Dict[str, pd.DataFrame],
                          market_df: pd.DataFrame,
                          actions_dedup: pd.DataFrame,
                          revenue_mode: str) -> tuple:
    """
    Inject TotalActionRevenue metrics into performance tables.

    Args:
        perf_tabs: Dictionary of performance tables
        market_df: Market performance dataframe
        actions_dedup: Deduplicated actions with TotalActionRevenue column
        revenue_mode: 'on', 'off', or 'auto'

    Returns:
        Tuple of (updated perf_tabs, updated market_df)
    """
    # If mode is off, return unchanged
    if revenue_mode == "off":
        return perf_tabs, market_df

    # Check if revenue exists in actions
    if "TotalActionRevenue" not in actions_dedup.columns:
        return perf_tabs, market_df

    # If no revenue data, return unchanged
    total_revenue = actions_dedup["TotalActionRevenue"].sum()
    if total_revenue == 0:
        return perf_tabs, market_df

    print(f"[Revenue] Injecting action revenue into performance tables...")

    # Helper to add revenue columns to a table
    def add_revenue_metrics(df: pd.DataFrame, group_cols: list, actions_subset: pd.DataFrame) -> pd.DataFrame:
        """Add revenue metrics to a performance table."""
        if actions_subset.empty:
            df["Action Revenue"] = 0
            df["ROI"] = np.nan
            return df

        # Aggregate revenue by group columns
        rev_agg = actions_subset.groupby(group_cols, as_index=False)["TotalActionRevenue"].sum()
        rev_agg.rename(columns={"TotalActionRevenue": "Action Revenue"}, inplace=True)

        # Merge into performance table
        result = df.merge(rev_agg, on=group_cols, how="left")
        result["Action Revenue"] = result["Action Revenue"].fillna(0)

        # Calculate ROI (Revenue / Cost)
        result["ROI"] = np.where(
            result["Cost"] > 0,
            result["Action Revenue"] / result["Cost"],
            np.nan
        )

        return result

    # Prepare actions with week column
    actions_with_week = actions_dedup.copy()
    if "Week Of (Mon)" not in actions_with_week.columns and "Timestamp" in actions_with_week.columns:
        from normalization import coerce_datetime, week_label_series
        actions_with_week["Week Of (Mon)"] = week_label_series(coerce_datetime(actions_with_week["Timestamp"]))

    # Inject into Channel
    if "Channel" in perf_tabs and "Station" in actions_with_week.columns:
        perf_tabs["Channel"] = add_revenue_metrics(
            perf_tabs["Channel"],
            ["Station", "Week Of (Mon)"],
            actions_with_week[actions_with_week["Station"].notna()]
        )

    # Inject into Creative
    if "Creative" in perf_tabs and "Creative" in actions_with_week.columns:
        perf_tabs["Creative"] = add_revenue_metrics(
            perf_tabs["Creative"],
            ["Creative", "Week Of (Mon)"],
            actions_with_week[actions_with_week["Creative"].notna()]
        )

    # Inject into Channel by Creative
    if "Channel by Creative" in perf_tabs and "Station" in actions_with_week.columns and "Creative" in actions_with_week.columns:
        perf_tabs["Channel by Creative"] = add_revenue_metrics(
            perf_tabs["Channel by Creative"],
            ["Station", "Creative", "Week Of (Mon)"],
            actions_with_week[actions_with_week["Station"].notna() & actions_with_week["Creative"].notna()]
        )

    # Inject into Day
    if "Day" in perf_tabs:
        from normalization import coerce_datetime
        a_day = actions_with_week.copy()
        if "Timestamp" in a_day.columns:
            a_day["Day"] = coerce_datetime(a_day["Timestamp"]).dt.day_name()
            perf_tabs["Day"] = add_revenue_metrics(
                perf_tabs["Day"],
                ["Day", "Week Of (Mon)"],
                a_day[a_day["Day"].notna()]
            )

    # Inject into Hour
    if "Hour" in perf_tabs:
        from normalization import coerce_datetime
        a_hour = actions_with_week.copy()
        if "Timestamp" in a_hour.columns:
            a_hour["Hour"] = coerce_datetime(a_hour["Timestamp"]).dt.hour
            perf_tabs["Hour"] = add_revenue_metrics(
                perf_tabs["Hour"],
                ["Hour", "Week Of (Mon)"],
                a_hour[a_hour["Hour"].notna()]
            )

    # Inject into Channel by Hour
    if "Channel by Hour" in perf_tabs and "Station" in actions_with_week.columns:
        from normalization import coerce_datetime
        a_ch = actions_with_week.copy()
        if "Timestamp" in a_ch.columns:
            a_ch["Hour"] = coerce_datetime(a_ch["Timestamp"]).dt.hour
            perf_tabs["Channel by Hour"] = add_revenue_metrics(
                perf_tabs["Channel by Hour"],
                ["Station", "Hour", "Week Of (Mon)"],
                a_ch[a_ch["Station"].notna() & a_ch["Hour"].notna()]
            )

    # Inject into Market
    if "Market" in actions_with_week.columns and not market_df.empty:
        market_df = add_revenue_metrics(
            market_df,
            ["Market", "Week Of (Mon)"],
            actions_with_week[actions_with_week["Market"].notna()]
        )

    print(f"[Revenue] Injected {total_revenue:,.2f} in action revenue across tables")

    return perf_tabs, market_df
