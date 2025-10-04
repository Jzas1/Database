#!/usr/bin/env python3
"""Google Sheets integration for data push operations."""

from typing import Dict, List, Optional, Set
from pathlib import Path
import json
import os
import sys
import argparse
import pandas as pd
import gspread

from config import EXCEL_TO_MASTER, WEEK_COL, MODES


def _prompt_choice(title: str, options: List[str], default_idx: int = 0) -> str:
    """Interactive menu for selecting options."""
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
    """Read clients configuration from JSON file."""
    with open(cfg_path, "r", encoding="utf-8") as f:
        return json.load(f)


def _open_sheet_by_id(sheet_id: str):
    """Open Google Sheet by ID using service account."""
    gc = gspread.service_account()  # uses GOOGLE_APPLICATION_CREDENTIALS env var
    return gc.open_by_key(sheet_id)


def _ensure_header_and_extend(ws, desired_header: List[str]) -> List[str]:
    """Ensure worksheet has header row, extending with new columns if needed."""
    vals = ws.row_values(1)
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
    """Delete rows matching specific week values."""
    if not weeks or not header:
        return
    try:
        widx_0 = header.index(WEEK_COL)  # 0-based in our list
    except ValueError:
        return
    col_idx = widx_0 + 1  # gspread is 1-based
    col_vals = ws.col_values(col_idx)  # includes header at row 1
    to_del = []
    for row_num, wk in enumerate(col_vals[1:], start=2):  # start after header
        if wk in weeks:
            to_del.append(row_num)
    # delete bottom-up to keep indices stable
    for r in reversed(to_del):
        ws.delete_rows(r)


def _df_to_rows(df: pd.DataFrame, header: List[str]) -> List[List]:
    """Convert DataFrame to list of rows matching header order."""
    out = df.copy()

    # Make sure every header col exists
    for col in header:
        if col not in out.columns:
            out[col] = pd.NA

    # Reorder to header
    out = out[header]

    # 1) Any categorical columns → convert to string first
    for col in out.columns:
        if pd.api.types.is_categorical_dtype(out[col].dtype):
            out[col] = out[col].astype("string")

    # 2) Make everything object so we can mix numbers/strings cleanly
    out = out.astype(object)

    # 3) Replace missing with empty string
    out = out.where(pd.notna(out), "")

    # 4) Rows for Sheets
    return out.values.tolist()


def _collect_weeks(df: pd.DataFrame) -> Set[str]:
    """Extract unique week values from DataFrame."""
    if WEEK_COL not in df.columns:
        return set()
    ser = pd.Series(df[WEEK_COL]).dropna().astype(str)
    return set(ser.unique())


def _get_sheets_cli_overrides():
    """
    Returns (mode, client, tabs) from CLI if provided.
    --sheets in {ReplaceWeeks,Append,ReplaceAll,Skip}
    --client is client key from clients.json
    --sheets-tabs is comma list of tab names to push
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
    Merge CLI with env vars. CLI wins over env.
    SHEETS_MODE, SHEETS_CLIENT, SHEETS_TABS
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
    """Filter frames dict to only include whitelisted tabs."""
    if not whitelist:
        return frames
    valid = set(frames.keys())
    chosen = [t for t in whitelist if t in valid]
    if not chosen:
        print(f"[Sheets] Provided tabs whitelist has no valid items. Available: {sorted(valid)}")
        return {}
    return {k: frames[k] for k in chosen}


def _noninteractive() -> bool:
    """Check if running in non-interactive mode."""
    try:
        return not sys.stdin.isatty()
    except Exception:
        return True  # play it safe


def _frames_from_memory(perf_tabs, market_df, actions_dedup, response_dedup) -> Dict[str, pd.DataFrame]:
    """Collect all frames from memory into a dict."""
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
    """Push dataframes to Google Sheets with specified mode."""
    sh = _open_sheet_by_id(sheet_id)
    for excel_tab, master_tab in EXCEL_TO_MASTER.items():
        if excel_tab not in frames:
            print(f"- Skipping {excel_tab}: not produced in this run")
            continue
        df = frames[excel_tab].copy()
        if df.empty:
            print(f"- Skipping {excel_tab}: 0 rows")
            continue

        # Ensure week col exists
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
