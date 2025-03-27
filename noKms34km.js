const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    const userDataDir = "/home/runner/Nodeman/builKms34km"; // Use the persistent profile
    const extensionPath = "/home/runner/Nodeman/extKms34km"; // Correct extension path

    if (!fs.existsSync(extensionPath)) {
        console.error(`Error: Extension path does not exist - ${extensionPath}`);
        process.exit(1);
    }

    const browser = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Extensions do NOT work in headless mode
        args: [
            "--disable-blink-features=AutomationControlled",
            "--no-sandbox",
            "--disable-gpu",  // Fix GPU issues
            "--disable-software-rasterizer", // Use CPU rendering
            "--disable-dev-shm-usage",  // Prevent shared memory issues
            "--start-maximized",
            `--disable-extensions-except=${extensionPath}`,    
            `--load-extension=${extensionPath}`    
        ]
    });

    const page = await browser.newPage();
    await page.goto("https://app.nodepay.ai/dashboard", { waitUntil: "load" });

    console.log("Browser started with noKms34km profile. Waiting 10 seconds for login verification...");
    await page.waitForTimeout(10000); // Wait 10 seconds

    if (page.url() === "https://app.nodepay.ai/dashboard") {
        console.log("Login successful: URL verified.");

        // Improved extension detection
        const extensionFiles = fs.readdirSync(extensionPath);
        if (extensionFiles.length === 0) {
            console.log("Extension folder is empty. The extension might not be installed correctly.");
        } else {
            console.log(`Extension files detected: ${extensionFiles.length}`);
        }

        const extensionStatus = await page.locator('span.text-grey-100.lg\\:mt-4.mt-3.mb-3.text-center').isVisible();
        console.log(extensionStatus ? "The extension is NOT running." : "Extension running successfully.");

        // Look for the claim button using XPath and click it
        try {
            const claimButton = await page.locator('xpath=/html/body/div[1]/div[3]/div/main/div/div[2]/div[5]/div[1]/div/div[2]/div[1]/div[2]/div/div[2]');
            
            if (await claimButton.isVisible()) {
                console.log("Claim button found using XPath. Clicking...");
                await claimButton.click();
                console.log("Claim button clicked successfully.");
            } else {
                console.log("Claim button not found using XPath.");
            }
        } catch (error) {
            console.error("Error finding or clicking the claim button:", error);
        }

        // Set a timeout to stop the script after 5 hours 30 minutes (19,800,000 ms)
        const runtimeLimit = 5 * 60 * 60 * 1000 + 30 * 60 * 1000; // 5h 30m in ms
        const stopTime = Date.now() + runtimeLimit;

        console.log("Script will stop after 5 hours 30 minutes...");

        // Refresh every 15 minutes (900,000 ms) using setInterval
        const refreshInterval = setInterval(async () => {
            if (Date.now() >= stopTime) {
                console.log("Runtime limit reached. Exiting...");
                clearInterval(refreshInterval); // Stop refreshing
                await browser.close();
                process.exit(0); // Exit successfully
            }

            await page.reload({ waitUntil: "load" });
            console.log("Page refreshed at: " + new Date().toISOString());
        }, 900000); // 15 minutes = 900,000 ms

    } else {
        console.log("Login failed: Unexpected URL - " + page.url());
        await browser.close();
    }

})();
