const { sync } = require('playwright-sync');
const browser = sync.chromium.launch();
const page = browser.newPage();
page.goto('http://localhost:8790/floorplan-editor.html');
page.waitForTimeout(2000);
const html = page.content();
if (html.includes('id="loading" style="display: none;"')) {
    console.log("Loading overlay is hidden (SUCCESS)");
} else {
    console.log("Loading overlay is STILL VISIBLE (FAILURE)");
    
    // Check if there are JS errors
    const errs = page.evaluate(() => window.errors || []);
    console.log("Errors: ", errs);
}
browser.close();
