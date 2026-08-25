from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    
    errors = []
    page.on("pageerror", lambda err: errors.append(err.message))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    
    page.goto('http://localhost:8790/floorplan-editor.html')
    page.wait_for_timeout(2000)
    
    # Click on the center of the map to trigger polygon selection (hopefully hits the corridor)
    page.mouse.click(500, 500)
    page.wait_for_timeout(1000)
    
    print("Errors:", errors)
    browser.close()
