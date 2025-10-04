#!/usr/bin/env python3
"""File handling utilities for reading and locating data files."""

from pathlib import Path
import pandas as pd


def find_latest_by_pattern(folder: Path, pattern: str) -> Path:
    """Find the most recently modified file matching the given pattern."""
    matches = sorted(folder.glob(pattern), key=lambda p: p.stat().st_mtime, reverse=True)
    if not matches:
        raise FileNotFoundError(f"No files found matching pattern '{pattern}' in {folder}")
    return matches[0]


def read_sheet(path: Path) -> pd.DataFrame:
    """Read Excel file, trying 'Data' sheet first, then default."""
    try:
        return pd.read_excel(path, sheet_name="Data")
    except Exception:
        return pd.read_excel(path)
