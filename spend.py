#!/usr/bin/env python3
"""Build spend tables and station priority rankings from compile data."""

from typing import Dict, Tuple
import pandas as pd

from normalization import (
    first_col_by_keys,
    norm_station_series,
    coerce_datetime,
    coerce_numeric,
    coerce_hour_series,
    week_label_series,
    normalize,
)


def build_compile_spend(df_compile: pd.DataFrame) -> Dict[str, pd.DataFrame]:
    """Build comprehensive spend tables from compile data, both weekly and non-weekly."""
    df = df_compile.copy()

    # Station column
    station_col = first_col_by_keys(df, ["station", "stationname", "channel"])
    if not station_col:
        raise ValueError(f"Compile missing 'Station' column. Present: {list(df.columns)}")

    # Cost & impressions
    cost_col = first_col_by_keys(df, ["clientgross", "clientgrossamt", "cost", "gross", "spend"])
    if not cost_col:
        raise ValueError("Compile missing cost column (Client Gross / Cost / Gross / Spend)")
    impr_col = first_col_by_keys(df, ["impressions"])  # optional

    # Creative/date/time
    creative_col = first_col_by_keys(df, ["tapeaired", "programaired", "creative", "szspottitle"])
    date_col = first_col_by_keys(df, [
        "dateaired", "dateairedmmddyyyy", "dateairedyyyymmdd", "dateairedyyyy-mm-dd",
        "dateaired2024", "dateairedmmyy", "datea", "date_aired", "airdate", "date"
    ])
    time_col = first_col_by_keys(df, ["timeaired", "time_aired", "airtime", "time"])

    # Base station spend (no week)
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
    market_col = first_col_by_keys(df, ["market", "t_adspots_market"])
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
        # Normalize Market: "National Cable", "National Network" → "National"
        mk["Market"] = mk["Market"].astype(str).str.strip().str.replace(r'(?i)^national\s*(cable|network)\s*$', 'National', regex=True)
        market_spend = mk.groupby("Market", as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
    else:
        market_spend = pd.DataFrame(columns=["Market", "Cost", "Impressions"])

    # Weekly variants (broadcast week = Monday start)
    if date_col and date_col in df.columns:
        df["_date"] = coerce_datetime(df[date_col])
        df["_Week Of (Mon)"] = week_label_series(df["_date"])

        # station_w
        st_w = df[[station_col, cost_col, impr_col, "_Week Of (Mon)"]].copy() if impr_col in df.columns else df[[station_col, cost_col, "_Week Of (Mon)"]].copy()
        if impr_col not in st_w.columns:
            st_w["Impressions"] = 0
        st_w.rename(columns={station_col: "Station", cost_col: "Cost"}, inplace=True)
        st_w["Station"] = norm_station_series(st_w["Station"]).fillna("UNKNOWN")
        station_spend_w = st_w.groupby(["Station", "_Week Of (Mon)"], as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
        station_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)

        # station_creative_w
        if creative_col and creative_col in df.columns:
            sc_w = df[[station_col, creative_col, cost_col, "_Week Of (Mon)"]].copy()
            sc_w[cost_col] = coerce_numeric(sc_w[cost_col]).fillna(0)
            if impr_col in df.columns:
                sc_w[impr_col] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                sc_w["Impressions"] = 0
            sc_w.rename(columns={station_col: "Station", creative_col: "Creative", cost_col: "Cost"}, inplace=True)
            sc_w["Station"] = norm_station_series(sc_w["Station"]).fillna("UNKNOWN")
            sc_w["Creative"] = pd.Series(sc_w["Creative"], dtype="string").str.strip().str.upper().replace({"": pd.NA})
            station_creative_spend_w = sc_w.groupby(["Station", "Creative", "_Week Of (Mon)"], as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
            station_creative_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            station_creative_spend_w = pd.DataFrame(columns=["Station", "Creative", "Week Of (Mon)", "Cost", "Impressions"])

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
            day_spend_w = d2.groupby(["Day", "_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col, "sum"), Impressions=("Impressions", "sum"))
            day_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            day_spend_w = pd.DataFrame(columns=["Day", "Week Of (Mon)", "Cost", "Impressions"])

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
            hour_spend_w = h2.groupby(["Hour", "_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col, "sum"), Impressions=("Impressions", "sum"))
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
            station_hour_spend_w = sh2.groupby(["Station", "Hour", "_Week Of (Mon)"], as_index=False).agg(Cost=(cost_col, "sum"), Impressions=("Impressions", "sum"))
            station_hour_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            hour_spend_w = pd.DataFrame(columns=["Hour", "Week Of (Mon)", "Cost", "Impressions"])
            station_hour_spend_w = pd.DataFrame(columns=["Station", "Hour", "Week Of (Mon)", "Cost", "Impressions"])

        # market_w
        if market_col and market_col in df.columns:
            mk2 = df[[market_col, cost_col, "_Week Of (Mon)"]].copy()
            mk2.rename(columns={market_col: "Market", cost_col: "Cost"}, inplace=True)
            mk2["Cost"] = coerce_numeric(mk2["Cost"]).fillna(0)
            # Normalize Market: "National Cable", "National Network" → "National"
            mk2["Market"] = mk2["Market"].astype(str).str.strip().str.replace(r'(?i)^national\s*(cable|network)\s*$', 'National', regex=True)
            if impr_col in df.columns:
                mk2["Impressions"] = coerce_numeric(df[impr_col]).fillna(0)
            else:
                mk2["Impressions"] = 0
            market_spend_w = mk2.groupby(["Market", "_Week Of (Mon)"], as_index=False).agg(Cost=("Cost", "sum"), Impressions=("Impressions", "sum"))
            market_spend_w.rename(columns={"_Week Of (Mon)": "Week Of (Mon)"}, inplace=True)
        else:
            market_spend_w = pd.DataFrame(columns=["Market", "Week Of (Mon)", "Cost", "Impressions"])
    else:
        station_spend_w = pd.DataFrame(columns=["Station", "Week Of (Mon)", "Cost", "Impressions"])
        station_creative_spend_w = pd.DataFrame(columns=["Station", "Creative", "Week Of (Mon)", "Cost", "Impressions"])
        day_spend_w = pd.DataFrame(columns=["Day", "Week Of (Mon)", "Cost", "Impressions"])
        hour_spend_w = pd.DataFrame(columns=["Hour", "Week Of (Mon)", "Cost", "Impressions"])
        station_hour_spend_w = pd.DataFrame(columns=["Station", "Hour", "Week Of (Mon)", "Cost", "Impressions"])
        market_spend_w = pd.DataFrame(columns=["Market", "Week Of (Mon)", "Cost", "Impressions"])

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
    """Build station priority ranking based on cost per spot."""
    df = df_compile.copy()
    station_col = first_col_by_keys(df, ["station", "stationname", "channel"])
    if station_col is None:
        raise ValueError(f"Compile is missing 'Station' column. Present: {list(df.columns)}")

    impressions_col = first_col_by_keys(df, ["impressions"])  # optional

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
