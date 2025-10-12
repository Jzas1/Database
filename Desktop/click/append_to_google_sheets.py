"""
Append CSV data to Google Sheets without duplicating
"""

import sys
import os
import pandas as pd
import gspread
from oauth2client.service_account import ServiceAccountCredentials
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
GOOGLE_SHEET_ID = '15p-R9xAMGSj1mcgJRkJO8xz9f0Ip1R1oIBYhxiWfyRE'
CREDENTIALS_FILE = 'credentials.json'  # Google Service Account credentials

# Tab mappings
TAB_MAPPINGS = {
    'delivery': 'downloads/innovid/delivery_data_*.csv',
    'actions': 'downloads/prenuvo/prenuvo_all_action_*.csv',
    'response': 'downloads/prenuvo/prenuvo_response_*.csv'
}

def get_google_sheet():
    """Connect to Google Sheets"""
    scope = [
        'https://spreadsheets.google.com/feeds',
        'https://www.googleapis.com/auth/drive'
    ]

    if not os.path.exists(CREDENTIALS_FILE):
        print(f"❌ ERROR: {CREDENTIALS_FILE} not found!")
        print("\nTo create credentials:")
        print("1. Go to https://console.cloud.google.com/")
        print("2. Create a project or select existing")
        print("3. Enable Google Sheets API")
        print("4. Create Service Account credentials")
        print("5. Download JSON and save as 'credentials.json'")
        print("6. Share the Google Sheet with the service account email")
        return None

    creds = ServiceAccountCredentials.from_json_keyfile_name(CREDENTIALS_FILE, scope)
    client = gspread.authorize(creds)
    sheet = client.open_by_key(GOOGLE_SHEET_ID)
    return sheet

def get_latest_csv(pattern):
    """Get the most recent CSV file matching pattern"""
    import glob
    files = glob.glob(pattern)
    if not files:
        return None
    return max(files, key=os.path.getctime)

def append_without_duplicates(worksheet, df, unique_columns=None):
    """Append dataframe to worksheet, skipping duplicates"""

    print(f"   📊 Processing {len(df)} rows from CSV...")

    # Get existing data from sheet
    try:
        existing_data = worksheet.get_all_values()
        if len(existing_data) > 1:  # Has headers and data
            existing_df = pd.DataFrame(existing_data[1:], columns=existing_data[0])
            print(f"   📋 Found {len(existing_df)} existing rows in sheet")

            # If unique columns specified, use them to identify duplicates
            if unique_columns:
                # Filter out rows that already exist
                merge_cols = [col for col in unique_columns if col in df.columns and col in existing_df.columns]
                if merge_cols:
                    # Create a key from unique columns
                    existing_df['_key'] = existing_df[merge_cols].astype(str).agg('_'.join, axis=1)
                    df['_key'] = df[merge_cols].astype(str).agg('_'.join, axis=1)

                    # Filter out duplicates
                    new_rows = df[~df['_key'].isin(existing_df['_key'])].copy()
                    new_rows = new_rows.drop(columns=['_key'])

                    print(f"   🔍 {len(new_rows)} new rows to append (filtered {len(df) - len(new_rows)} duplicates)")
                else:
                    new_rows = df
            else:
                # No unique columns specified, append all
                new_rows = df
                print(f"   ⚠️ No unique columns specified, appending all rows")
        else:
            # Sheet is empty, write headers and all data
            print(f"   📝 Sheet is empty, writing headers and all data")
            new_rows = df
            worksheet.update([df.columns.values.tolist()] + df.values.tolist())
            print(f"   ✅ Wrote {len(df)} rows")
            return len(df)
    except Exception as e:
        print(f"   ⚠️ Error reading existing data: {e}")
        new_rows = df

    # Append new rows if any
    if len(new_rows) > 0:
        # Convert to list of lists
        values_to_append = new_rows.values.tolist()
        worksheet.append_rows(values_to_append)
        print(f"   ✅ Appended {len(new_rows)} new rows")
        return len(new_rows)
    else:
        print(f"   ℹ️ No new rows to append")
        return 0

def main():
    print("📊 Starting Google Sheets append process...\n")

    # Connect to Google Sheets
    print("🔗 Connecting to Google Sheets...")
    sheet = get_google_sheet()
    if not sheet:
        return

    print(f"✅ Connected to: {sheet.title}\n")

    total_appended = 0

    # Process each tab
    for tab_name, csv_pattern in TAB_MAPPINGS.items():
        print(f"{'='*60}")
        print(f"Processing tab: {tab_name}")
        print(f"{'='*60}")

        # Find the latest CSV file
        csv_file = get_latest_csv(csv_pattern)
        if not csv_file:
            print(f"   ⚠️ No CSV file found matching: {csv_pattern}")
            continue

        print(f"   📂 Found file: {os.path.basename(csv_file)}")

        # Read CSV
        try:
            df = pd.read_csv(csv_file)
            print(f"   📊 Loaded {len(df)} rows, {len(df.columns)} columns")
        except Exception as e:
            print(f"   ❌ Error reading CSV: {e}")
            continue

        # Get worksheet
        try:
            worksheet = sheet.worksheet(tab_name)
        except:
            print(f"   ❌ Tab '{tab_name}' not found in sheet")
            continue

        # Append data (using first column as unique identifier by default)
        unique_cols = [df.columns[0]] if len(df.columns) > 0 else None
        rows_added = append_without_duplicates(worksheet, df, unique_columns=unique_cols)
        total_appended += rows_added

        print()

    print("="*60)
    print(f"✅ COMPLETE! Total rows appended: {total_appended}")
    print("="*60)

if __name__ == "__main__":
    main()
