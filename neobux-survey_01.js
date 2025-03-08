const { firefox } = require('playwright');
const fs = require('fs');

(async () => {
    const sessionFile = 'neobux-session_01.json';

    if (!fs.existsSync(sessionFile)) {
        console.error('Session file not found!');
        process.exit(1);
    }

    let sessionData;
    try {
        sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        if (!Array.isArray(sessionData)) {
            throw new Error('Invalid session format: Expected an array of cookies');
        }
    } catch (error) {
        console.error('Error reading session file:', error.message);
        process.exit(1);
    }

    // Remove the SameSite attribute from each cookie (if exists)
    sessionData = sessionData.map(cookie => {
        if (cookie.hasOwnProperty('sameSite')) {
            delete cookie.sameSite;
        }
        return cookie;
    });

    const browser = await firefox.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log('Loading session data...');
    try {
        await page.context().addCookies(sessionData);
    } catch (error) {
        console.error('Error setting cookies:', error.message);
        await browser.close();
        process.exit(1);
    }

    console.log('Opening NeoBux Dashboard...');
    try {
        await page.goto('https://www.neobux.com/c/', { waitUntil: 'networkidle', timeout: 60000 });

        if (page.url().includes('/c/')) {
            console.log('Login successful. Taking full-page screenshot...');
            await page.screenshot({ path: 'dashboard.png', fullPage: true });

            console.log('Waiting 5 seconds before moving to the content page...');
            await page.waitForTimeout(5000);

            console.log('Navigating to the content page...');
            await page.goto('https://www.neobux.com/m/v/', { waitUntil: 'networkidle', timeout: 60000 });

            console.log('Content page loaded. Taking screenshot...');
            await page.screenshot({ path: 'content.png', fullPage: true });

            console.log('Finding ad containers...');
            // Look for both types of ad containers and combine them
            const adContainers97 = await page.$$('div[style="height:97px;width:100%;cursor:pointer;"]');
            const adContainers42 = await page.$$('div[style="height:42px;width:100%;cursor:pointer;"]');
            const adContainers = [...adContainers97, ...adContainers42]; // Combine both arrays

            if (adContainers.length === 0) {
                console.log('No ads found. Exiting.');
                await browser.close();
                process.exit(0);
            }

            console.log(`Found ${adContainers.length} ads (97px: ${adContainers97.length}, 42px: ${adContainers42.length}). Clicking one by one...`);

            for (let i = 0; i < adContainers.length; i++) {
                console.log(`Clicking ad ${i + 1}/${adContainers.length}...`);
                await adContainers[i].click();

                // Wait for the ad link inside the clicked container
                console.log('Waiting for ad link...');
                try {
                    const adLinkElement = await adContainers[i].waitForSelector('a[id^="l"][href^="https://www.neobux.com/v/?a=l"]', { timeout: 10000 });

                    if (!adLinkElement) {
                        console.error(`Ad link not found for ad ${i + 1}`);
                        continue;
                    }

                    // Get the ad link URL
                    const adLink = await adLinkElement.getAttribute('href');
                    console.log(`Opening ad link in new tab: ${adLink}`);

                    // Open the ad link in a new tab
                    const adPage = await context.newPage();
                    await adPage.goto(adLink, { waitUntil: 'domcontentloaded', timeout: 90000 });

                    // Wait 15 seconds before closing the ad page
                    console.log('Waiting 15 seconds...');
                    await adPage.waitForTimeout(15000);
                    await adPage.close();

                    console.log(`Ad ${i + 1} completed.`);
                } catch (error) {
                    console.error(`Error processing ad ${i + 1}:`, error.message);
                }

                // Add a random delay of 3-6 seconds before the next ad click
                const delay = Math.floor(Math.random() * 3000) + 3000;
                console.log(`Waiting ${delay / 1000} seconds before clicking the next ad...`);
                await page.waitForTimeout(delay);
            }

            console.log('All ads clicked. Exiting.');
        } else {
            console.error('Login failed! Current URL:', page.url());
            await page.screenshot({ path: 'error.png' });
            process.exit(1);
        }
    } catch (error) {
        console.error('Navigation error:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
