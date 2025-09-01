# -------------------------------------------------------
# Real-Time Browser Window OCR (English Only)
# Captures ONLY the active browser window text
# Groups text into paragraphs for NLP
# -------------------------------------------------------

import time
import mss
import mss.tools
import easyocr
import pygetwindow as gw
from datetime import datetime

# Initialize EasyOCR reader (English only)
reader = easyocr.Reader(['en'])

# Output transcript log file
output_file = "transcripts.txt"


def get_browser_window():
    """
    Return the active browser window if it's Chrome/Firefox/Edge/Opera.
    Otherwise return None.
    """
    active_win = gw.getActiveWindow()
    if active_win and any(browser in active_win.title.lower() for browser in ["chrome", "firefox", "edge", "opera"]):
        return active_win
    return None


def group_lines_into_paragraphs(results, y_threshold=20):
    """
    Group OCR lines into paragraphs based on vertical distance.
    results: [(bbox, text, prob), ...]
    y_threshold: max vertical gap (pixels) to consider part of same paragraph
    """
    # Sort results top-to-bottom
    results = sorted(results, key=lambda r: r[0][0][1])  # y of top-left corner

    paragraphs = []
    current_para = []
    last_y = None

    for (bbox, text, prob) in results:
        # Skip garbage OCR (low confidence or empty text)
        if prob < 0.4 or not text.strip():
            continue

        y = bbox[0][1]  # top-left y coordinate

        if last_y is None or abs(y - last_y) < y_threshold:
            current_para.append(text.strip())
        else:
            if current_para:  # only save if non-empty
                paragraphs.append(" ".join(current_para))
            current_para = [text.strip()]

        last_y = y

    # Append last collected paragraph
    if current_para:
        paragraphs.append(" ".join(current_para))

    # Clean spacing
    cleaned = [
        " ".join(w.strip() for w in para.split())
        for para in paragraphs
        if para.strip()
    ]

    return cleaned


with mss.mss() as sct:
    while True:
        browser_window = get_browser_window()

        if browser_window:
            # Get window position & size
            left, top, right, bottom = (
                browser_window.left,
                browser_window.top,
                browser_window.right,
                browser_window.bottom,
            )

            # Define capture region
            region = {
                "top": top,
                "left": left,
                "width": right - left,
                "height": bottom - top
            }

            # Capture only the browser window
            screenshot_path = "browser.png"
            sct_img = sct.grab(region)
            mss.tools.to_png(sct_img.rgb, sct_img.size, output=screenshot_path)

            # OCR processing
            results = reader.readtext(screenshot_path, detail=1)

            # Group into paragraphs
            paragraphs = group_lines_into_paragraphs(results)

            # Get timestamp
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            print(f"\n--- Browser Scan @ {timestamp} ---")

            # Write to file + print results
            with open(output_file, "a", encoding="utf-8") as f:
                f.write(f"\n--- Browser Scan @ {timestamp} ---\n")
                for para in paragraphs:
                    print(para)
                    f.write(para + "\n\n")  # double newline for paragraphs
        else:
            print("\n⚠️ No active browser window detected. Open Chrome/Firefox/Edge/Opera.")

        # Wait 5 seconds before next scan
        time.sleep(5)
