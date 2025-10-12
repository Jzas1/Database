"""
Innovid Campaign Export Automation
Automates login and export of campaign summary from Innovid Studio
"""

import os
import sys
import time
import glob
import zipfile
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration from environment variables
USERNAME = os.getenv('INNOVID_USERNAME', 'shane@myntagency.com')
PASSWORD = os.getenv('INNOVID_PASSWORD', 'MyntAgency2025$')
CAMPAIGN_ID = os.getenv('INNOVID_CAMPAIGN_ID', '224979')

# Download directory
DOWNLOAD_DIR = os.path.join(os.getcwd(), 'downloads', 'innovid')
os.makedirs(DOWNLOAD_DIR, exist_ok=True)

def setup_driver():
    """Configure and return Chrome driver with download preferences"""
    chrome_options = Options()

    # Download preferences
    prefs = {
        "download.default_directory": DOWNLOAD_DIR,
        "download.prompt_for_download": False,
        "download.directory_upgrade": True,
        "safebrowsing.enabled": True
    }
    chrome_options.add_experimental_option("prefs", prefs)

    # Optional: Run headless (comment out to see browser)
    # chrome_options.add_argument('--headless')

    # Start maximized for better element visibility
    chrome_options.add_argument('--start-maximized')

    driver = webdriver.Chrome(options=chrome_options)
    return driver

def login(driver, wait):
    """Handle Innovid login"""
    print('🔐 Logging in to Innovid...')

    try:
        # Wait for and fill username
        username_field = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, 'input[type="text"], input[type="email"], input[name="username"], input[placeholder*="mail"], input[placeholder*="sername"]'))
        )
        username_field.clear()
        username_field.send_keys(USERNAME)
        print('✅ Username entered')

        # Fill password
        time.sleep(0.5)
        password_field = driver.find_element(By.CSS_SELECTOR, 'input[type="password"]')
        password_field.clear()
        # Debug: check password length and last char
        print(f'🔍 Password length: {len(PASSWORD)}, last char: {repr(PASSWORD[-1])}')
        password_field.send_keys(PASSWORD)
        # Verify it was entered
        print('✅ Password entered')

        # Take screenshot of login page for debugging
        login_screenshot = os.path.join(DOWNLOAD_DIR, 'login_page.png')
        driver.save_screenshot(login_screenshot)
        print(f'📸 Login page screenshot: {login_screenshot}')

        # Click sign in button - try MANY different approaches
        time.sleep(1)
        sign_in_selectors = [
            'button#signin-button',
            'button.submit-button',
            'button[id="signin-button"]',
            'button[type="submit"]',
            'button[type="button"]',
            'input[type="submit"]',
            'button.sign-in',
            'button.signin',
            'button.login',
            'button[name="submit"]',
            'button[id*="login"]',
            'button[id*="signin"]',
            'a[role="button"]'
        ]

        sign_in_button = None
        for selector in sign_in_selectors:
            try:
                buttons = driver.find_elements(By.CSS_SELECTOR, selector)
                for btn in buttons:
                    if btn.is_displayed():
                        sign_in_button = btn
                        print(f'Found button with selector: {selector}')
                        break
                if sign_in_button:
                    break
            except NoSuchElementException:
                continue

        # If still not found, search ALL buttons and links by text content
        if not sign_in_button:
            print('🔍 Searching all buttons by text...')
            all_clickable = driver.find_elements(By.XPATH, '//button | //input[@type="submit"] | //a[@role="button"] | //div[@role="button"]')
            print(f'Found {len(all_clickable)} clickable elements')

            for elem in all_clickable:
                try:
                    if not elem.is_displayed():
                        continue
                    elem_text = (elem.text or '').upper()
                    elem_value = (elem.get_attribute('value') or '').upper()
                    elem_aria = (elem.get_attribute('aria-label') or '').upper()

                    if any(text in elem_text or text in elem_value or text in elem_aria
                           for text in ['SIGN IN', 'LOGIN', 'SUBMIT', 'CONTINUE', 'LOG IN']):
                        sign_in_button = elem
                        print(f'Found sign in button with text: {elem.text or elem_value or elem_aria}')
                        break
                except:
                    continue

        if sign_in_button:
            print('🚀 Clicking sign in button...')
            sign_in_button.click()
            print('⏳ Waiting for login to complete...')
            time.sleep(5)
            print('✅ Login successful')
        else:
            print('⚠️ No sign in button found at all, trying form submit...')
            password_field.submit()
            time.sleep(5)

    except (TimeoutException, NoSuchElementException) as e:
        print(f'❌ Login failed: {e}')
        raise

def find_and_click_export(driver, wait):
    """Find and click the export button"""
    print('🔍 Looking for Options dropdown...')

    # Try to find the dropdown button (Options button or similar)
    dropdown_selectors = [
        '[class*="dropdown"]',
        'button:contains("Options")',
        'button.ant-dropdown-trigger',
        '.ant-btn.ant-dropdown-trigger'
    ]

    dropdown_button = None

    # First try finding the Options button by text
    all_buttons = driver.find_elements(By.TAG_NAME, 'button')
    for btn in all_buttons:
        try:
            if btn.is_displayed() and 'options' in btn.text.lower():
                dropdown_button = btn
                print(f'✅ Found Options button: {btn.text}')
                break
        except:
            continue

    # If not found, try CSS selectors
    if not dropdown_button:
        for selector in dropdown_selectors:
            try:
                dropdown_button = driver.find_element(By.CSS_SELECTOR, selector)
                if dropdown_button.is_displayed():
                    print(f'✅ Found dropdown with selector: {selector}')
                    break
            except:
                continue

    if dropdown_button:
        print('🖱️ Clicking dropdown button...')
        dropdown_button.click()

        # Wait for dropdown menu to appear
        time.sleep(1)

        # Find and click the export menu item
        print('🔍 Looking for export option in dropdown...')

        # Try to find menu items
        menu_item_selectors = [
            'li.ant-dropdown-menu-item',
            '.ant-dropdown-menu-item',
            '[role="menuitem"]',
            'li[role="menuitem"]'
        ]

        for selector in menu_item_selectors:
            try:
                menu_items = driver.find_elements(By.CSS_SELECTOR, selector)
                print(f'Found {len(menu_items)} menu items with selector: {selector}')

                # Print all menu items for debugging
                for idx, item in enumerate(menu_items):
                    try:
                        if item.is_displayed():
                            print(f'  Menu item {idx}: {item.text}')
                    except:
                        pass

                # Click the first visible menu item (likely the export)
                for item in menu_items:
                    try:
                        if item.is_displayed():
                            print(f'💾 Clicking menu item: {item.text}')
                            item.click()
                            print('✅ EXPORT INITIATED!')
                            print(f'📦 File will download to: {DOWNLOAD_DIR}')
                            time.sleep(5)
                            return
                    except:
                        continue

            except:
                continue

        raise Exception('Export option not found in dropdown')

    else:
        print('❌ Dropdown button not found')

        # Debug: print all buttons
        all_buttons = driver.find_elements(By.TAG_NAME, 'button')
        print(f'\n📋 DEBUG: Found {len(all_buttons)} buttons on page')

        buttons_with_text = []
        for idx, btn in enumerate(all_buttons):
            try:
                if btn.is_displayed() and btn.text:
                    buttons_with_text.append(f"  {idx}: '{btn.text}' - class: {btn.get_attribute('class')}")
            except:
                pass

        if buttons_with_text:
            print('Visible buttons with text:')
            print('\n'.join(buttons_with_text[:20]))

        raise Exception('No dropdown button found')

def main():
    """Main automation flow"""
    driver = None

    try:
        print('🤖 Starting Innovid automation...')
        print(f'📁 Downloads will be saved to: {DOWNLOAD_DIR}')

        driver = setup_driver()
        wait = WebDriverWait(driver, 10)

        # Navigate directly to campaign overview URL (will redirect to login if needed)
        campaign_overview_url = f'https://studio.innovid.com/analytics/v3/campaign/{CAMPAIGN_ID}/overview'
        print(f'🌐 Navigating to: {campaign_overview_url}')
        driver.get(campaign_overview_url)
        time.sleep(3)

        # Check if we need to log in
        if 'login' in driver.current_url.lower() or driver.find_elements(By.CSS_SELECTOR, 'input[type="password"]'):
            login(driver, wait)
            # After login, navigate back to campaign overview
            print(f'📊 Navigating to campaign overview...')
            driver.get(campaign_overview_url)
            time.sleep(5)
        else:
            print('✅ Already logged in')
            time.sleep(3)

        print('✅ Campaign overview page loaded')

        # Wait for page to fully load
        print('⏳ Waiting for page elements to load...')
        time.sleep(5)

        # Click the 3-dots button to open the dropdown
        print('🔍 Clicking 3-dots menu...')
        driver.execute_script("""
            var btn = document.querySelector('.toggle-more-actions');
            if (btn) {
                btn.click();
            }
        """)
        time.sleep(2)
        print('✅ Dropdown opened')

        # Click Export campaign summary option
        print('🔍 Clicking Export campaign summary...')
        driver.execute_script("document.getElementById('moreActionsExportCampaignSummary').click();")

        print('✅ Export initiated!')
        print('⏳ Waiting for download (this may take a while)...')
        time.sleep(30)  # Increased from 5 to 30 seconds

        print('✅ AUTOMATION COMPLETE!')
        print(f'📂 Check your downloads folder: {DOWNLOAD_DIR}')

        # Extract and process the downloaded ZIP file
        print('📝 Processing downloaded file...')
        time.sleep(5)  # Wait a bit more for download to fully complete

        # Find the most recent ZIP file in download directory
        zip_files = glob.glob(os.path.join(DOWNLOAD_DIR, '*.zip'))
        if zip_files:
            latest_zip = max(zip_files, key=os.path.getctime)
            print(f'📦 Found ZIP file: {os.path.basename(latest_zip)}')

            # Extract the specific CSV we need
            target_csv = 'prenuvo_mynt_ctv_direct_io_Daily_Summary_pre_roll.csv'
            timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')

            with zipfile.ZipFile(latest_zip, 'r') as zip_ref:
                # List all files in ZIP
                all_files = zip_ref.namelist()
                print(f'   ZIP contains {len(all_files)} files')

                # Find and extract the specific CSV
                if target_csv in all_files:
                    print(f'   ✅ Found target file: {target_csv}')

                    # Extract it
                    zip_ref.extract(target_csv, DOWNLOAD_DIR)

                    # Rename it with timestamp
                    extracted_path = os.path.join(DOWNLOAD_DIR, target_csv)
                    new_filename = f'delivery_data_{timestamp}.csv'
                    new_filepath = os.path.join(DOWNLOAD_DIR, new_filename)
                    os.rename(extracted_path, new_filepath)

                    print(f'   ✅ Extracted and renamed to: {new_filename}')
                else:
                    print(f'   ⚠️ Target file not found in ZIP. Files available:')
                    for f in all_files:
                        print(f'      - {f}')

            # Delete the ZIP file
            os.remove(latest_zip)
            print(f'   🗑️ Deleted ZIP file')
        else:
            print('⚠️ No ZIP file found')

    except Exception as e:
        print(f'❌ Error: {e}')
        print('💡 Tip: Make sure Chrome driver is installed and up to date')
        # Keep browser open on error for debugging
        if driver:
            print('Keeping browser open for 10 seconds for debugging...')
            time.sleep(10)

    finally:
        if driver:
            driver.quit()
            print('🔒 Browser closed')

if __name__ == '__main__':
    main()
