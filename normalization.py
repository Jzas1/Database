#!/usr/bin/env python3
"""Data normalization utilities for consistent column and value handling."""

from typing import List, Optional
import pandas as pd
import numpy as np


def normalize(col: str) -> str:
    """Squash case/space/underscore/punct for robust matching."""
    return "".join(ch.lower() for ch in str(col) if ch.isalnum())


def norm_station_series(s: pd.Series) -> pd.Series:
    """Normalize station names: uppercase, strip whitespace, handle nulls."""
    s = pd.Series(s, dtype="string")
    s = s.str.strip().str.upper()
    s = s.replace(to_replace=["", "NONE", "N/A", "NA", "<NA>", "NULL"], value=pd.NA)
    return s


def coerce_datetime(series: pd.Series) -> pd.Series:
    """Safely coerce series to datetime, returning NaT for invalid values."""
    return pd.to_datetime(series, errors="coerce")


def coerce_numeric(series: pd.Series) -> pd.Series:
    """Safely coerce series to numeric, returning NaN for invalid values."""
    return pd.to_numeric(series, errors="coerce")


def coerce_hour_series(series: pd.Series) -> pd.Series:
    """
    Robust hour coercion that handles strings ("6:30 AM"), Excel times (floats 0..1),
    HHMM integers (e.g., 630, 1830), datetime/time objects, etc.
    """
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


def first_col_by_keys(df: pd.DataFrame, keys: List[str]) -> Optional[str]:
    """Find first matching column from a list of normalized key candidates."""
    norm_cols = {normalize(c): c for c in df.columns}
    for k in keys:
        if k in norm_cols:
            return norm_cols[k]
    return None


def week_label_series(ts: pd.Series) -> pd.Series:
    """Convert timestamps to broadcast week labels (Monday start)."""
    return ts.dt.to_period('W-SUN').dt.start_time.dt.strftime("%Y-%m-%d")
