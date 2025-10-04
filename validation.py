#!/usr/bin/env python3
"""
Data quality validation utilities for the analytics pipeline.
Checks for common data issues and provides detailed reporting.
"""

from typing import Dict, List, Tuple
import pandas as pd
import logging
from logger import get_logger

logger = get_logger("validation")


class ValidationReport:
    """Container for validation results."""

    def __init__(self):
        self.warnings: List[str] = []
        self.errors: List[str] = []
        self.info: List[str] = []

    def add_warning(self, msg: str):
        """Add a warning message."""
        self.warnings.append(msg)
        logger.warning(msg)

    def add_error(self, msg: str):
        """Add an error message."""
        self.errors.append(msg)
        logger.error(msg)

    def add_info(self, msg: str):
        """Add an info message."""
        self.info.append(msg)
        logger.info(msg)

    def has_errors(self) -> bool:
        """Check if any errors were found."""
        return len(self.errors) > 0

    def has_warnings(self) -> bool:
        """Check if any warnings were found."""
        return len(self.warnings) > 0

    def print_summary(self):
        """Print validation summary."""
        if self.errors:
            logger.error(f"Found {len(self.errors)} error(s):")
            for err in self.errors:
                logger.error(f"  - {err}")

        if self.warnings:
            logger.warning(f"Found {len(self.warnings)} warning(s):")
            for warn in self.warnings:
                logger.warning(f"  - {warn}")

        if self.info:
            logger.info("Validation info:")
            for info in self.info:
                logger.info(f"  - {info}")

        if not self.errors and not self.warnings:
            logger.info("✓ All validation checks passed")


def validate_actions_data(df: pd.DataFrame, name: str = "Actions") -> ValidationReport:
    """
    Validate actions dataframe.

    Args:
        df: Actions dataframe
        name: Name for logging

    Returns:
        ValidationReport with findings
    """
    report = ValidationReport()

    # Check for required columns
    required_cols = ["SessionID", "Action"]
    for col in required_cols:
        if col not in df.columns:
            report.add_error(f"{name}: Missing required column '{col}'")

    if report.has_errors():
        return report

    # Row count
    report.add_info(f"{name}: {len(df):,} total rows")

    # Check for null SessionIDs
    null_sessions = df["SessionID"].isna().sum()
    if null_sessions > 0:
        report.add_warning(f"{name}: {null_sessions:,} rows with null SessionID ({null_sessions/len(df)*100:.1f}%)")

    # Check for null Actions
    null_actions = df["Action"].isna().sum()
    if null_actions > 0:
        report.add_warning(f"{name}: {null_actions:,} rows with null Action ({null_actions/len(df)*100:.1f}%)")

    # Check for duplicate SessionID+Action combinations
    if len(df) > 0:
        dup_count = df.duplicated(subset=["SessionID", "Action"], keep=False).sum()
        if dup_count > 0:
            report.add_info(f"{name}: {dup_count:,} duplicate SessionID+Action combinations (will be deduplicated)")

    # Check timestamp coverage
    if "Timestamp" in df.columns:
        valid_ts = df["Timestamp"].notna().sum()
        if valid_ts == 0:
            report.add_warning(f"{name}: No valid timestamps found")
        else:
            ts_coverage = valid_ts / len(df) * 100
            report.add_info(f"{name}: {ts_coverage:.1f}% timestamp coverage")

            # Date range
            ts_series = pd.to_datetime(df["Timestamp"], errors="coerce")
            min_date = ts_series.min()
            max_date = ts_series.max()
            if pd.notna(min_date) and pd.notna(max_date):
                report.add_info(f"{name}: Date range {min_date.date()} to {max_date.date()}")

    # Check probability distribution
    if "Probability" in df.columns:
        prob_series = pd.to_numeric(df["Probability"], errors="coerce")
        valid_prob = prob_series.notna().sum()
        if valid_prob > 0:
            report.add_info(f"{name}: Probability range [{prob_series.min():.2f}, {prob_series.max():.2f}]")

    # Check action type distribution
    if "Action" in df.columns:
        action_counts = df["Action"].value_counts()
        report.add_info(f"{name}: {len(action_counts)} unique action types")
        top_actions = action_counts.head(5)
        for action, count in top_actions.items():
            report.add_info(f"  - {action}: {count:,} ({count/len(df)*100:.1f}%)")

    # Check station coverage
    if "Station" in df.columns:
        null_stations = df["Station"].isna().sum()
        if null_stations > 0:
            report.add_warning(f"{name}: {null_stations:,} rows with null/unknown Station ({null_stations/len(df)*100:.1f}%)")

    return report


def validate_response_data(df: pd.DataFrame, name: str = "Response") -> ValidationReport:
    """
    Validate response dataframe.

    Args:
        df: Response dataframe
        name: Name for logging

    Returns:
        ValidationReport with findings
    """
    report = ValidationReport()

    # Check for required columns
    if "SessionID" not in df.columns:
        report.add_error(f"{name}: Missing required column 'SessionID'")
        return report

    # Row count
    report.add_info(f"{name}: {len(df):,} total rows")

    # Check for null SessionIDs
    null_sessions = df["SessionID"].isna().sum()
    if null_sessions > 0:
        report.add_warning(f"{name}: {null_sessions:,} rows with null SessionID ({null_sessions/len(df)*100:.1f}%)")

    # Check for duplicate SessionIDs
    if len(df) > 0:
        dup_count = df.duplicated(subset=["SessionID"], keep=False).sum()
        if dup_count > 0:
            report.add_info(f"{name}: {dup_count:,} duplicate SessionIDs (will be deduplicated)")

    # Check timestamp coverage
    if "Timestamp" in df.columns:
        valid_ts = df["Timestamp"].notna().sum()
        if valid_ts == 0:
            report.add_warning(f"{name}: No valid timestamps found")
        else:
            ts_coverage = valid_ts / len(df) * 100
            report.add_info(f"{name}: {ts_coverage:.1f}% timestamp coverage")

            # Date range
            ts_series = pd.to_datetime(df["Timestamp"], errors="coerce")
            min_date = ts_series.min()
            max_date = ts_series.max()
            if pd.notna(min_date) and pd.notna(max_date):
                report.add_info(f"{name}: Date range {min_date.date()} to {max_date.date()}")

    # Check station coverage
    if "Station" in df.columns:
        null_stations = df["Station"].isna().sum()
        if null_stations > 0:
            report.add_warning(f"{name}: {null_stations:,} rows with null/unknown Station ({null_stations/len(df)*100:.1f}%)")

    return report


def validate_compile_data(df: pd.DataFrame, name: str = "Compile") -> ValidationReport:
    """
    Validate compile/spend dataframe.

    Args:
        df: Compile dataframe
        name: Name for logging

    Returns:
        ValidationReport with findings
    """
    report = ValidationReport()

    # Row count
    report.add_info(f"{name}: {len(df):,} total rows")

    # Check for cost column
    from normalization import normalize
    cols_norm = {normalize(c): c for c in df.columns}
    has_cost = any(k in cols_norm for k in ["cost", "clientgross", "gross", "spend"])

    if not has_cost:
        report.add_error(f"{name}: No cost column found (expected Cost, Client Gross, Gross, or Spend)")
        return report

    # Find cost column
    cost_col = None
    for k in ["clientgross", "cost", "gross", "spend"]:
        if k in cols_norm:
            cost_col = cols_norm[k]
            break

    # Validate cost values
    if cost_col:
        cost_series = pd.to_numeric(df[cost_col], errors="coerce")
        null_cost = cost_series.isna().sum()
        if null_cost > 0:
            report.add_warning(f"{name}: {null_cost:,} rows with invalid cost values")

        total_cost = cost_series.sum()
        report.add_info(f"{name}: Total cost ${total_cost:,.2f}")

        if total_cost == 0:
            report.add_warning(f"{name}: Total cost is $0")

        # Cost distribution
        if cost_series.notna().sum() > 0:
            report.add_info(f"{name}: Cost range [${cost_series.min():,.2f}, ${cost_series.max():,.2f}]")

    # Check for station column
    has_station = any(k in cols_norm for k in ["station", "stationname", "channel"])
    if not has_station:
        report.add_error(f"{name}: No station column found (expected Station, StationName, or Channel)")

    # Check for date column
    has_date = any(k in cols_norm for k in ["dateaired", "date", "airdate"])
    if not has_date:
        report.add_warning(f"{name}: No date column found - weekly aggregation may not work")

    # Check for impressions
    has_impressions = "impressions" in cols_norm
    if has_impressions:
        impr_series = pd.to_numeric(df[cols_norm["impressions"]], errors="coerce")
        total_impr = impr_series.sum()
        report.add_info(f"{name}: Total impressions {total_impr:,.0f}")

    return report


def validate_session_overlap(actions_df: pd.DataFrame, response_df: pd.DataFrame) -> ValidationReport:
    """
    Validate overlap between actions and response SessionIDs.

    Args:
        actions_df: Actions dataframe with SessionID
        response_df: Response dataframe with SessionID

    Returns:
        ValidationReport with findings
    """
    report = ValidationReport()

    if "SessionID" not in actions_df.columns or "SessionID" not in response_df.columns:
        report.add_warning("Cannot validate session overlap - SessionID column missing")
        return report

    actions_sessions = set(actions_df["SessionID"].dropna().unique())
    response_sessions = set(response_df["SessionID"].dropna().unique())

    overlap = actions_sessions & response_sessions
    actions_only = actions_sessions - response_sessions
    response_only = response_sessions - actions_sessions

    total_sessions = len(actions_sessions | response_sessions)

    report.add_info(f"Session overlap: {len(overlap):,} sessions in both Actions and Response")
    report.add_info(f"Actions only: {len(actions_only):,} sessions")
    report.add_info(f"Response only: {len(response_only):,} sessions")

    if len(overlap) == 0:
        report.add_error("No session overlap between Actions and Response - check data alignment")
    else:
        overlap_pct = len(overlap) / total_sessions * 100
        report.add_info(f"Overlap rate: {overlap_pct:.1f}%")

        if overlap_pct < 10:
            report.add_warning(f"Low session overlap ({overlap_pct:.1f}%) - data may be misaligned")

    return report


def validate_environment() -> ValidationReport:
    """
    Validate environment configuration and dependencies.

    Returns:
        ValidationReport with findings
    """
    report = ValidationReport()

    # Check Python version
    import sys
    py_version = f"{sys.version_info.major}.{sys.version_info.minor}.{sys.version_info.micro}"
    report.add_info(f"Python version: {py_version}")

    # Check required packages
    required_packages = {
        "pandas": "data processing",
        "numpy": "numerical operations",
        "xlsxwriter": "Excel output",
        "openpyxl": "Excel reading",
    }

    for package, purpose in required_packages.items():
        try:
            __import__(package)
            report.add_info(f"[OK] {package} available ({purpose})")
        except ImportError:
            report.add_error(f"[MISSING] Required package: {package} ({purpose})")

    # Check optional packages
    try:
        import gspread
        report.add_info("[OK] gspread available (Google Sheets integration)")
    except ImportError:
        report.add_warning("gspread not available - Google Sheets push will not work")

    # Check Google Sheets credentials
    import os
    if "GOOGLE_APPLICATION_CREDENTIALS" in os.environ:
        creds_path = os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        from pathlib import Path
        if Path(creds_path).exists():
            report.add_info(f"[OK] Google credentials configured: {creds_path}")
        else:
            report.add_warning(f"GOOGLE_APPLICATION_CREDENTIALS set but file not found: {creds_path}")
    else:
        report.add_info("Google credentials not configured (optional)")

    return report
