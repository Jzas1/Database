"""
TVSquared - Prenuvo Purchase Action Report Export
Exports Purchase Action Report for previous broadcast week
"""

import sys
from playwright.sync_api import sync_playwright
from datetime import datetime, timedelta
import time

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
USERNAME = "joe@myntagency.com"
PASSWORD = "123Places12"
BASE_URL = "https://mynt-agency.us.tvsquared.com"
CLIENT_NAME = "Mynt Agency XP/Prenuvo"
REPORT_NAME = "Prenuvo_All_Action"

def get_last_7_days():
    """Calculate last 7 days"""
    end_date = datetime.now() - timedelta(days=1)  # Yesterday
    start_date = end_date - timedelta(days=6)  # 7 days ago
    return start_date, end_date

def main():
    start_date, end_date = get_last_7_days()
    print(f"Requesting {CLIENT_NAME} {REPORT_NAME} for: {start_date.strftime('%Y-%m-%d')} to {end_date.strftime('%Y-%m-%d')}\n")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        # Create fresh context with no cache
        context = browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            ignore_https_errors=True
        )
        context.clear_cookies()
        page = context.new_page()

        try:
            # Navigate and login
            print("Logging in...")
            page.goto(BASE_URL)
            page.wait_for_load_state("networkidle")
            time.sleep(2)

            page.fill('input[name="email"]', USERNAME)
            page.fill('input[name="password"]', PASSWORD)
            page.click('input[type="submit"]')
            page.wait_for_load_state("networkidle")
            time.sleep(3)

            # Navigate directly to Prenuvo export page
            print("Navigating directly to Prenuvo export page...")
            export_url = "https://mynt-agency-xp.us.tvsquared.com/export/prenuvo-1/default/brands/export/#%2F"
            page.goto(export_url)
            page.wait_for_load_state("networkidle")
            time.sleep(3)

            # Check if redirected back to login
            if page.locator('input[name="email"]').is_visible(timeout=3000):
                print("Redirected to login, logging in again...")
                page.fill('input[name="email"]', USERNAME)
                page.fill('input[name="password"]', PASSWORD)
                page.click('input[type="submit"]')
                page.wait_for_load_state("networkidle")
                time.sleep(3)

                # Try going to export page again
                print("Navigating to export page again...")
                page.goto(export_url)
                page.wait_for_load_state("networkidle")
                time.sleep(3)

            # Configure export
            print(f"Selecting {REPORT_NAME}...")
            page.locator('select[name="config"]').select_option(label=REPORT_NAME)
            time.sleep(1)

            # Set dates
            print("Setting date range...")
            page.locator('text="Start Date"').locator('..').locator('input[readonly]').click()
            page.wait_for_selector('.datepicker', state='visible')
            page.click(f'text="{start_date.day}"')
            time.sleep(0.5)

            page.locator('text="End Date"').locator('..').locator('input[readonly]').click()
            page.wait_for_selector('.datepicker', state='visible')
            page.click(f'text="{end_date.day}"')
            time.sleep(0.5)

            # Submit
            print("Submitting export request...")
            page.click('input[type="submit"], button:has-text("SUBMIT")')
            page.wait_for_load_state("networkidle")
            time.sleep(2)

            print(f"\n✅ [SUCCESS] {REPORT_NAME} export requested!")
            print("You will receive an email when it's ready to download.")

        except Exception as e:
            print(f"\n[ERROR] {str(e)}")
            page.screenshot(path="prenuvo_export_error.png")
            raise
        finally:
            time.sleep(2)
            browser.close()

if __name__ == "__main__":
    main()
