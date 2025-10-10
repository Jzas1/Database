#!/usr/bin/env python3

from __future__ import annotations
from typing import Set  # add Set alongside your other typing imports
import json             # new
import gspread
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import pandas as pd
import numpy as np
from datetime import datetime
import os, re, sys, argparse  # argparse + sys for CLI/env + TTY checks
from revenue_ext import attach_action_revenue, inject_action_revenue, resolve_action_rev_mode


# -------------------------
# Config
# -------------------------
FOLDER = Path(r"C:\Users\joe\Desktop\Auto")
PATTERNS = {
    "actions": "Actions-*.xlsx",
    "response": "Response-*.xlsx",
    "compile": "Compile_*.xlsx",
}
OUTPUT_FILENAME_TEMPLATE = "Output_{ts}.xlsx"

# -------------------------
# Column & value normalization
# -------------------------

def normalize(col: str) -> str:
    """Squash case/space/underscore/punct for robust matching."""
    return "".join(ch.lower() for ch in str(col) if ch.isalnum())


def norm_station_series(s: pd.Series) -> pd.Series:
    s = pd.Series(s, dtype="string")
    s = s.str.strip().str.upper()
    s = s.replace(to_replace=["", "NONE", "N/A", "NA", "<NA>", "NULL"], value=pd.NA)
    return s


def coerce_datetime(series: pd.Series) -> pd.Series:
    return pd.to_datetime(series, errors="coerce")


def coerce_numeric(series: pd.Series) -> pd.Series:
    return pd.to_numeric(series, errors="coerce")


# Robust hour coercion that handles strings ("6:30 AM"), Excel times (floats 0..1),
# HHMM integers (e.g., 630, 1830), datetime/time objects, etc.
def coerce_hour_series(series: pd.Series) -> pd.Series:
    s = series.copy()
    # 1) If already datetime-like, just take hour
    try:
        dt = pd.to_datetime(s, errors="coerce")
    except Exception:
        dt = pd.Series([pd.NaT] * len(s))
    hours = dt.dt.hour

    # 2) Numeric Excel time fractions (0..1) or HHMM integers
    nums = pd.to_numeric(s, errors="coerce")
    # Fractions in [0,1)
    frac_mask = nums.notna() & (nums >= 0) & (nums < 1)
    hours_frac = (np.floor(nums[frac_mask] * 24)).astype("Int64")
    # HHMM like 630, 1830
    hhmm_mask = nums.notna() & (nums >= 100) & (nums <= 2359)
    hours_hhmm = ((nums[hhmm_mask] // 100) % 24).astype("Int64")

    # Merge precedence: datetime parse first, then fractions, then HHMM
    hours = hours.astype("Int64")
    hours.loc[frac_mask & hours.isna()] = hours_frac
    hours.loc[hhmm_mask & hours.isna()] = hours_hhmm

    # 3) Python datetime.time objects
    def _time_hour(x):
        try:
            import datetime as _dt
            if isinstance(x, _dt.time):
                return x.hour
        except Exception:
            pass
        return np.nan
    obj_mask = hours.isna()
    if obj_mask.any():
        obj_hours = s[obj_mask].map(_time_hour)
        obj_hours = pd.to_numeric(obj_hours, errors="coerce").astype("Int64")
        hours.loc[obj_mask & obj_hours.notna()] = obj_hours

    return hours


def find_latest_by_pattern(folder: Path, pattern: str) -> Path:
    matches = sorted(folder.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
    if not matches:
        raise FileNotFoundError(f"No files found matching pattern '{pattern}' in {folder}")
    return matches[0]

# -------------------------
# Compile → spend tables & station priority (underscore/case robust)
# -------------------------

def _first_col_by_keys(df: pd.DataFrame, keys: List[str]) -> Optional[str]:
    norm_cols = {normalize(c): c for c in df.columns}
    for k in keys:
        if k in norm_cols:
            return norm_cols[k]
    return None


def build_compile_spend(df_compile: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    df = df_compile.copy()

    # station
    station_col = _first_col_by_keys(df, ["station", "stationname", "channel"])
    if not station_col:
        raise ValueError(f"Compile missing 'Station' column. Present: {list(df.columns)}")

    # cost & impressions
    cost_col = _first_col_by_keys(df, ["clientgross", "clientgrossamt", "cost", "gross", "spend"])
    if not cost_col:
        raise ValueError("Compile missing cost column (Client Gross / Cost / Gross / Spend)")
    impr_col = _first_col_by_keys(df, ["impressions"])  # optional

    # creative/date/time (accept underscores & caps)
    creative_col = _first_col_by_keys(df, ["tapeaired", "programaired", "creative", "szspottitle"])
    date_col = _first_col_by_keys(df, [
        "dateaired","dateairedmmddyyyy","dateairedyyyymmdd","dateairedyyyy-mm-dd",
        "dateaired2024","dateairedmmyy","datea","date_aired","airdate","date"
    ])
    time_col = _first_col_by_keys(df, ["timeaired", "time_aired", "airtime", "time"])

    # ---------- Base station spend (no week) ----------
    st = df[[station_col, cost_col]].copy()
    st[cost_col] = coerce_numeric(st[cost_col]).fillna(0)
    if impr_col:
        st[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
    else:
        st["Impressions"] = 0
        impr_col = "Impressions"
    st.rename(columns={station_col: "Station", cost_col: "Cost", impr_col: "Impressions"}, inplace=True)
    st["Station"] = norm_station_series(st["Station"]).fillna("UNKNOWN")
    station_spend = st.groupby("Station", as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))

    # Station×Creative (no week)
    if creative_col and creative_col in df.columns:
        sc = df[[station_col, creative_col, cost_col]].copy()
        sc[cost_col] = coerce_numeric(sc[cost_col]).fillna(0)
        if impr_col in df.columns:
            sc[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
        else:
            sc[impr_col] = 0
        sc.rename(columns={station_col: "Station", creative_col: "Creative", cost_col: "Cost", impr_col: "Impressions"}, inplace=True)
        sc["Station"] = norm_station_series(sc["Station"]).fillna("UNKNOWN")
        sc["Creative"] = pd.Series(sc["Creative"], dtype="string").str.strip().str.upper().replace({"": pd.NA})
        station_creative_spend = sc.groupby(["Station", "Creative"], as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
    else:
        station_creative_spend = pd.DataFrame(columns=["Station", "Creative", "Cost", "Impressions"])

    # Day spend (no week)
    if date_col and date_col in df.columns:
        d = df[[date_col, cost_col]].copy()
        d[cost_col] = coerce_numeric(d[cost_col]).fillna(0)
        if impr_col in df.columns:
            d[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
        else:
            d[impr_col] = 0
        d["_date"] = coerce_datetime(d[date_col])
        d["Day"] = d["_date"].dt.day_name()
        day_spend = d.groupby("Day", as_index=False).agg(Cost=(cost_col, "sum"), Impressions=(impr_col, "sum"))
    else:
        d = None
        day_spend = pd.DataFrame(columns=["Day", "Cost", "Impressions"])

    # Hour spend (no week)
    if time_col and time_col in df.columns:
        t = df[[time_col, cost_col]].copy()
        t[cost_col] = coerce_numeric(t[cost_col]).fillna(0)
        if impr_col in df.columns:
            t[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
        else:
            t[impr_col] = 0
        t["Hour"] = coerce_hour_series(df[time_col])
        t = t[t["Hour"].notna()]
        t["Hour"] = t["Hour"].astype("Int64")
        hour_spend = t.groupby("Hour", as_index=False).agg(Cost=(cost_col, "sum"), Impressions=(impr_col, "sum"))

        # Station × Hour (no week)
        sh = df[[station_col, time_col, cost_col]].copy()
        sh[cost_col] = coerce_numeric(sh[cost_col]).fillna(0)
        if impr_col in df.columns:
            sh[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
        else:
            sh[impr_col] = 0
        sh.rename(columns={station_col: "Station"}, inplace=True)
        sh["Station"] = norm_station_series(sh["Station"]).fillna("UNKNOWN")
        sh["Hour"] = coerce_hour_series(df[time_col])
        sh = sh[sh["Hour"].notna()]
        sh["Hour"] = sh["Hour"].astype("Int64")
        station_hour_spend = sh.groupby(["Station", "Hour"], as_index=False).agg(Cost=(cost_col, "sum"), Impressions=(impr_col, "sum"))
    else:
        hour_spend = pd.DataFrame(columns=["Hour", "Cost", "Impressions"])
        station_hour_spend = pd.DataFrame(columns=["Station", "Hour", "Cost", "Impressions"])

    # Market spend (no week)
    market_col = _first_col_by_keys(df, ["market", "t_adspots_market"])
    if market_col and market_col in df.columns:
        mk = df[[market_col, cost_col]].copy()
        mk[cost_col] = coerce_numeric(mk[cost_col]).fillna(0)
        if impr_col and impr_col in df.columns:
            mk[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
            impr_name = impr_col
        else:
            mk["Impressions"] = 0
            impr_name = "Impressions"
        mk.rename(columns={market_col: "Market", cost_col: "Cost", impr_name: "Impressions"}, inplace=True)
        market_spend = mk.groupby("Market", as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
    else:
        market_spend = pd.DataFrame(columns=["Market", "Cost", "Impressions"])

    # ---------- Weekly variants (broadcast week = Monday start) ----------
    def _week_label_series(ts: pd.Series) -> pd.Series:
        return ts.dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")

    # Only if we have a date column
    if date_col and date_col in df.columns:
        df["_date"] = coerce_datetime(df[date_col])
        df["_Week Of (Mon)"] = _week_label_series(df["_date"])

        # station_w
        st_w = df[[station_col, cost_col, impr_col, "_Week Of (Mon)"]].copy() if impr_col in df.columns else df[[station_col, cost_col, "_Week Of (Mon)"]].copy()
        if impr_col not in st_w.columns:
            st_w["Impressions"] = 0
        st_w.rename(columns={station_col: "Station", cost_col: "Cost"}, inplace=True)
        st_w["Station"] = norm_station_series(st_w["Station"]).fillna("UNKNOWN")
        station_spend_w = st_w.groupby(["Station", "_Week Of (Mon)"], as_index=False).agg(Cost=("Cost","sum"), Impressions=("Impressions","sum"))
        station_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)

        # station_creative_w
        if creative_col and creative_col in df.columns:
            sc_w = df[[station_col, creative_col, cost_col, "_Week Of (Mon)"]].copy()
            sc_w[cost_col] = coerce_numeric(sc_w[cost_col]).fillna(0)
            if impr_col in df.columns: sc_w[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
            else: sc_w["Impressions"] = 0
            sc_w.rename(columns={station_col: "Station", creative_col: "Creative", cost_col: "Cost"}, inplace=True)
            sc_w["Station"] = norm_station_series(sc_w["Station"]).fillna("UNKNOWN")
            sc_w["Creative"] = pd.Series(sc_w["Creative"], dtype="string").str.strip().str.upper().replace({"": pd.NA})
            station_creative_spend_w = sc_w.groupby(["Station","Creative","_Week Of (Mon)"], as_index=False).agg(Cost=("Cost","sum"), Impressions=("Impressions","sum"))
            station_creative_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            station_creative_spend_w = pd.DataFrame(columns=["Station","Creative","Week Of (Mon)","Cost","Impressions"])

        # day_w
        if d is not None:
            d2 = df[[date_col, cost_col, "_Week Of (Mon)"]].copy()
            d2["_date"] = coerce_datetime(d2[date_col])
            d2["Day"] = d2["_date"].dt.day_name()
            d2[cost_col] = coerce_numeric(d2[cost_col]).fillna(0)
            if impr_col in df.columns:
                d2["Impressions"] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                d2["Impressions"] = 0
            day_spend_w = d2.groupby(["Day","_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col,"sum"), Impressions=("Impressions","sum"))
            day_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            day_spend_w = pd.DataFrame(columns=["Day","Week Of (Mon)","Cost","Impressions"])

        # hour_w
        if time_col and time_col in df.columns:
            h2 = df[[time_col, cost_col, "_Week Of (Mon)"]].copy()
            h2["Hour"] = coerce_hour_series(h2[time_col])
            h2 = h2[h2["Hour"].notna()]
            h2["Hour"] = h2["Hour"].astype("Int64")
            h2[cost_col] = coerce_numeric(h2[cost_col]).fillna(0)
            if impr_col in df.columns:
                h2["Impressions"] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                h2["Impressions"] = 0
            hour_spend_w = h2.groupby(["Hour","_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col,"sum"), Impressions=("Impressions","sum"))
            hour_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)

            # station_hour_w
            sh2 = df[[station_col, time_col, cost_col, "_Week Of (Mon)"]].copy()
            sh2.rename(columns={station_col: "Station"}, inplace=True)
            sh2["Station"] = norm_station_series(sh2["Station"]).fillna("UNKNOWN")
            sh2["Hour"] = coerce_hour_series(sh2[time_col])
            sh2 = sh2[sh2["Hour"].notna()]
            sh2["Hour"] = sh2["Hour"].astype("Int64")
            sh2[cost_col] = coerce_numeric(sh2[cost_col]).fillna(0)
            if impr_col in df.columns:
                sh2["Impressions"] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                sh2["Impressions"] = 0
            station_hour_spend_w = sh2.groupby(["Station","Hour","_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col,"sum"), Impressions=("Impressions","sum"))
            station_hour_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            hour_spend_w = pd.DataFrame(columns=["Hour","Week Of (Mon)","Cost","Impressions"])
            station_hour_spend_w = pd.DataFrame(columns=["Station","Hour","Week Of (Mon)","Cost","Impressions"])

        # market_w
        if market_col and market_col in df.columns:
            mk2 = df[[market_col, cost_col, "_Week Of (Mon)"]].copy()
            mk2.rename(columns={market_col: "Market", cost_col: "Cost"}, inplace=True)
            mk2["Cost"] = coerce_numeric(mk2["Cost"]).fillna(0)
            if impr_col in df.columns:
                mk2["Impressions"] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                mk2["Impressions"] = 0
            market_spend_w = mk2.groupby(["Market","_Week Of (Mon)"], as_index=False).agg(Cost=("Cost","sum"), Impressions=("Impressions","sum"))
            market_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            market_spend_w = pd.DataFrame(columns=["Market","Week Of (Mon)","Cost","Impressions"])
    else:
        station_spend_w = pd.DataFrame(columns=["Station","Week Of (Mon)","Cost","Impressions"])
        station_creative_spend_w = pd.DataFrame(columns=["Station","Creative","Week Of (Mon)","Cost","Impressions"])
        day_spend_w = pd.DataFrame(columns=["Day","Week Of (Mon)","Cost","Impressions"])
        hour_spend_w = pd.DataFrame(columns=["Hour","Week Of (Mon)","Cost","Impressions"])
        station_hour_spend_w = pd.DataFrame(columns=["Station","Hour","Week Of (Mon)","Cost","Impressions"])
        market_spend_w = pd.DataFrame(columns=["Market","Week Of (Mon)","Cost","Impressions"])

    return {
        # non-weekly (kept for compatibility)
        "station": station_spend,
        "station_creative": station_creative_spend,
        "day": day_spend,
        "hour": hour_spend,
        "station_hour": station_hour_spend,
        "market": market_spend,
        # weekly
        "station_w": station_spend_w,
        "station_creative_w": station_creative_spend_w,
        "day_w": day_spend_w,
        "hour_w": hour_spend_w,
        "station_hour_w": station_hour_spend_w,
        "market_w": market_spend_w,
    }


def build_station_priority(df_compile: pd.DataFrame) -> Tuple[pd.DataFrame, pd.DataFrame]:
    df = df_compile.copy()
    station_col = _first_col_by_keys(df, ["station", "stationname", "channel"])
    if station_col is None:
        raise ValueError(f"Compile is missing 'Station' column. Present: {list(df.columns)}")

    impressions_col = _first_col_by_keys(df, ["impressions"])  # optional

    has_cost = any(normalize(x) in {normalize(c) for c in df.columns} for x in ["cost", "clientgross", "gross", "spend"])
    has_spotcount_col = any(normalize(x) in {normalize(c) for c in df.columns} for x in ["spotcount", "spot count", "spots"])

    cols_norm = {normalize(c): c for c in df.columns}

    if has_cost and has_spotcount_col and ("cost" in cols_norm or "clientgross" in cols_norm):
        cost_col = cols_norm.get("cost", cols_norm.get("clientgross", cols_norm.get("gross", cols_norm.get("spend"))))
        spotcount_col = cols_norm.get("spotcount", cols_norm.get("spots"))
        use_cols = [station_col, cost_col, spotcount_col]
        if impressions_col:
            use_cols.append(impressions_col)
        tmp = df[use_cols].copy()
        tmp[cost_col] = coerce_numeric(tmp[cost_col]).fillna(0)
        tmp[spotcount_col] = coerce_numeric(tmp[spotcount_col]).fillna(0)
        if impressions_col:
            tmp[impressions_col] = coerce_numeric(tmp[impressions_col]).fillna(0)
        agg = tmp.groupby(station_col, as_index=False).agg(
            **{
                "Cost": (cost_col, "sum"),
                "SpotCount": (spotcount_col, "sum"),
                **({"Impressions": (impressions_col, "sum")} if impressions_col else {}),
            }
        )
        agg.rename(columns={station_col: "Station"}, inplace=True)
    else:
        cost_src = None
        for candidate in ["clientgross", "gross", "cost", "spend"]:
            col = cols_norm.get(candidate)
            if col:
                cost_src = col
                break
        if cost_src is None:
            raise ValueError("Compile lacks recognizable cost column (Client Gross/Gross/Cost/Spend)")
        use_cols = [station_col, cost_src]
        if impressions_col:
            use_cols.append(impressions_col)
        tmp = df[use_cols].copy()
        tmp[cost_src] = coerce_numeric(tmp[cost_src]).fillna(0)
        if impressions_col:
            tmp[impressions_col] = coerce_numeric(tmp[impressions_col]).fillna(0)
        agg = tmp.groupby(station_col, as_index=False).agg(
            **{
                "Cost": (cost_src, "sum"),
                "SpotCount": (cost_src, "size"),
                **({"Impressions": (impressions_col, "sum")} if impressions_col else {}),
            }
        )
        agg.rename(columns={station_col: "Station"}, inplace=True)
        agg["Station"] = agg["Station"].astype(str)

    agg["Station"] = norm_station_series(agg["Station"]).fillna("UNKNOWN")
    if "Impressions" not in agg.columns:
        agg["Impressions"] = 0

    rankable = agg.copy()
    rankable = rankable[rankable["SpotCount"] > 0]
    rankable["cost_per_spot"] = rankable["Cost"] / rankable["SpotCount"]
    rankable.sort_values(by=["cost_per_spot", "Cost", "SpotCount", "Station"], ascending=[False, False, False, True], inplace=True)
    rankable["Rank"] = range(1, len(rankable) + 1)
    top3 = rankable.drop_duplicates("Station").head(3).copy()
    return rankable, top3

# -------------------------
# Actions/Response mapping (prefer correct columns)
# -------------------------

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

    market_col = _first_col_by_keys(df, ["t_adspots_market", "market", "t adspots market", "tadspotsmarket"])
    if market_col:
        out["Market"] = pd.Series(df[market_col], dtype="string").str.strip()

    out["Station"] = norm_station_series(out["Station"]).fillna("UNKNOWN")

    rev_key = next((k for k in [
        "totalactionrevenue", "actionrevenue", "total_revenue",
        "totalactionsrevenue", "grossrevenue", "revenue"
    ] if k in cols), None)
    if rev_key:
        out["TotalActionRevenue"] = coerce_numeric(df[cols[rev_key]]).fillna(0)
    return out


def map_response(df_response_raw: pd.DataFrame) -> pd.DataFrame:
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

    market_col = next((cols[k] for k in ["t_adspots_market", "tadspotsmarket", "market"] if k in cols), None)
    if market_col:
        out["Market"] = pd.Series(df[market_col], dtype="string").str.strip()

    out["Station"] = norm_station_series(out["Station"]).fillna("UNKNOWN")
    return out

# -------------------------
# Dedupe mode helper (CLI/env/interactive)
# -------------------------

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

# -------------------------
# Dedupe (supports with_action / session_only)
# -------------------------

def dedupe_actions(df_actions_mapped: pd.DataFrame,
                   top3: pd.DataFrame,
                   mode: str = "with_action") -> Tuple[pd.DataFrame, Dict[str, int]]:
    """
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

# -------------------------
# Reports: build performance tabs (WEEKLY: stacked by "Week Of (Mon)")
# -------------------------

# Helper to enforce consistent metric column ordering
# Order after the id columns should be:
# Cost, Responses, Cost per Response, <each action + Cost per action> (alphabetical),
# Actions_Total, Cost per Actions_Total, Impressions
def _reorder_metrics(df: pd.DataFrame, id_cols: List[str]) -> pd.DataFrame:
    cols = list(df.columns)
    base = ["Cost", "Responses", "Cost per Response"]
    tail = ["Actions_Total", "Cost per Actions_Total", "Impressions"]

    fixed_names = set(id_cols + base + tail)
    action_cols = [c for c in cols if c not in fixed_names and not str(c).startswith("Cost per ")]
    action_cols = sorted(action_cols, key=lambda x: str(x).lower())

    ordered: List[str] = []
    for c in id_cols:
        if c in cols:
            ordered.append(c)
    for c in base:
        if c in cols:
            ordered.append(c)
    for a in action_cols:
        if a in cols:
            ordered.append(a)
        cpa = f"Cost per {a}"
        if cpa in cols:
            ordered.append(cpa)
    for c in tail:
        if c in cols:
            ordered.append(c)
    remaining = [c for c in cols if c not in ordered]
    return df[ordered + remaining]


def build_performance_tables(actions_dedup: pd.DataFrame,
                             response_dedup: pd.DataFrame,
                             df_compile: pd.DataFrame,
                             rank_table: pd.DataFrame) -> Dict[str, pd.DataFrame]:

    # Week helpers
    def _week_label_series(ts: pd.Series) -> pd.Series:
        return ts.dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")

    # Actions derived fields (+ week)
    a = actions_dedup.copy()
    if "Station" in a.columns:
        a["Station"] = norm_station_series(a["Station"]).fillna("UNKNOWN")
    if "Creative" not in a.columns:
        a["Creative"] = np.nan
    a_ts = coerce_datetime(a["Timestamp"]) if "Timestamp" in a.columns else pd.Series([], dtype="datetime64[ns]")
    a["ActionHour"] = a_ts.dt.hour
    a["ActionWeekday"] = a_ts.dt.day_name()
    a["Week Of (Mon)"] = _week_label_series(a_ts)

    # Responses derived fields (+ week)
    r = response_dedup.copy()
    if "Station" in r.columns:
        r["Station"] = norm_station_series(r["Station"]).fillna("UNKNOWN")
    if "Creative" not in r.columns:
        r["Creative"] = np.nan
    r_ts = coerce_datetime(r["Timestamp"]) if "Timestamp" in r.columns else pd.Series([], dtype="datetime64[ns]")
    r["VisitHour"] = r_ts.dt.hour
    r["VisitWeekday"] = r_ts.dt.day_name()
    r["Week Of (Mon)"] = _week_label_series(r_ts)

    # Spend (weekly variants)
    spend = build_compile_spend(df_compile)
    station_spend_w = spend["station_w"].copy()
    station_creative_spend_w = spend["station_creative_w"].copy()
    day_spend_w = spend["day_w"].copy()
    hour_spend_w = spend["hour_w"].copy()
    station_hour_spend_w = spend["station_hour_w"].copy()

    # ----------------- CHANNEL (weekly) -----------------
    resp_by_station_w = r.groupby(["Station", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses"})
    if len(a) > 0 and "Action" in a.columns:
        pivot_station_w = a.groupby(["Station", "Week Of (Mon)", "Action"], as_index=False).size()
        pivot_station_w = pivot_station_w.pivot(index=["Station","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pivot_station_w = pd.DataFrame({"Station": [], "Week Of (Mon)": []})

    channel = station_spend_w.merge(resp_by_station_w, on=["Station","Week Of (Mon)"], how="outer") \
                             .merge(pivot_station_w, on=["Station","Week Of (Mon)"], how="outer")

    for col in channel.columns:
        if col not in {"Station", "Week Of (Mon)"}:
            channel[col] = coerce_numeric(channel[col]).fillna(0)

    channel["Cost per Response"] = np.where(channel.get("Responses", 0) > 0, channel["Cost"] / channel["Responses"], np.nan)
    action_cols = [c for c in channel.columns if c not in {"Station","Week Of (Mon)","Cost","Responses","Cost per Response","Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols:
        channel["Actions_Total"] = channel[action_cols].sum(axis=1)
        for act_col in action_cols:
            channel[f"Cost per {act_col}"] = np.where(channel[act_col] > 0, channel["Cost"] / channel[act_col], np.nan)
        channel["Cost per Actions_Total"] = np.where(channel["Actions_Total"] > 0, channel["Cost"] / channel["Actions_Total"], np.nan)

    channel = _reorder_metrics(channel, ["Station"])
    channel.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)

    # ----------------- CHANNEL BY CREATIVE (weekly) -----------------
    a["Creative"] = pd.Series(a["Creative"], dtype="string")
    r["Creative"] = pd.Series(r["Creative"], dtype="string")

    base_sc_w = station_creative_spend_w if len(station_creative_spend_w) else pd.DataFrame(columns=["Station","Creative","Week Of (Mon)","Cost","Impressions"])
    cb_resp_w = r.groupby(["Station","Creative","Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses"})

    if len(a) > 0 and "Action" in a.columns:
        pac_w = a.groupby(["Station","Creative","Week Of (Mon)","Action"], as_index=False).size()
        pac_w = pac_w.pivot(index=["Station","Creative","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pac_w = pd.DataFrame(columns=["Station","Creative","Week Of (Mon)"])

    channel_by_creative = base_sc_w.merge(cb_resp_w, on=["Station","Creative","Week Of (Mon)"], how="outer") \
                                   .merge(pac_w, on=["Station","Creative","Week Of (Mon)"], how="outer")

    for col in channel_by_creative.columns:
        if col not in {"Station","Creative","Week Of (Mon)"}:
            channel_by_creative[col] = coerce_numeric(channel_by_creative[col]).fillna(0)

    channel_by_creative["Cost per Response"] = np.where(channel_by_creative.get("Responses", 0) > 0, channel_by_creative["Cost"] / channel_by_creative["Responses"], np.nan)

    action_cols_cb = [c for c in channel_by_creative.columns if c not in {"Station","Creative","Week Of (Mon)","Cost","Responses","Cost per Response","Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols_cb:
        channel_by_creative["Actions_Total"] = channel_by_creative[action_cols_cb].sum(axis=1)
        for act_col in action_cols_cb:
            channel_by_creative[f"Cost per {act_col}"] = np.where(channel_by_creative[act_col] > 0, channel_by_creative["Cost"] / channel_by_creative[act_col], np.nan)
        channel_by_creative["Cost per Actions_Total"] = np.where(channel_by_creative["Actions_Total"] > 0, channel_by_creative["Cost"] / channel_by_creative["Actions_Total"], np.nan)

    channel_by_creative = _reorder_metrics(channel_by_creative, ["Station","Creative"])
    channel_by_creative.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)

    # ----------------- CREATIVE (weekly) -----------------
    # 1) Sum ONLY base metrics (no "Cost per ..." columns) across stations
    sum_cols = [
        c for c in channel_by_creative.columns
        if c not in {"Station", "Creative", "Week Of (Mon)"} and not str(c).startswith("Cost per ")
    ]

    creative = (
        channel_by_creative
            .drop(columns=["Station"])
            .groupby(["Creative", "Week Of (Mon)"], as_index=False)[sum_cols]
            .sum(numeric_only=True)
    )

    # 2) Recompute ratios from the summed bases
    fixed_base = {"Creative", "Week Of (Mon)", "Cost", "Responses", "Impressions"}
    action_cols = [c for c in creative.columns if c not in fixed_base and not str(c).startswith("Cost per ")]

    # Totals for actions and per-action CPS
    if action_cols:
        creative["Actions_Total"] = creative[action_cols].sum(axis=1)
        for act in action_cols:
            creative[f"Cost per {act}"] = np.where(creative[act] > 0, creative["Cost"] / creative[act], np.nan)
        creative["Cost per Actions_Total"] = np.where(creative["Actions_Total"] > 0, creative["Cost"] / creative["Actions_Total"], np.nan)

    # Core CPS
    creative["Cost per Response"] = np.where(creative.get("Responses", 0) > 0, creative["Cost"] / creative["Responses"], np.nan)

    # 3) Order & sort
    creative = _reorder_metrics(creative, ["Creative"])
    creative.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)


    # ----------------- DAY (weekly) -----------------
    day_counts_r_w = r.groupby(["VisitWeekday","Week Of (Mon)"], as_index=False).size().rename(columns={"size":"Responses"})
    if len(a) > 0 and "Action" in a.columns:
        pad_w = a.groupby(["ActionWeekday","Week Of (Mon)","Action"], as_index=False).size()
        pad_w = pad_w.pivot(index=["ActionWeekday","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionWeekday":"VisitWeekday"})
    else:
        pad_w = pd.DataFrame({"VisitWeekday": [], "Week Of (Mon)": []})

    day = day_spend_w.rename(columns={"Day":"VisitWeekday"}).merge(day_counts_r_w, on=["VisitWeekday","Week Of (Mon)"], how="outer") \
                     .merge(pad_w, on=["VisitWeekday","Week Of (Mon)"], how="outer")

    for col in day.columns:
        if col not in {"VisitWeekday","Week Of (Mon)"}:
            day[col] = coerce_numeric(day[col]).fillna(0)
    day["Cost per Response"] = np.where(day["Responses"] > 0, day["Cost"] / day["Responses"], np.nan)

    _dow = ["Monday","Tuesday","Wednesday","Thursday","Friday","Saturday","Sunday"]
    day["VisitWeekday"] = pd.Categorical(day["VisitWeekday"], categories=_dow, ordered=True)
    day = day.sort_values(["Week Of (Mon)","VisitWeekday"]).rename(columns={"VisitWeekday":"Day"})
    day = _reorder_metrics(day, ["Day"])

    # ----------------- HOUR (weekly) -----------------
    hour_counts_r_w = r.groupby(["VisitHour","Week Of (Mon)"], as_index=False).size().rename(columns={"size":"Responses","VisitHour":"Hour"})
    if len(a) > 0 and "Action" in a.columns:
        pah_w = a.groupby(["ActionHour","Week Of (Mon)","Action"], as_index=False).size()
        pah_w = pah_w.pivot(index=["ActionHour","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionHour":"Hour"})
    else:
        pah_w = pd.DataFrame({"Hour": [], "Week Of (Mon)": []})

    # Build base hours as union across sources per-week
    pairs_h = []
    if not hour_spend_w.empty: pairs_h.append(hour_spend_w[["Hour","Week Of (Mon)"]])
    if not hour_counts_r_w.empty: pairs_h.append(hour_counts_r_w[["Hour","Week Of (Mon)"]])
    if not pah_w.empty: pairs_h.append(pah_w[["Hour","Week Of (Mon)"]])
    base_hours = pd.concat(pairs_h, ignore_index=True).drop_duplicates() if pairs_h else pd.DataFrame({"Hour": [], "Week Of (Mon)": []})

    hour = base_hours.merge(hour_spend_w, on=["Hour","Week Of (Mon)"], how="left") \
                     .merge(hour_counts_r_w, on=["Hour","Week Of (Mon)"], how="left") \
                     .merge(pah_w, on=["Hour","Week Of (Mon)"], how="left")

    for col in hour.columns:
        if col not in {"Hour","Week Of (Mon)"}:
            hour[col] = coerce_numeric(hour[col]).fillna(0)
    hour["Cost per Response"] = np.where(hour["Responses"] > 0, hour["Cost"] / hour["Responses"], np.nan)
    hour = hour.sort_values(["Week Of (Mon)","Hour"])
    hour = _reorder_metrics(hour, ["Hour"])

    # ----------------- CHANNEL BY HOUR (weekly) -----------------
    resp_sh_w = r.groupby(["Station","VisitHour","Week Of (Mon)"], as_index=False).size().rename(columns={"size":"Responses","VisitHour":"Hour"})
    if len(a) > 0 and "Action" in a.columns:
        pah_sh_w = a.groupby(["Station","ActionHour","Week Of (Mon)","Action"], as_index=False).size()
        pah_sh_w = pah_sh_w.pivot(index=["Station","ActionHour","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionHour":"Hour"})
    else:
        pah_sh_w = pd.DataFrame(columns=["Station","Hour","Week Of (Mon)"])

    pairs_sh = []
    if "station_hour_w" in spend and not station_hour_spend_w.empty:
        pairs_sh.append(station_hour_spend_w[["Station","Hour","Week Of (Mon)"]])
    if not resp_sh_w.empty:
        pairs_sh.append(resp_sh_w[["Station","Hour","Week Of (Mon)"]])
    if not pah_sh_w.empty:
        pairs_sh.append(pah_sh_w[["Station","Hour","Week Of (Mon)"]])

    if pairs_sh:
        base_sh = pd.concat(pairs_sh, ignore_index=True).dropna().drop_duplicates()
    else:
        base_sh = pd.DataFrame(columns=["Station","Hour","Week Of (Mon)"])

    channel_by_hour = base_sh.merge(station_hour_spend_w, on=["Station","Hour","Week Of (Mon)"], how="left") \
                             .merge(resp_sh_w, on=["Station","Hour","Week Of (Mon)"], how="left") \
                             .merge(pah_sh_w, on=["Station","Hour","Week Of (Mon)"], how="left")

    for col in channel_by_hour.columns:
        if col not in {"Station","Hour","Week Of (Mon)"}:
            channel_by_hour[col] = coerce_numeric(channel_by_hour[col]).fillna(0)

    channel_by_hour["Cost per Response"] = np.where(channel_by_hour.get("Responses", 0) > 0, channel_by_hour["Cost"] / channel_by_hour["Responses"], np.nan)
    action_cols_sh = [c for c in channel_by_hour.columns if c not in {"Station","Hour","Week Of (Mon)","Cost","Responses","Cost per Response","Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols_sh:
        channel_by_hour["Actions_Total"] = channel_by_hour[action_cols_sh].sum(axis=1)
        for act_col in action_cols_sh:
            channel_by_hour[f"Cost per {act_col}"] = np.where(channel_by_hour[act_col] > 0, channel_by_hour["Cost"] / channel_by_hour[act_col], np.nan)
        channel_by_hour["Cost per Actions_Total"] = np.where(channel_by_hour["Actions_Total"] > 0, channel_by_hour["Cost"] / channel_by_hour["Actions_Total"], np.nan)

    channel_by_hour = channel_by_hour.sort_values(["Week Of (Mon)","Station","Hour"])
    channel_by_hour = _reorder_metrics(channel_by_hour, ["Station","Hour"])

    # ----------------- Detail tabs (row-level week already present) -----------------
    tmp_a = a.rename(columns={"Timestamp": "ActionTimestamp"})
    cols_a = [c for c in ["SessionID","Action","ActionTimestamp","Station","Creative","Probability","ActionHour","ActionWeekday","Week Of (Mon)"] if c in tmp_a.columns]
    actions_sheet = tmp_a[cols_a].sort_values(["Week Of (Mon)","ActionTimestamp"]) if len(tmp_a) and "ActionTimestamp" in tmp_a.columns else pd.DataFrame(columns=cols_a)

    tmp_r = r.rename(columns={"Timestamp": "VisitTimestamp"})
    cols_r = [c for c in ["SessionID","VisitTimestamp","Station","Creative","VisitHour","VisitWeekday","Week Of (Mon)"] if c in tmp_r.columns]
    response_sheet = tmp_r[cols_r].sort_values(["Week Of (Mon)","VisitTimestamp"]) if len(tmp_r) and "VisitTimestamp" in tmp_r.columns else pd.DataFrame(columns=cols_r)

    return {
        "Channel": channel,
        "Creative": creative,
        "Channel by Creative": channel_by_creative,
        "Day": day,
        "Hour": hour,
        "Channel by Hour": channel_by_hour,
        "Actions": actions_sheet,
        "Response": response_sheet,
    }

# -------------------------
# Market table (weekly) — mirrors Channel, keyed by Market + Week
# -------------------------

def build_market_table(actions_dedup: pd.DataFrame,
                       response_dedup: pd.DataFrame,
                       spend: Dict[str, pd.DataFrame]) -> pd.DataFrame:
    # Add week labels to A/R
    def _week_label_series(ts: pd.Series) -> pd.Series:
        return ts.dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")

    a = actions_dedup.copy()
    r = response_dedup.copy()
    a["Timestamp"] = coerce_datetime(a.get("Timestamp", pd.Series([], dtype="datetime64[ns]")))
    r["Timestamp"] = coerce_datetime(r.get("Timestamp", pd.Series([], dtype="datetime64[ns]")))
    a["Week Of (Mon)"] = _week_label_series(a["Timestamp"])
    r["Week Of (Mon)"] = _week_label_series(r["Timestamp"])

    have_market = ("Market" in a.columns) or ("Market" in r.columns)
    market_spend_w = spend.get("market_w", pd.DataFrame(columns=["Market","Week Of (Mon)","Cost","Impressions"])).copy()
    if not have_market and market_spend_w.empty:
        return pd.DataFrame(columns=["Market","Week Of (Mon)","Cost","Responses"])

    # Responses by Market + Week
    if "Market" in r.columns:
        resp_by_market_w = r.groupby(["Market","Week Of (Mon)"], as_index=False).size().rename(columns={"size":"Responses"})
    else:
        resp_by_market_w = pd.DataFrame(columns=["Market","Week Of (Mon)","Responses"])

    # Actions by Market + Week (dynamic)
    if len(a) > 0 and "Action" in a.columns and "Market" in a.columns:
        pivot_market_w = a.groupby(["Market","Week Of (Mon)","Action"], as_index=False).size()
        pivot_market_w = pivot_market_w.pivot(index=["Market","Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pivot_market_w = pd.DataFrame({"Market": [], "Week Of (Mon)": []})

    # Merge like Channel
    market = market_spend_w.merge(resp_by_market_w, on=["Market","Week Of (Mon)"], how="outer") \
                           .merge(pivot_market_w, on=["Market","Week Of (Mon)"], how="outer")

    for col in market.columns:
        if col not in {"Market","Week Of (Mon)"}:
            market[col] = coerce_numeric(market[col]).fillna(0)

    market["Cost per Response"] = np.where(market.get("Responses", 0) > 0, market["Cost"] / market["Responses"], np.nan)

    action_cols = [c for c in market.columns if c not in {"Market","Week Of (Mon)","Cost","Responses","Cost per Response","Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols:
        market["Actions_Total"] = market[action_cols].sum(axis=1)
        for act_col in action_cols:
            market[f"Cost per {act_col}"] = np.where(market[act_col] > 0, market["Cost"] / market[act_col], np.nan)
        market["Cost per Actions_Total"] = np.where(market["Actions_Total"] > 0, market["Cost"] / market["Actions_Total"], np.nan)

    market = _reorder_metrics(market, ["Market"])
    market.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)
    return market

# -------------------------
# Excel formatting helpers (dynamic actions)
# -------------------------

def _xl_col(idx: int) -> str:
    s = ""
    while idx >= 0:
        s = chr(idx % 26 + ord('A')) + s
        idx = idx // 26 - 1
    return s


def format_performance_sheet(writer: pd.ExcelWriter, sheet_name: str, df: pd.DataFrame):
    wb = writer.book
    ws = writer.sheets[sheet_name]
    nrows, ncols = df.shape

    center_def = wb.add_format({"align": "center", "valign": "vcenter"})
    header = wb.add_format({"bold": True, "align": "center", "valign": "vcenter", "border": 1, "bg_color": "#F2F2F2"})
    currency_def = wb.add_format({"num_format": "$#,##0.00", "align": "center", "valign": "vcenter"})
    integer_def  = wb.add_format({"num_format": "#,##0",     "align": "center", "valign": "vcenter"})

    currency_cell = wb.add_format({"num_format": "$#,##0.00", "align": "center", "valign": "vcenter", "border": 1})
    integer_cell  = wb.add_format({"num_format": "#,##0",     "align": "center", "valign": "vcenter", "border": 1})
    total_lbl     = wb.add_format({"bold": True, "align": "center", "valign": "vcenter", "border": 1})

    data_border = wb.add_format({"border": 1})

    ws.set_column(0, ncols - 1, 16, center_def)
    ws.write_row(0, 0, list(df.columns), header)

    cols = list(df.columns)
    def idx(col):
        return cols.index(col) if col in cols else None

    cost_idx = idx("Cost"); resp_idx = idx("Responses"); impr_idx = idx("Impressions")
    fixed_names = {"Market","Station","Creative","Day","Hour","Cost","Responses","Impressions","Actions_Total","Cost per Actions_Total","Cost per Response"}
    action_cols = [c for c in cols if c not in fixed_names and not str(c).startswith("Cost per ") and c != "Week Of (Mon)"]

    if cost_idx is not None: ws.set_column(cost_idx, cost_idx, 16, currency_def)
    if resp_idx is not None: ws.set_column(resp_idx, resp_idx, 14, integer_def)
    if impr_idx is not None: ws.set_column(impr_idx, impr_idx, 16, integer_def)
    for ac in action_cols:
        ac_idx = idx(ac)
        if ac_idx is not None: ws.set_column(ac_idx, ac_idx, 14, integer_def)
        cpa_idx = idx(f"Cost per {ac}")
        if cpa_idx is not None: ws.set_column(cpa_idx, cpa_idx, 18, currency_def)
    cpat_idx = idx("Cost per Actions_Total")
    if cpat_idx is not None: ws.set_column(cpat_idx, cpat_idx, 20, currency_def)
    cpr_idx = idx("Cost per Response")
    if cpr_idx is not None: ws.set_column(cpr_idx, cpr_idx, 18, currency_def)

    wom_idx = idx("Week Of (Mon)")
    if wom_idx is not None:
        ws.set_column(wom_idx, wom_idx, 14, center_def)

    if nrows > 0:
        ws.conditional_format(1, 0, nrows, ncols - 1, {"type": "no_blanks", "format": data_border})

    total_row = nrows + 1
    ws.write(total_row, 0, "TOTAL", total_lbl)

    def write_sum(i, fmt):
        col_letter = _xl_col(i)
        ws.write_formula(total_row, i, f"=SUM({col_letter}2:{col_letter}{nrows+1})", fmt)

    if cost_idx is not None: write_sum(cost_idx, currency_cell)
    if resp_idx is not None: write_sum(resp_idx, integer_cell)
    if impr_idx is not None: write_sum(impr_idx, integer_cell)
    at_idx = idx("Actions_Total")
    if at_idx is not None: write_sum(at_idx, integer_cell)
    for ac in action_cols:
        aci = idx(ac)
        if aci is not None: write_sum(aci, integer_cell)

    if cpr_idx is not None and cost_idx is not None and resp_idx is not None:
        cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
        resp_cell = f"{_xl_col(resp_idx)}{total_row+1}"
        ws.write_formula(total_row, cpr_idx, f"=IF({resp_cell}>0,{cost_cell}/{resp_cell},\"\")", currency_cell)

    if at_idx is not None and cost_idx is not None and cpat_idx is not None:
        cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
        tot_cell  = f"{_xl_col(at_idx)}{total_row+1}"
        ws.write_formula(total_row, cpat_idx, f"=IF({tot_cell}>0,{cost_cell}/{tot_cell},\"\")", currency_cell)

    for ac in action_cols:
        cpa_idx = idx(f"Cost per {ac}"); aci = idx(ac)
        if cpa_idx is not None and aci is not None and cost_idx is not None:
            cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
            ac_cell   = f"{_xl_col(aci)}{total_row+1}"
            ws.write_formula(total_row, cpa_idx, f"=IF({ac_cell}>0,{cost_cell}/{ac_cell},\"\")", currency_cell)

# -------------------------
# Orchestration
# -------------------------

def _read_sheet(path: Path) -> pd.DataFrame:
    try:
        return pd.read_excel(path, sheet_name="Data")
    except Exception:
        return pd.read_excel(path)

# ------------------------- Google Sheets writer (ReplaceWeeks/Append/ReplaceAll/Skip) -------------------------

EXCEL_TO_MASTER = {
    "Channel": "Master_Channel",
    "Creative": "Master_Creative",
    "Day": "Master_Day",
    "Hour": "Master_Hour",
    "Channel by Hour": "Master_ChannelHour",
    "Channel by Creative": "Master_ChannelCreative",
    "Market": "Master_Market",
    "Actions_dedup": "Master_ActionsDedup",
    "Response_dedup": "Master_ResponseDedup",
}
WEEK_COL = "Week Of (Mon)"
MODES = ["ReplaceWeeks", "Append", "ReplaceAll", "Skip"]

def _prompt_choice(title: str, options: List[str], default_idx: int = 0) -> str:
    print(title)
    for i, opt in enumerate(options, 1):
        d = " (default)" if (i - 1) == default_idx else ""
        print(f"  {i}) {opt}{d}")
    while True:
        raw = input(f"Press Enter for default [{options[default_idx]}] or type 1–{len(options)} (q to quit): ").strip()
        if raw.lower() in {"q", "quit"}:
            raise SystemExit(0)
        if raw == "":
            return options[default_idx]
        if raw.isdigit():
            i = int(raw)
            if 1 <= i <= len(options):
                return options[i - 1]
        print("Sorry, try again.")

def _read_clients_config(cfg_path: Path) -> Dict[str, Dict[str, str]]:
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)

def _open_sheet_by_id(sheet_id: str):
    gc = gspread.service_account()  # uses GOOGLE_APPLICATION_CREDENTIALS env var
    return gc.open_by_key(sheet_id)

def _ensure_header_and_extend(ws, desired_header: List[str]) -> List[str]:
    # FAST: only touch row 1 (header), not the whole sheet
    vals = ws.row_values(1)  # <- replaces ws.get_all_values()
    if not vals:
        ws.update("A1", [desired_header])
        return desired_header
    current = [c.strip() for c in vals]
    new_cols = [c for c in desired_header if c not in current]
    if new_cols:
        updated = current + new_cols
        ws.update("A1", [updated])
        return updated
    return current

def _delete_rows_matching_weeks(ws, header: List[str], weeks: Set[str]) -> None:
    if not weeks or not header:
        return
    try:
        widx_0 = header.index(WEEK_COL)  # 0-based in our list
    except ValueError:
        return
    col_idx = widx_0 + 1  # gspread is 1-based
    # Grab only the Week column (fast) instead of ws.get_all_values()
    col_vals = ws.col_values(col_idx)  # includes header at row 1
    to_del = []
    for row_num, wk in enumerate(col_vals[1:], start=2):  # start after header
        if wk in weeks:
            to_del.append(row_num)
    # delete bottom-up to keep indices stable
    for r in reversed(to_del):
        ws.delete_rows(r)

def _df_to_rows(df: pd.DataFrame, header: List[str]) -> List[List]:
    out = df.copy()

    # Make sure every header col exists
    for col in header:
        if col not in out.columns:
            out[col] = pd.NA  # use NA so we can coerce safely later

    # Reorder to header
    out = out[header]

    # 1) Any categorical columns → convert to string first (avoids fillna() category errors)
    for col in out.columns:
        if pd.api.types.is_categorical_dtype(out[col].dtype):
            out[col] = out[col].astype("string")

    # 2) Make everything object so we can mix numbers/strings cleanly
    out = out.astype(object)

    # 3) Replace missing with empty string (safe now that dtype is object)
    out = out.where(pd.notna(out), "")

    # 4) Rows for Sheets
    return out.values.tolist()

def _collect_weeks(df: pd.DataFrame) -> Set[str]:
    if WEEK_COL not in df.columns:
        return set()
    ser = pd.Series(df[WEEK_COL]).dropna().astype(str)
    return set(ser.unique())

# ---------- NEW: CLI/env overrides for Sheets ----------

def _get_sheets_cli_overrides():
    """
    Returns (mode, client, tabs) from CLI if provided.
    --sheets in {ReplaceWeeks,Append,ReplaceAll,Skip}
    --client is client key from clients.json
    --sheets-tabs is comma list of tab names to push (e.g. "Actions_dedup,Response_dedup")
    """
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--sheets", choices=MODES, default=None)
    parser.add_argument("--client", default=None)
    parser.add_argument("--sheets-tabs", default=None)
    try:
        args, _ = parser.parse_known_args()
        tabs = [t.strip() for t in args.sheets_tabs.split(",")] if args.sheets_tabs else None
        return args.sheets, args.client, tabs
    except SystemExit:
        return None, None, None

def _resolve_env_overrides(mode_cli: Optional[str], client_cli: Optional[str], tabs_cli: Optional[List[str]]):
    """
    Merge CLI with env vars. CLI wins over env. Env vars:
      SHEETS_MODE in MODES
      SHEETS_CLIENT as client key
      SHEETS_TABS comma-separated list of Excel tab names (keys used below)
    """
    env_mode = os.getenv("SHEETS_MODE", "").strip() or None
    env_client = os.getenv("SHEETS_CLIENT", "").strip() or None
    env_tabs_str = os.getenv("SHEETS_TABS", "").strip() or None
    env_tabs = [t.strip() for t in env_tabs_str.split(",")] if env_tabs_str else None

    mode = mode_cli or env_mode
    client = client_cli or env_client
    tabs = tabs_cli or env_tabs
    return mode, client, tabs

def _filter_frames(frames: Dict[str, pd.DataFrame], whitelist: Optional[List[str]]) -> Dict[str, pd.DataFrame]:
    if not whitelist:
        return frames
    valid = set(frames.keys())
    chosen = [t for t in whitelist if t in valid]
    if not chosen:
        print(f"[Sheets] Provided tabs whitelist has no valid items. Available: {sorted(valid)}")
        return {}
    return {k: frames[k] for k in chosen}

def _noninteractive() -> bool:
    try:
        return not sys.stdin.isatty()
    except Exception:
        return True  # play it safe

def _frames_from_memory(perf_tabs, market_df, actions_dedup, response_dedup) -> Dict[str, pd.DataFrame]:
    return {
        "Channel": perf_tabs.get("Channel", pd.DataFrame()),
        "Creative": perf_tabs.get("Creative", pd.DataFrame()),
        "Day": perf_tabs.get("Day", pd.DataFrame()),
        "Hour": perf_tabs.get("Hour", pd.DataFrame()),
        "Channel by Hour": perf_tabs.get("Channel by Hour", pd.DataFrame()),
        "Channel by Creative": perf_tabs.get("Channel by Creative", pd.DataFrame()),
        "Market": market_df if market_df is not None else pd.DataFrame(),
        "Actions_dedup": actions_dedup if actions_dedup is not None else pd.DataFrame(),
        "Response_dedup": response_dedup if response_dedup is not None else pd.DataFrame(),
    }

def _push_frames_to_sheet(frames: Dict[str, pd.DataFrame], sheet_id: str, mode: str) -> None:
    sh = _open_sheet_by_id(sheet_id)
    for excel_tab, master_tab in EXCEL_TO_MASTER.items():
        if excel_tab not in frames:
            print(f"- Skipping {excel_tab}: not produced in this run")
            continue
        df = frames[excel_tab].copy()
        if df.empty:
            print(f"- Skipping {excel_tab}: 0 rows")
            continue
        # Ensure week col exists (your pipeline should already add it)
        if WEEK_COL not in df.columns:
            df[WEEK_COL] = ""

        # Get/create worksheet
        try:
            ws = sh.worksheet(master_tab)
        except gspread.exceptions.WorksheetNotFound:
            ws = sh.add_worksheet(title=master_tab, rows=10, cols=max(26, len(df.columns) + 5))
            ws.update("A1", [[c for c in df.columns]])

        # Union header (supports new action columns over time)
        header_after = _ensure_header_and_extend(ws, [c for c in df.columns])

        # Modes
        if mode == "Skip":
            print(f"- {excel_tab}: Skip (no write)")
            continue

        if mode == "ReplaceAll":
            ws.clear()
            ws.update("A1", [header_after])

        if mode in {"ReplaceWeeks", "ReplaceAll"}:
            weeks = _collect_weeks(df)
            if weeks and mode == "ReplaceWeeks":
                print(f"  • Removing existing rows for weeks: {sorted(weeks)}")
                _delete_rows_matching_weeks(ws, header_after, weeks)

        # Append rows
        rows = _df_to_rows(df, header_after)
        ws.append_rows(rows, value_input_option="USER_ENTERED")
        print(f"  • Appended {len(rows)} rows to {master_tab}")

def maybe_push_to_gsheets(perf_tabs: Dict[str, pd.DataFrame],
                          market_df: pd.DataFrame,
                          actions_dedup: pd.DataFrame,
                          response_dedup: pd.DataFrame,
                          base_folder: Path,
                          mode_override: Optional[str] = None,
                          client_override: Optional[str] = None,
                          tabs_whitelist: Optional[List[str]] = None) -> None:
    """
    Push to Google Sheets.
    Precedence:
      - If mode_override or env SHEETS_MODE provided: use it (no prompts).
      - If non-interactive and no overrides: skip silently.
      - Else (interactive): prompt for client and mode.
    """
    # Merge CLI + ENV
    mode_override, client_override, tabs_whitelist = _resolve_env_overrides(mode_override, client_override, tabs_whitelist)

    # Guard: skip completely if explicitly Skip
    if mode_override == "Skip":
        print("\n[Sheets] Mode=Skip -> not writing to Google Sheets.\n")
        return

    # Non-interactive sessions auto-skip when no override is provided
    if _noninteractive() and (mode_override is None or mode_override.strip() == ""):
        print("\n[Sheets] Non-interactive session detected and no --sheets provided -> skipping push.\n")
        return

    cfg_path = base_folder / "clients.json"
    if not cfg_path.exists():
        print(f"\n[Sheets] clients.json not found at {cfg_path}. Skipping Google Sheets push.\n")
        return

    clients = _read_clients_config(cfg_path)
    if not clients:
        print("\n[Sheets] clients.json is empty. Skipping.\n")
        return

    client_names = sorted(clients.keys())

    # Choose client
    if client_override and client_override in client_names:
        client = client_override
    elif client_override and client_override not in client_names:
        print(f"[Sheets] client '{client_override}' not found in clients.json; falling back to prompt.")
        client = None
    else:
        client = None

    if client is None:
        if _noninteractive():
            print("[Sheets] Non-interactive but no valid client provided -> skipping push.\n")
            return
        client = _prompt_choice("\nSelect client:", client_names, default_idx=0)

    sheet_id = clients[client]["sheet_id"]
    default_mode = clients[client].get("default_mode", "Skip")
    if default_mode not in MODES:
        default_mode = "Skip"

    # Choose mode
    if mode_override and mode_override in MODES:
        mode = mode_override
    elif mode_override and mode_override not in MODES:
        print(f"[Sheets] Unknown mode '{mode_override}', using default '{default_mode}'.")
        mode = default_mode
    else:
        if _noninteractive():
            print("[Sheets] Non-interactive and no mode provided -> skipping push.\n")
            return
        mode = _prompt_choice("Select mode:", MODES, default_idx=MODES.index(default_mode))

    print(f"\n[Sheets] Client: {client} | Mode: {mode} | Sheet ID: {sheet_id}\n")
    if mode == "Skip":
        print("[Sheets] Skip selected. Not writing to Google Sheets.\n")
        return

    # Build frames from memory and optionally filter
    frames = _frames_from_memory(perf_tabs, market_df, actions_dedup, response_dedup)
    frames = _filter_frames(frames, tabs_whitelist)

    if not frames:
        print("[Sheets] No frames selected to push. Nothing to do.\n")
        return

    _push_frames_to_sheet(frames, sheet_id, mode)
    print("\n[Sheets] ✅ Push complete.\n")

def main():
    actions_path = find_latest_by_pattern(FOLDER, PATTERNS["actions"])
    response_path = find_latest_by_pattern(FOLDER, PATTERNS["response"])
    compile_path = find_latest_by_pattern(FOLDER, PATTERNS["compile"])

    df_actions_raw = _read_sheet(actions_path)
    df_response_raw = _read_sheet(response_path)
    df_compile = pd.read_excel(compile_path)

    # Drop unnamed columns
    for df in (df_actions_raw, df_response_raw):
        if df is not None:
            df.drop(columns=[c for c in df.columns if re.match(r"^Unnamed", str(c), flags=re.I)], inplace=True, errors="ignore")

    # Map → Dedupe
    actions_m = map_actions(df_actions_raw)
    response_m = map_response(df_response_raw)

    rank_table, top3 = build_station_priority(df_compile)

    # NEW: Select dedupe mode at runtime
    mode = get_dedupe_mode(default="with_action")
    print(f"[dedupe] mode={mode}")
    

    actions_dedup, a_stats = dedupe_actions(actions_m, top3, mode=mode)
    response_dedup, r_stats = dedupe_response(response_m)

    action_rev_mode = resolve_action_rev_mode()  # 'on' | 'off' | 'auto'
    actions_dedup = attach_action_revenue(actions_m, actions_dedup, mode, action_rev_mode)

    # Build performance tables (WEEKLY rows)
    perf_tabs = build_performance_tables(actions_dedup, response_dedup, df_compile, rank_table)
    spend = build_compile_spend(df_compile)
    market_df = build_market_table(actions_dedup, response_dedup, spend)

    perf_tabs, market_df = inject_action_revenue(perf_tabs, market_df, actions_dedup, action_rev_mode)


    # Build report (meta) — reflect chosen grouping
    report = pd.DataFrame([
        {"Metric": "Dedupe mode", "Value": a_stats["mode"]},
        {"Metric": "(Actions) groups", "Value": a_stats["groups"]},
        {"Metric": "(Actions) group keys", "Value": a_stats["group_keys"]},
        {"Metric": "Kept by Top-3 priority", "Value": a_stats["kept_by_top3"]},
        {"Metric": "Kept by Probability", "Value": a_stats["kept_by_probability"]},
        {"Metric": "(Response) groups (SessionID)", "Value": r_stats["groups"]},
        {"Metric": "Top-3 stations", "Value": ", ".join(top3["Station"].astype(str))},
    ])

    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = FOLDER / OUTPUT_FILENAME_TEMPLATE.format(ts=ts)

    with pd.ExcelWriter(out_path, engine="xlsxwriter") as xw:
        # 1) Performance tabs (weekly)
        for name, df in perf_tabs.items():
            sheet = name[:31]
            df.to_excel(xw, index=False, sheet_name=sheet)

        # Format performance tabs
        for sheet in [s for s in ["Channel","Creative","Channel by Creative","Day","Hour","Channel by Hour"] if s in perf_tabs]:
            format_performance_sheet(xw, sheet, perf_tabs[sheet])

        # 2) Market tab (weekly)
        market_df.to_excel(xw, index=False, sheet_name="Market")
        format_performance_sheet(xw, "Market", market_df)

        # 3) Priority + report + dedup detail (dedup tabs already include Week Of (Mon) per row)
        rank_table.to_excel(xw, index=False, sheet_name="Top3_Priority")
        report.to_excel(xw, index=False, sheet_name="Dedupe_Report")

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

    # ---- NEW: Headless Sheets push controls ----
    sheets_mode_cli, sheets_client_cli, sheets_tabs_cli = _get_sheets_cli_overrides()
    maybe_push_to_gsheets(
        perf_tabs, market_df, actions_dedup, response_dedup, FOLDER,
        mode_override=sheets_mode_cli,
        client_override=sheets_client_cli,
        tabs_whitelist=sheets_tabs_cli
    )

if __name__ == "__main__":
    main()
