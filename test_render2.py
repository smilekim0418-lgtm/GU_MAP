from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    
    page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))
    page.on("pageerror", lambda err: print(f"PAGE ERROR: {err.message}"))
    page.on("requestfailed", lambda req: print(f"REQUEST FAILED: {req.url} ({req.failure.error_text if req.failure else 'unknown'})"))
    page.on("response", lambda res: print(f"RESPONSE: {res.status} {res.url}"))
    
    try:
        page.goto('http://localhost:8790/floorplan-editor.html')
        page.wait_for_timeout(3000)
    except Exception as e:
        print("GOTO FAILED:", e)
        
    browser.close()
