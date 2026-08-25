from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        
        errors = []
        page.on("pageerror", lambda err: errors.append(f"PageError: {err}"))
        page.on("console", lambda msg: errors.append(f"Console {msg.type}: {msg.text}") if msg.type in ['error', 'warning'] else None)
        
        page.goto("http://localhost:8790/floorplan-editor.html")
        page.wait_for_timeout(2000)
        
        if errors:
            for e in errors: print(e)
        else:
            print("No errors found!")
        
        browser.close()
run()
