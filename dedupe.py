#!/usr/bin/env python3
"""Deduplication logic for actions and response data."""

from typing import Dict, List, Tuple
import os
import sys
import argparse
import pandas as pd
import numpy as np

from normalization import norm_station_series, coerce_datetime, coerce_numeric


def get_dedupe_mode(default: str = "with_action") -> str:
    """
    Decide dedupe mode from CLI, env, or interactive prompt.
    Returns 'with_action' or 'session_only'.
    Priority: --dedupe -> DEDUPE_MODE env -> interactive -> default
    """
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--dedupe", choices=["with_action", "session_only"], default=None)
    try:
        args, _ = parser.parse_known_args()
        if args.dedupe:
            return args.dedupe
    except SystemExit:
        pass

    env_mode = os.getenv("DEDUPE_MODE", "").strip().lower()
    if env_mode in ("with_action", "session_only"):
        return env_mode

    try:
        ans = input("Dedup WITH action? [Y/n]: ").strip().lower()
        return "with_action" if ans in ("", "y", "yes") else "session_only"
    except EOFError:
        return default


def dedupe_actions(df_actions_mapped: pd.DataFrame,
                   top3: pd.DataFrame,
                   mode: str = "with_action") -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
    Deduplicate actions data.
    If mode == 'with_action'  -> group by [SessionID, Action]
    If mode == 'session_only' -> group by [SessionID]
    Within each group:
      - If any rows are on Top-3 stations, keep earliest timestamp among the best-ranked station.
      - Else keep by highest Probability, then earliest timestamp, then original order.
    """
    df = df_actions_mapped.copy()
    df["Timestamp"] = coerce_datetime(df.get("Timestamp"))
    df["Probability"] = coerce_numeric(df.get("Probability")).fillna(-np.inf)
    df["__order"] = np.arange(len(df))
    df["SourceRowID"] = df.index.astype(int)

    # Normalize station names to match rank table
    if "Station" in df.columns:
        df["Station"] = norm_station_series(df["Station"]).fillna("UNKNOWN")

    # Rank lookups for Top-3 stations
    rank_map = {row["Station"]: int(row["Rank"]) for _, row in top3.iterrows()}

    group_keys = ["SessionID"] if mode == "session_only" else ["SessionID", "Action"]

    kept_rows: List[pd.Series] = []
    stats = {
        "mode": mode,
        "group_keys": ", ".join(group_keys),
        "groups": 0,
        "kept_by_top3": 0,
        "kept_by_probability": 0,
    }

    for _, g in df.groupby(group_keys, sort=False):
        stats["groups"] += 1
        g = g.copy()
        g["__rank"] = g["Station"].map(rank_map)
        g["__ts_sort"] = g["Timestamp"].fillna(pd.Timestamp.max)

        top3_g = g[g["__rank"].notna()]
        if len(top3_g) > 0:
            best_rank = int(top3_g["__rank"].min())
            cand = top3_g[top3_g["__rank"] == best_rank].copy()
            cand.sort_values(["__ts_sort", "__order"], ascending=[True, True], inplace=True)
            kept_rows.append(cand.iloc[0])
            stats["kept_by_top3"] += 1
        else:
            g.sort_values(["Probability", "__ts_sort", "__order"], ascending=[False, True, True], inplace=True)
            kept_rows.append(g.iloc[0])
            stats["kept_by_probability"] += 1

    if not kept_rows:
        return df.head(0).copy(), stats

    deduped = pd.DataFrame(kept_rows)
    for c in ["__order", "__rank", "__ts_sort"]:
        if c in deduped.columns:
            deduped.drop(columns=[c], inplace=True)
    return deduped.reset_index(drop=True), stats


def dedupe_response(df_response_mapped: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, int]]:
    """Deduplicate response data by SessionID, keeping earliest timestamp."""
    df = df_response_mapped.copy()
    df["Timestamp"] = coerce_datetime(df["Timestamp"])  # may be NaT
    df["__order"] = np.arange(len(df))
    df["__ts_sort"] = df["Timestamp"].fillna(pd.Timestamp.max)

    kept: List[pd.Series] = []
    stats = {"groups": 0}

    for sid, g in df.groupby("SessionID", sort=False):
        stats["groups"] += 1
        g = g.copy()
        g.sort_values(["__ts_sort", "__order"], ascending=[True, True], inplace=True)
        kept.append(g.iloc[0])

    deduped = pd.DataFrame(kept).drop(columns=[c for c in ["__order", "__ts_sort"] if c in kept[0].index])
    return deduped.reset_index(drop=True), stats
