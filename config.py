#!/usr/bin/env python3
"""Configuration constants for auto processing pipeline."""

from pathlib import Path

# File paths
FOLDER = Path(r"C:\Users\joe\Desktop\Auto")

# File patterns
PATTERNS = {
    "actions": "Actions-*.xlsx",
    "response": "Response-*.xlsx",
    "compile": "Compile_*.xlsx",
}

# Output template
OUTPUT_FILENAME_TEMPLATE = "Output_{ts}.xlsx"

# Google Sheets mapping
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
