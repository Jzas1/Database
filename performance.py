#!/usr/bin/env python3
"""Build performance tables and market analysis."""

from typing import Dict, List
import pandas as pd
import numpy as np

from normalization import (
    norm_station_series,
    coerce_datetime,
    coerce_numeric,
    week_label_series,
)
from spend import build_compile_spend


def hour_to_daypart(hour: int) -> str:
    """Map hour (0-23) to daypart."""
    if hour in [0, 1]:
        return "Late Fringe"
    elif hour in [2, 3, 4, 5]:
        return "Overnight"
    elif hour in [6, 7, 8]:
        return "Early Morning"
    elif hour in [9, 10, 11, 12, 13, 14, 15, 16, 17]:
        return "Daytime"
    elif hour in [18, 19, 20, 21, 22, 23]:
        return "Prime"
    else:
        return "Unknown"


def _reorder_metrics(df: pd.DataFrame, id_cols: List[str]) -> pd.DataFrame:
    """
    Enforce consistent metric column ordering:
    Client, <id_cols>, Cost, Responses, Cost per Response, <each action + Cost per action> (alphabetical),
    Actions_Total, Cost per Actions_Total, Impressions, Week Of (Mon)
    """
    cols = list(df.columns)
    base = ["Cost", "Responses", "Cost per Response"]
    tail = ["Actions_Total", "Cost per Actions_Total", "Impressions"]

    # Client and Week should be first and last respectively
    fixed_names = set(["Client", "Week Of (Mon)"] + id_cols + base + tail)
    action_cols = [c for c in cols if c not in fixed_names and not str(c).startswith("Cost per ")]
    action_cols = sorted(action_cols, key=lambda x: str(x).lower())

    ordered: List[str] = []

    # Client always first if present
    if "Client" in cols:
        ordered.append("Client")

    for c in id_cols:
        if c in cols and c not in ["Client", "Week Of (Mon)"]:
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

    # Week Of (Mon) always last if present
    if "Week Of (Mon)" in cols:
        ordered.append("Week Of (Mon)")

    remaining = [c for c in cols if c not in ordered]
    return df[ordered + remaining]


def build_performance_tables(actions_dedup: pd.DataFrame,
                             response_dedup: pd.DataFrame,
                             df_compile: pd.DataFrame,
                             rank_table: pd.DataFrame,
                             client_name: str = "UNKNOWN",
                             actions_raw: pd.DataFrame = None,
                             response_raw: pd.DataFrame = None) -> Dict[str, pd.DataFrame]:
    """Build all performance analysis tables with weekly aggregation."""

    # Actions derived fields (+ week)
    a = actions_dedup.copy()
    if "Station" in a.columns:
        a["Station"] = norm_station_series(a["Station"]).fillna("UNKNOWN")
    if "Creative" not in a.columns:
        a["Creative"] = np.nan
    a_ts = coerce_datetime(a["Timestamp"]) if "Timestamp" in a.columns else pd.Series([], dtype="datetime64[ns]")
    a["ActionHour"] = a_ts.dt.hour
    a["ActionWeekday"] = a_ts.dt.day_name()
    a["Week Of (Mon)"] = week_label_series(a_ts)

    # Responses derived fields (+ week)
    r = response_dedup.copy()
    if "Station" in r.columns:
        r["Station"] = norm_station_series(r["Station"]).fillna("UNKNOWN")
    if "Creative" not in r.columns:
        r["Creative"] = np.nan
    r_ts = coerce_datetime(r["Timestamp"]) if "Timestamp" in r.columns else pd.Series([], dtype="datetime64[ns]")
    r["VisitHour"] = r_ts.dt.hour
    r["VisitWeekday"] = r_ts.dt.day_name()
    r["Week Of (Mon)"] = week_label_series(r_ts)

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
        pivot_station_w = pivot_station_w.pivot(index=["Station", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pivot_station_w = pd.DataFrame({"Station": [], "Week Of (Mon)": []})

    channel = station_spend_w.merge(resp_by_station_w, on=["Station", "Week Of (Mon)"], how="outer") \
                             .merge(pivot_station_w, on=["Station", "Week Of (Mon)"], how="outer")

    # Add Client column
    channel["Client"] = client_name

    for col in channel.columns:
        if col not in {"Station", "Week Of (Mon)", "Client"}:
            channel[col] = coerce_numeric(channel[col]).fillna(0)

    channel["Cost per Response"] = np.where(channel.get("Responses", 0) > 0, channel["Cost"] / channel["Responses"], np.nan)
    action_cols = [c for c in channel.columns if c not in {"Station", "Week Of (Mon)", "Client", "Cost", "Responses", "Cost per Response", "Impressions"} and not str(c).startswith("Cost per ")]
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

    base_sc_w = station_creative_spend_w if len(station_creative_spend_w) else pd.DataFrame(columns=["Station", "Creative", "Week Of (Mon)", "Cost", "Impressions"])
    cb_resp_w = r.groupby(["Station", "Creative", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses"})

    if len(a) > 0 and "Action" in a.columns:
        pac_w = a.groupby(["Station", "Creative", "Week Of (Mon)", "Action"], as_index=False).size()
        pac_w = pac_w.pivot(index=["Station", "Creative", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pac_w = pd.DataFrame(columns=["Station", "Creative", "Week Of (Mon)"])

    channel_by_creative = base_sc_w.merge(cb_resp_w, on=["Station", "Creative", "Week Of (Mon)"], how="outer") \
                                   .merge(pac_w, on=["Station", "Creative", "Week Of (Mon)"], how="outer")

    # Add Client column
    channel_by_creative["Client"] = client_name

    for col in channel_by_creative.columns:
        if col not in {"Station", "Creative", "Week Of (Mon)", "Client"}:
            channel_by_creative[col] = coerce_numeric(channel_by_creative[col]).fillna(0)

    channel_by_creative["Cost per Response"] = np.where(channel_by_creative.get("Responses", 0) > 0, channel_by_creative["Cost"] / channel_by_creative["Responses"], np.nan)

    action_cols_cb = [c for c in channel_by_creative.columns if c not in {"Station", "Creative", "Week Of (Mon)", "Client", "Cost", "Responses", "Cost per Response", "Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols_cb:
        channel_by_creative["Actions_Total"] = channel_by_creative[action_cols_cb].sum(axis=1)
        for act_col in action_cols_cb:
            channel_by_creative[f"Cost per {act_col}"] = np.where(channel_by_creative[act_col] > 0, channel_by_creative["Cost"] / channel_by_creative[act_col], np.nan)
        channel_by_creative["Cost per Actions_Total"] = np.where(channel_by_creative["Actions_Total"] > 0, channel_by_creative["Cost"] / channel_by_creative["Actions_Total"], np.nan)

    channel_by_creative = _reorder_metrics(channel_by_creative, ["Station", "Creative"])
    channel_by_creative.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)

    # ----------------- CREATIVE (weekly) -----------------
    sum_cols = [
        c for c in channel_by_creative.columns
        if c not in {"Station", "Creative", "Week Of (Mon)", "Client"} and not str(c).startswith("Cost per ")
    ]

    creative = (
        channel_by_creative
            .drop(columns=["Station"])
            .groupby(["Creative", "Week Of (Mon)"], as_index=False)[sum_cols]
            .sum(numeric_only=True)
    )

    # Add Client column
    creative["Client"] = client_name

    # Recompute ratios from the summed bases
    fixed_base = {"Creative", "Week Of (Mon)", "Client", "Cost", "Responses", "Impressions"}
    action_cols = [c for c in creative.columns if c not in fixed_base and not str(c).startswith("Cost per ")]

    if action_cols:
        creative["Actions_Total"] = creative[action_cols].sum(axis=1)
        for act in action_cols:
            creative[f"Cost per {act}"] = np.where(creative[act] > 0, creative["Cost"] / creative[act], np.nan)
        creative["Cost per Actions_Total"] = np.where(creative["Actions_Total"] > 0, creative["Cost"] / creative["Actions_Total"], np.nan)

    creative["Cost per Response"] = np.where(creative.get("Responses", 0) > 0, creative["Cost"] / creative["Responses"], np.nan)

    creative = _reorder_metrics(creative, ["Creative"])
    creative.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)

    # ----------------- DAY (weekly) -----------------
    day_counts_r_w = r.groupby(["VisitWeekday", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses"})
    if len(a) > 0 and "Action" in a.columns:
        pad_w = a.groupby(["ActionWeekday", "Week Of (Mon)", "Action"], as_index=False).size()
        pad_w = pad_w.pivot(index=["ActionWeekday", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionWeekday": "VisitWeekday"})
    else:
        pad_w = pd.DataFrame({"VisitWeekday": [], "Week Of (Mon)": []})

    day = day_spend_w.rename(columns={"Day": "VisitWeekday"}).merge(day_counts_r_w, on=["VisitWeekday", "Week Of (Mon)"], how="outer") \
                     .merge(pad_w, on=["VisitWeekday", "Week Of (Mon)"], how="outer")

    # Add Client column
    day["Client"] = client_name

    for col in day.columns:
        if col not in {"VisitWeekday", "Week Of (Mon)", "Client"}:
            day[col] = coerce_numeric(day[col]).fillna(0)
    day["Cost per Response"] = np.where(day["Responses"] > 0, day["Cost"] / day["Responses"], np.nan)

    _dow = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day["VisitWeekday"] = pd.Categorical(day["VisitWeekday"], categories=_dow, ordered=True)
    day = day.sort_values(["Week Of (Mon)", "VisitWeekday"]).rename(columns={"VisitWeekday": "Day"})
    day = _reorder_metrics(day, ["Day"])

    # ----------------- HOUR (weekly) -----------------
    hour_counts_r_w = r.groupby(["VisitHour", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses", "VisitHour": "Hour"})
    if len(a) > 0 and "Action" in a.columns:
        pah_w = a.groupby(["ActionHour", "Week Of (Mon)", "Action"], as_index=False).size()
        pah_w = pah_w.pivot(index=["ActionHour", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionHour": "Hour"})
    else:
        pah_w = pd.DataFrame({"Hour": [], "Week Of (Mon)": []})

    # Build base hours as union across sources per-week
    pairs_h = []
    if not hour_spend_w.empty:
        pairs_h.append(hour_spend_w[["Hour", "Week Of (Mon)"]])
    if not hour_counts_r_w.empty:
        pairs_h.append(hour_counts_r_w[["Hour", "Week Of (Mon)"]])
    if not pah_w.empty:
        pairs_h.append(pah_w[["Hour", "Week Of (Mon)"]])
    base_hours = pd.concat(pairs_h, ignore_index=True).drop_duplicates() if pairs_h else pd.DataFrame({"Hour": [], "Week Of (Mon)": []})

    hour = base_hours.merge(hour_spend_w, on=["Hour", "Week Of (Mon)"], how="left") \
                     .merge(hour_counts_r_w, on=["Hour", "Week Of (Mon)"], how="left") \
                     .merge(pah_w, on=["Hour", "Week Of (Mon)"], how="left")

    # Add Client and Daypart columns
    hour["Client"] = client_name
    hour["Daypart"] = hour["Hour"].apply(hour_to_daypart)

    for col in hour.columns:
        if col not in {"Hour", "Daypart", "Week Of (Mon)", "Client"}:
            hour[col] = coerce_numeric(hour[col]).fillna(0)
    hour["Cost per Response"] = np.where(hour["Responses"] > 0, hour["Cost"] / hour["Responses"], np.nan)
    hour = hour.sort_values(["Week Of (Mon)", "Hour"])
    hour = _reorder_metrics(hour, ["Hour", "Daypart"])

    # ----------------- CHANNEL BY HOUR (weekly) -----------------
    resp_sh_w = r.groupby(["Station", "VisitHour", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses", "VisitHour": "Hour"})
    if len(a) > 0 and "Action" in a.columns:
        pah_sh_w = a.groupby(["Station", "ActionHour", "Week Of (Mon)", "Action"], as_index=False).size()
        pah_sh_w = pah_sh_w.pivot(index=["Station", "ActionHour", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index().rename(columns={"ActionHour": "Hour"})
    else:
        pah_sh_w = pd.DataFrame(columns=["Station", "Hour", "Week Of (Mon)"])

    pairs_sh = []
    if "station_hour_w" in spend and not station_hour_spend_w.empty:
        pairs_sh.append(station_hour_spend_w[["Station", "Hour", "Week Of (Mon)"]])
    if not resp_sh_w.empty:
        pairs_sh.append(resp_sh_w[["Station", "Hour", "Week Of (Mon)"]])
    if not pah_sh_w.empty:
        pairs_sh.append(pah_sh_w[["Station", "Hour", "Week Of (Mon)"]])

    if pairs_sh:
        base_sh = pd.concat(pairs_sh, ignore_index=True).dropna().drop_duplicates()
    else:
        base_sh = pd.DataFrame(columns=["Station", "Hour", "Week Of (Mon)"])

    channel_by_hour = base_sh.merge(station_hour_spend_w, on=["Station", "Hour", "Week Of (Mon)"], how="left") \
                             .merge(resp_sh_w, on=["Station", "Hour", "Week Of (Mon)"], how="left") \
                             .merge(pah_sh_w, on=["Station", "Hour", "Week Of (Mon)"], how="left")

    # Add Client and Daypart columns
    channel_by_hour["Client"] = client_name
    channel_by_hour["Daypart"] = channel_by_hour["Hour"].apply(hour_to_daypart)

    for col in channel_by_hour.columns:
        if col not in {"Station", "Hour", "Daypart", "Week Of (Mon)", "Client"}:
            channel_by_hour[col] = coerce_numeric(channel_by_hour[col]).fillna(0)

    channel_by_hour["Cost per Response"] = np.where(channel_by_hour.get("Responses", 0) > 0, channel_by_hour["Cost"] / channel_by_hour["Responses"], np.nan)
    action_cols_sh = [c for c in channel_by_hour.columns if c not in {"Station", "Hour", "Daypart", "Week Of (Mon)", "Client", "Cost", "Responses", "Cost per Response", "Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols_sh:
        channel_by_hour["Actions_Total"] = channel_by_hour[action_cols_sh].sum(axis=1)
        for act_col in action_cols_sh:
            channel_by_hour[f"Cost per {act_col}"] = np.where(channel_by_hour[act_col] > 0, channel_by_hour["Cost"] / channel_by_hour[act_col], np.nan)
        channel_by_hour["Cost per Actions_Total"] = np.where(channel_by_hour["Actions_Total"] > 0, channel_by_hour["Cost"] / channel_by_hour["Actions_Total"], np.nan)

    channel_by_hour = channel_by_hour.sort_values(["Week Of (Mon)", "Station", "Hour"])
    channel_by_hour = _reorder_metrics(channel_by_hour, ["Station", "Hour", "Daypart"])

    # ----------------- Detail tabs (row-level week already present) -----------------
    tmp_a = a.rename(columns={"Timestamp": "ActionTimestamp"})

    # Merge back ALL raw columns (except probability columns) if raw data provided
    if actions_raw is not None and len(actions_raw) > 0:
        # Filter out probability columns and columns that already exist
        existing_cols_lower = {c.lower() for c in tmp_a.columns}
        raw_cols = [c for c in actions_raw.columns
                    if "probability" not in c.lower()
                    and c.lower() not in existing_cols_lower]
        if raw_cols:
            actions_raw_filtered = actions_raw[raw_cols]
            # Merge on SourceRowID if available
            if "SourceRowID" in tmp_a.columns:
                tmp_a = tmp_a.merge(actions_raw_filtered, left_on="SourceRowID", right_index=True, how="left")

    # Include ALL columns except those with "probability" in the name
    cols_a = [c for c in tmp_a.columns if "probability" not in c.lower()]
    actions_sheet = tmp_a[cols_a].sort_values(["Week Of (Mon)", "ActionTimestamp"]) if len(tmp_a) and "ActionTimestamp" in tmp_a.columns else pd.DataFrame(columns=cols_a)

    tmp_r = r.rename(columns={"Timestamp": "VisitTimestamp"})

    # Merge back ALL raw columns (except probability columns) if raw data provided
    if response_raw is not None and len(response_raw) > 0:
        # Filter out probability columns and columns that already exist
        existing_cols_lower = {c.lower() for c in tmp_r.columns}
        raw_cols = [c for c in response_raw.columns
                    if "probability" not in c.lower()
                    and c.lower() not in existing_cols_lower]
        if raw_cols:
            response_raw_filtered = response_raw[raw_cols]
            # Merge on SourceRowID if available
            if "SourceRowID" in tmp_r.columns:
                tmp_r = tmp_r.merge(response_raw_filtered, left_on="SourceRowID", right_index=True, how="left")

    # Include ALL columns except those with "probability" in the name
    cols_r = [c for c in tmp_r.columns if "probability" not in c.lower()]
    response_sheet = tmp_r[cols_r].sort_values(["Week Of (Mon)", "VisitTimestamp"]) if len(tmp_r) and "VisitTimestamp" in tmp_r.columns else pd.DataFrame(columns=cols_r)

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


def build_market_table(actions_dedup: pd.DataFrame,
                       response_dedup: pd.DataFrame,
                       spend: Dict[str, pd.DataFrame],
                       client_name: str = "UNKNOWN") -> pd.DataFrame:
    """Build market table (weekly) — mirrors Channel, keyed by Market + Week."""

    a = actions_dedup.copy()
    r = response_dedup.copy()
    a["Timestamp"] = coerce_datetime(a.get("Timestamp", pd.Series([], dtype="datetime64[ns]")))
    r["Timestamp"] = coerce_datetime(r.get("Timestamp", pd.Series([], dtype="datetime64[ns]")))
    a["Week Of (Mon)"] = week_label_series(a["Timestamp"])
    r["Week Of (Mon)"] = week_label_series(r["Timestamp"])

    have_market = ("Market" in a.columns) or ("Market" in r.columns)
    market_spend_w = spend.get("market_w", pd.DataFrame(columns=["Market", "Week Of (Mon)", "Cost", "Impressions"])).copy()
    if not have_market and market_spend_w.empty:
        return pd.DataFrame(columns=["Market", "Week Of (Mon)", "Cost", "Responses"])

    # Responses by Market + Week
    if "Market" in r.columns:
        resp_by_market_w = r.groupby(["Market", "Week Of (Mon)"], as_index=False).size().rename(columns={"size": "Responses"})
    else:
        resp_by_market_w = pd.DataFrame(columns=["Market", "Week Of (Mon)", "Responses"])

    # Actions by Market + Week (dynamic)
    if len(a) > 0 and "Action" in a.columns and "Market" in a.columns:
        pivot_market_w = a.groupby(["Market", "Week Of (Mon)", "Action"], as_index=False).size()
        pivot_market_w = pivot_market_w.pivot(index=["Market", "Week Of (Mon)"], columns="Action", values="size").fillna(0).reset_index()
    else:
        pivot_market_w = pd.DataFrame({"Market": [], "Week Of (Mon)": []})

    # Merge like Channel
    market = market_spend_w.merge(resp_by_market_w, on=["Market", "Week Of (Mon)"], how="outer") \
                           .merge(pivot_market_w, on=["Market", "Week Of (Mon)"], how="outer")

    # Add Client column
    market["Client"] = client_name

    for col in market.columns:
        if col not in {"Market", "Week Of (Mon)", "Client"}:
            market[col] = coerce_numeric(market[col]).fillna(0)

    market["Cost per Response"] = np.where(market.get("Responses", 0) > 0, market["Cost"] / market["Responses"], np.nan)

    action_cols = [c for c in market.columns if c not in {"Market", "Week Of (Mon)", "Client", "Cost", "Responses", "Cost per Response", "Impressions"} and not str(c).startswith("Cost per ")]
    if action_cols:
        market["Actions_Total"] = market[action_cols].sum(axis=1)
        for act_col in action_cols:
            market[f"Cost per {act_col}"] = np.where(market[act_col] > 0, market["Cost"] / market[act_col], np.nan)
        market["Cost per Actions_Total"] = np.where(market["Actions_Total"] > 0, market["Cost"] / market["Actions_Total"], np.nan)

    market = _reorder_metrics(market, ["Market"])
    market.sort_values(["Week Of (Mon)", "Cost"], ascending=[True, False], inplace=True)
    return market
