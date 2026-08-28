from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    
    errors = []
    page.on("pageerror", lambda err: errors.append(err.message))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    
    page.goto('http://localhost:8790/floorplan-editor.html')
    page.wait_for_timeout(2000)
    
    html = page.content()
    if 'id="loading" style="display: none;"' in html:
        print("Loading overlay is hidden (SUCCESS)")
    else:
        print("Loading overlay is STILL VISIBLE (FAILURE)")
    
    if errors:
        print("Errors:")
        for e in errors:
            print(e)
            
    browser.close()
