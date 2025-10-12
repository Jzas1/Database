"""
Gmail Monitor for Prenuvo TVSquared Export Emails
Watches for export ready emails and downloads the files
"""

import sys
import imaplib
import email
from email.header import decode_header
import time
import re
import requests
import zipfile
import io
from datetime import datetime
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Configuration
GMAIL_USER = "joe@myntagency.com"
GMAIL_APP_PASSWORD = "qbsz rgho lzzo fyxj"
DOWNLOAD_DIR = Path("./downloads/prenuvo")
CHECK_INTERVAL = 60  # Check every 60 seconds

DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

def decode_subject(subject):
    """Decode email subject"""
    decoded = decode_header(subject)
    subject_text = ""
    for part, encoding in decoded:
        if isinstance(part, bytes):
            subject_text += part.decode(encoding or 'utf-8')
        else:
            subject_text += part
    return subject_text

def extract_download_link(email_body):
    """Extract download link from email body"""
    # Look for URLs in the email
    urls = re.findall(r'https?://[^\s<>"]+', email_body)

    # Find the download link (usually contains 'download' or 'export')
    for url in urls:
        if 'download' in url.lower() or 'export' in url.lower():
            return url.strip('>')

    return None

def download_file(url, filename):
    """Download and extract ZIP file from URL"""
    try:
        print(f"Downloading from: {url[:80]}...")

        # Add headers to ensure proper download
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }

        response = requests.get(url, stream=True, timeout=300, headers=headers, allow_redirects=True)
        response.raise_for_status()

        # Download to memory
        zip_data = io.BytesIO()
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                zip_data.write(chunk)

        print(f"  Downloaded {zip_data.tell()} bytes")

        # Extract CSV from ZIP
        zip_data.seek(0)
        with zipfile.ZipFile(zip_data) as zip_file:
            # Get list of files in ZIP
            files = zip_file.namelist()
            print(f"  ZIP contains: {files}")

            # Find the CSV file
            csv_file = None
            for f in files:
                if f.endswith('.csv'):
                    csv_file = f
                    break

            if not csv_file:
                print(f"❌ [ERROR] No CSV file found in ZIP")
                return False

            # Extract and save the CSV
            csv_data = zip_file.read(csv_file)
            filepath = DOWNLOAD_DIR / filename

            with open(filepath, 'wb') as f:
                f.write(csv_data)

            # Verify file was written
            if filepath.exists() and filepath.stat().st_size > 0:
                print(f"✅ [SUCCESS] Extracted {filepath.stat().st_size} bytes to {filepath}")
                return True
            else:
                print(f"❌ [ERROR] File is empty or wasn't created")
                return False

    except zipfile.BadZipFile:
        print(f"❌ [ERROR] Downloaded file is not a valid ZIP")
        return False
    except Exception as e:
        print(f"❌ [ERROR] Failed to download: {e}")
        return False

def process_download_email(mail, email_id, subject, msg):
    """Process an export download ready email"""
    print(f"\n{'='*60}")
    print(f"Processing download: {subject}")
    print(f"{'='*60}")

    # Get email body
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            content_type = part.get_content_type()
            if content_type == "text/plain" or content_type == "text/html":
                try:
                    body += part.get_payload(decode=True).decode()
                except:
                    pass
    else:
        try:
            body = msg.get_payload(decode=True).decode()
        except:
            pass

    # Debug: show body snippet
    print(f"Body preview (first 200 chars): {body[:200]}")

    # TVSquared doesn't put client name in export emails
    # Instead, check if it has "order data" or "response data"
    is_order_data = "order data" in body.lower()
    is_response_data = "response data" in body.lower()

    print(f"   Contains 'order data': {is_order_data}")
    print(f"   Contains 'response data': {is_response_data}")

    if not (is_order_data or is_response_data):
        print("⚠️ [SKIP] Not an order/response export email")
        return False

    # Extract download link
    print("   Looking for download link...")
    download_link = extract_download_link(body)
    print(f"   Download link found: {download_link}")

    if download_link:
        # Determine filename based on email body content
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if "order data" in body.lower():
            filename = f"prenuvo_all_action_{timestamp}.csv"
        elif "response data" in body.lower():
            filename = f"prenuvo_response_{timestamp}.csv"
        else:
            filename = f"prenuvo_export_{timestamp}.csv"

        # Download the file
        if download_file(download_link, filename):
            # Mark as read
            mail.store(email_id, '+FLAGS', '\\Seen')
            print(f"✅ [OK] Email marked as read")
            return True
    else:
        print("⚠️ [WARNING] No download link found in email")

    return False

def monitor_gmail():
    """Main monitoring loop"""
    print(f"🔍 Starting Gmail monitor for Prenuvo exports")
    print(f"📧 Email: {GMAIL_USER}")
    print(f"⏱️ Checking every {CHECK_INTERVAL} seconds")
    print(f"📁 Downloads will be saved to: {DOWNLOAD_DIR}")
    print("\nPress Ctrl+C to stop\n")

    if not GMAIL_APP_PASSWORD:
        print("❌ [ERROR] Please set GMAIL_APP_PASSWORD in the script!")
        print("\nTo create an app password:")
        print("1. Go to https://myaccount.google.com/security")
        print("2. Enable 2-Step Verification if not already enabled")
        print("3. Go to https://myaccount.google.com/apppasswords")
        print("4. Create a new app password for 'Mail'")
        print("5. Copy the 16-character password and paste it in this script")
        return

    while True:
        try:
            # Connect to Gmail
            mail = imaplib.IMAP4_SSL("imap.gmail.com")
            mail.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            mail.select("inbox")

            # Search for unread emails from TVSquared
            status, messages = mail.search(None, '(UNSEEN FROM "noreply@tvsquared.com")')

            if status == "OK":
                email_ids = messages[0].split()

                if email_ids:
                    print(f"\n[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] Found {len(email_ids)} unread email(s) from TVSquared")

                    for email_id in email_ids:
                        # Fetch the email
                        status, msg_data = mail.fetch(email_id, "(RFC822)")

                        if status == "OK":
                            msg = email.message_from_bytes(msg_data[0][1])
                            subject = decode_subject(msg["Subject"])

                            print(f"\n📧 Found email: {subject}")

                            # Check if it's an export download ready email
                            if "data exported" in subject.lower() or "export" in subject.lower():
                                print(f"   ✅ Matches export criteria, processing...")
                                process_download_email(mail, email_id, subject, msg)
                            else:
                                print(f"   ⏭️ Skipping (subject doesn't contain 'data exported' or 'export')")
                else:
                    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] No new emails")

            mail.close()
            mail.logout()

        except KeyboardInterrupt:
            print("\n\n⛔ [STOPPED] Monitor stopped by user")
            break
        except Exception as e:
            print(f"❌ [ERROR] {e}")

        # Wait before next check
        time.sleep(CHECK_INTERVAL)

if __name__ == "__main__":
    monitor_gmail()
