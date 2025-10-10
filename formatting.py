#!/usr/bin/env python3
"""Excel formatting utilities for performance sheets."""

import pandas as pd


def _xl_col(idx: int) -> str:
    """Convert 0-based column index to Excel column letter (A, B, ... Z, AA, AB, ...)."""
    s = ""
    while idx >= 0:
        s = chr(idx % 26 + ord('A')) + s
        idx = idx // 26 - 1
    return s


def format_performance_sheet(writer: pd.ExcelWriter, sheet_name: str, df: pd.DataFrame):
    """Apply Excel formatting to performance sheets with dynamic action columns."""
    wb = writer.book
    ws = writer.sheets[sheet_name]
    nrows, ncols = df.shape

    center_def = wb.add_format({"align": "center", "valign": "vcenter"})
    header = wb.add_format({"bold": True, "align": "center", "valign": "vcenter", "border": 1, "bg_color": "#F2F2F2"})
    currency_def = wb.add_format({"num_format": "$#,##0.00", "align": "center", "valign": "vcenter"})
    integer_def = wb.add_format({"num_format": "#,##0", "align": "center", "valign": "vcenter"})

    currency_cell = wb.add_format({"num_format": "$#,##0.00", "align": "center", "valign": "vcenter", "border": 1})
    integer_cell = wb.add_format({"num_format": "#,##0", "align": "center", "valign": "vcenter", "border": 1})
    total_lbl = wb.add_format({"bold": True, "align": "center", "valign": "vcenter", "border": 1})

    data_border = wb.add_format({"border": 1})

    ws.set_column(0, ncols - 1, 16, center_def)
    ws.write_row(0, 0, list(df.columns), header)

    cols = list(df.columns)
    def idx(col):
        return cols.index(col) if col in cols else None

    cost_idx = idx("Cost")
    resp_idx = idx("Responses")
    impr_idx = idx("Impressions")
    fixed_names = {"Market", "Station", "Creative", "Day", "Hour", "Cost", "Responses", "Impressions", "Actions_Total", "Cost per Actions_Total", "Cost per Response"}
    action_cols = [c for c in cols if c not in fixed_names and not str(c).startswith("Cost per ") and c != "Week Of (Mon)"]

    if cost_idx is not None:
        ws.set_column(cost_idx, cost_idx, 16, currency_def)
    if resp_idx is not None:
        ws.set_column(resp_idx, resp_idx, 14, integer_def)
    if impr_idx is not None:
        ws.set_column(impr_idx, impr_idx, 16, integer_def)
    for ac in action_cols:
        ac_idx = idx(ac)
        if ac_idx is not None:
            ws.set_column(ac_idx, ac_idx, 14, integer_def)
        cpa_idx = idx(f"Cost per {ac}")
        if cpa_idx is not None:
            ws.set_column(cpa_idx, cpa_idx, 18, currency_def)
    cpat_idx = idx("Cost per Actions_Total")
    if cpat_idx is not None:
        ws.set_column(cpat_idx, cpat_idx, 20, currency_def)
    cpr_idx = idx("Cost per Response")
    if cpr_idx is not None:
        ws.set_column(cpr_idx, cpr_idx, 18, currency_def)

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

    if cost_idx is not None:
        write_sum(cost_idx, currency_cell)
    if resp_idx is not None:
        write_sum(resp_idx, integer_cell)
    if impr_idx is not None:
        write_sum(impr_idx, integer_cell)
    at_idx = idx("Actions_Total")
    if at_idx is not None:
        write_sum(at_idx, integer_cell)
    for ac in action_cols:
        aci = idx(ac)
        if aci is not None:
            write_sum(aci, integer_cell)

    if cpr_idx is not None and cost_idx is not None and resp_idx is not None:
        cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
        resp_cell = f"{_xl_col(resp_idx)}{total_row+1}"
        ws.write_formula(total_row, cpr_idx, f"=IF({resp_cell}>0,{cost_cell}/{resp_cell},\"\")", currency_cell)

    if at_idx is not None and cost_idx is not None and cpat_idx is not None:
        cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
        tot_cell = f"{_xl_col(at_idx)}{total_row+1}"
        ws.write_formula(total_row, cpat_idx, f"=IF({tot_cell}>0,{cost_cell}/{tot_cell},\"\")", currency_cell)

    for ac in action_cols:
        cpa_idx = idx(f"Cost per {ac}")
        aci = idx(ac)
        if cpa_idx is not None and aci is not None and cost_idx is not None:
            cost_cell = f"{_xl_col(cost_idx)}{total_row+1}"
            ac_cell = f"{_xl_col(aci)}{total_row+1}"
            ws.write_formula(total_row, cpa_idx, f"=IF({ac_cell}>0,{cost_cell}/{ac_cell},\"\")", currency_cell)
