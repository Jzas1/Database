#!/usr/bin/env python3
"""Map raw Actions and Response data to standardized formats."""

from typing import List
import pandas as pd
import numpy as np

from normalization import (
    normalize,
    norm_station_series,
    coerce_datetime,
    coerce_numeric,
    first_col_by_keys,
)


def _choose_station_series(df: pd.DataFrame) -> pd.Series:
    """Choose best station-like column by non-null count among common candidates."""
    candidates = []
    cols = {normalize(c): c for c in df.columns}
    for key in ["tadspotschannel", "network", "station", "channel"]:
        if key in cols:
            candidates.append(cols[key])
    if not candidates:
        return pd.Series([pd.NA] * len(df), dtype="string")
    non_null_counts = {c: df[c].notna().sum() for c in candidates}
    best = max(non_null_counts, key=non_null_counts.get)
    return pd.Series(df[best])


def _pick_timestamp(df: pd.DataFrame, priority: List[str]) -> pd.Series:
    """Pick best timestamp column, optionally stitching date + time."""
    cols = {normalize(c): c for c in df.columns}

    # If split date/time present and no full datetime, try stitching
    date_key = next((k for k in ["date", "visitdate", "actiondate", "datevisited", "date_aired", "dateaired"] if k in cols), None)
    time_key = next((k for k in ["time", "visittime", "actiontime", "time_aired", "timeaired"] if k in cols), None)

    for p in priority:
        if p in cols:
            return coerce_datetime(df[cols[p]])

    if date_key and time_key:
        try:
            return coerce_datetime(df[cols[date_key]].astype(str) + " " + df[cols[time_key]].astype(str))
        except Exception:
            pass

    if date_key:
        return coerce_datetime(df[cols[date_key]])

    return pd.Series([pd.NaT] * len(df))


def map_actions(df_actions_raw: pd.DataFrame) -> pd.DataFrame:
    """Map raw actions data to standardized format."""
    df = df_actions_raw.copy()
    cols = {normalize(c): c for c in df.columns}

    sid_col = next((cols[k] for k in ["usersessionid", "sessionid", "session_id", "sid"] if k in cols), None)
    if not sid_col:
        raise ValueError("Actions file missing SessionID-like column")

    act_col = next((cols[k] for k in ["action", "event", "type", "actionname", "action_name", "actiontype"] if k in cols), None)
    if not act_col:
        raise ValueError("Actions file missing Action column")

    prob_col = next((cols[k] for k in ["actionprobability", "actionsessionprobability", "probability", "score", "prob"] if k in cols), None)

    station_series = _choose_station_series(df)
    ts = _pick_timestamp(df, ["actiondatetime", "visitdatetime", "timestamp", "datetime", "date", "time"])
    creative_col = next((cols[k] for k in ["creative", "adcreative", "ad_creative", "creative_name", "spot"] if k in cols), None)

    out = pd.DataFrame({
        "SessionID": df[sid_col],
        "Action": df[act_col],
        "Station": station_series,
        "Timestamp": ts,
    })

    if prob_col:
        out["Probability"] = coerce_numeric(df[prob_col]).fillna(-np.inf)
    else:
        out["Probability"] = -np.inf

    if creative_col:
        out["Creative"] = df[creative_col]

    market_col = first_col_by_keys(df, ["t_adspots_market", "market", "t adspots market", "tadspotsmarket", "region"])
    if market_col:
        market_raw = pd.Series(df[market_col], dtype="string").str.strip()
        # Normalize: "national" → "National", "National Cable" → "National", "National Network" → "National"
        out["Market"] = market_raw.str.replace(r'(?i)^national(\s+(cable|network))?\s*$', 'National', regex=True)

    out["Station"] = norm_station_series(out["Station"]).fillna("UNKNOWN")

    rev_key = next((k for k in [
        "totalactionrevenue", "actionrevenue", "total_revenue",
        "totalactionsrevenue", "grossrevenue", "revenue"
    ] if k in cols), None)
    if rev_key:
        out["TotalActionRevenue"] = coerce_numeric(df[cols[rev_key]]).fillna(0)

    return out


def map_response(df_response_raw: pd.DataFrame) -> pd.DataFrame:
    """Map raw response data to standardized format."""
    df = df_response_raw.copy()
    cols = {normalize(c): c for c in df.columns}

    sid_col = next((cols[k] for k in ["usersessionid", "sessionid", "session_id", "sid"] if k in cols), None)
    if not sid_col:
        raise ValueError("Response file missing SessionID-like column")

    station_series = _choose_station_series(df)
    ts = _pick_timestamp(df, ["visitdatetime", "timestamp", "datetime", "date", "time"])
    creative_col = next((cols[k] for k in ["creative", "adcreative", "ad_creative", "creative_name", "spot"] if k in cols), None)

    out = pd.DataFrame({
        "SessionID": df[sid_col],
        "Station": station_series,
        "Timestamp": ts,
    })

    if creative_col:
        out["Creative"] = df[creative_col]

    market_col = next((cols[k] for k in ["t_adspots_market", "tadspotsmarket", "market", "region"] if k in cols), None)
    if market_col:
        market_raw = pd.Series(df[market_col], dtype="string").str.strip()
        # Normalize: "national" → "National", "National Cable" → "National", "National Network" → "National"
        out["Market"] = market_raw.str.replace(r'(?i)^national(\s+(cable|network))?\s*$', 'National', regex=True)

    out["Station"] = norm_station_series(out["Station"]).fillna("UNKNOWN")
    return out
