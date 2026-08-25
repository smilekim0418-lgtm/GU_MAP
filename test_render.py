from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False) # Run headed just in case
    page = browser.new_page()
    
    errors = []
    page.on("pageerror", lambda err: errors.append(err.message))
    page.on("console", lambda msg: errors.append(msg.text) if msg.type == "error" else None)
    
    page.goto('http://localhost:8790/floorplan-editor.html')
    page.wait_for_timeout(3000)
    
    html = page.content()
    
    print("Leaflet map element:", '<div id="map"' in html)
    print("Leaflet pane exist:", 'leaflet-pane' in html)
    print("ImageLayer exist:", 'leaflet-image-layer' in html)
    
    if errors:
        print("Errors:", errors)
    else:
        print("No errors.")
        
    browser.close()
