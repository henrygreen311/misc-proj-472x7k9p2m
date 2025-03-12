const { firefox } = require('playwright');
const fs = require('fs');

(async () => {
    const sessionFile = 'x7k9p2m.json';

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

    sessionData = sessionData.map(cookie => {
        if (cookie.hasOwnProperty('sameSite')) {
            delete cookie.sameSite;
        }
        return cookie;
    });

    const browser = await firefox.launch({
        headless: true,
        firefoxUserPrefs: {
            'dom.webdriver.enabled': false,           // Prevents WebDriver flag detection
            'privacy.resistFingerprinting': false,    // Avoids Tor-like suspicious fingerprint
            'general.appversion.override': '5.0 (X11)',  // Spoofed app version consistent with Linux
            'general.platform.override': 'Linux x86_64', // Matches the Linux user agent
            'intl.accept_languages': 'en-US,en',      // Realistic language settings
            'media.peerconnection.enabled': false,    // Disables WebRTC to prevent IP leaks
            'webgl.disabled': true,                   // Prevents WebGL fingerprinting
            'browser.sessionstore.resume_from_crash': false  // Avoids session restore hints
        }
    });

    const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'
    });
    const page = await context.newPage();

    // Spoof navigator.webdriver to return false
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false,
        });
    });

    // Optional: Block bot-detection scripts (uncomment if needed)
    // await page.route('**/*', route => {
    //     const url = route.request().url();
    //     if (url.includes('detect-bot') || url.includes('fingerprint')) {
    //         return route.abort();
    //     }
    //     route.continue();
    // });

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
        await page.waitForTimeout(300); // Small delay to mimic human behavior

        if (page.url().includes('/c/')) {
            console.log('Login successful.');

            console.log('Waiting 5 seconds before moving to the content page...');
            await page.waitForTimeout(5000);

            console.log('Navigating to the content page...');
            await page.goto('https://www.neobux.com/m/v/', { waitUntil: 'networkidle', timeout: 60000 });
            await page.waitForTimeout(400); // Small delay

            console.log('Content page loaded.');

            console.log('Finding ad containers...');
            const adContainers97 = await page.$$('div[style="height:97px;width:100%;cursor:pointer;"]');
            const adContainers42 = await page.$$('div[style="height:42px;width:100%;cursor:pointer;"]');
            const adContainers = [...adContainers97, ...adContainers42];

            if (adContainers.length === 0) {
                console.log('No ads found in first phase.');
            } else {
                console.log(`Found ${adContainers.length} ads (97px: ${adContainers97.length}, 42px: ${adContainers42.length}). Clicking one by one...`);

                for (let i = 0; i < adContainers.length; i++) {
                    console.log(`Clicking ad ${i + 1}/${adContainers.length}...`);
                    await adContainers[i].click();
                    await page.waitForTimeout(500); // Delay after click

                    console.log('Waiting for ad link...');
                    try {
                        const adLinkElement = await adContainers[i].waitForSelector('a[id^="l"][href^="https://www.neobux.com/v/?a=l"]', { timeout: 10000 });

                        if (!adLinkElement) {
                            console.error(`Ad link not found for ad ${i + 1}`);
                            continue;
                        }

                        const adLink = await adLinkElement.getAttribute('href');
                        console.log(`Opening ad link in new tab: ${adLink}`);

                        const adPage = await context.newPage();
                        // Spoof navigator.webdriver in the new tab as well
                        await adPage.addInitScript(() => {
                            Object.defineProperty(navigator, 'webdriver', {
                                get: () => false,
                            });
                        });
                        await adPage.goto(adLink, { waitUntil: 'domcontentloaded', timeout: 90000 });

                        console.log('Waiting 15 seconds...');
                        await adPage.waitForTimeout(15000);
                        await adPage.close();

                        console.log(`Ad ${i + 1} completed.`);
                    } catch (error) {
                        console.error(`Error processing ad ${i + 1}:`, error.message);
                    }

                    const delay = Math.floor(Math.random() * 3000) + 3000;
                    console.log(`Waiting ${delay / 1000} seconds before clicking the next ad...`);
                    await page.waitForTimeout(delay);
                }
                console.log('All initial ads clicked.');
            }

            // New logic to handle the ap_ctr container with redirect
            console.log('Looking for ap_ctr container...');
            let apCtrContainer = await page.$('div.mbx#ap_ctr');
            if (!apCtrContainer) {
                console.log('ap_ctr container not found. Exiting.');
            } else {
                console.log('ap_ctr container found. Looking for initial ap_h link...');
                const initialApLinkElement = await apCtrContainer.$('a#ap_h[href^="https://www.neobux.com/v/?xc="]');
                
                if (!initialApLinkElement) {
                    console.log('ap_h link not found inside ap_ctr. Exiting.');
                } else {
                    const apLinkText = await initialApLinkElement.innerText();
                    const clickCount = parseInt(apLinkText, 10);
                    if (isNaN(clickCount) || clickCount <= 0) {
                        console.log('Invalid or non-positive click count. Exiting.');
                    } else {
                        console.log(`Initial ap_h value: "${apLinkText}". Will click ${clickCount} times, handling redirects...`);

                        let successfulClicks = 0;
                        for (let i = 0; i < clickCount; i++) {
                            // Re-find the ap_h element each iteration
                            const apLinkElement = await apCtrContainer.$('a#ap_h[href^="https://www.neobux.com/v/?xc="]');
                            if (!apLinkElement) {
                                console.log(`ap_h link not found on iteration ${i + 1}. Stopping.`);
                                break;
                            }

                            const currentApLinkText = await apLinkElement.innerText();
                            const apLinkHref = await apLinkElement.getAttribute('href');
                            console.log(`Click ${i + 1}/${clickCount}: Value: "${currentApLinkText}", Clicking link with href: ${apLinkHref}...`);

                            // Click the link, which redirects the current page
                            await apLinkElement.click();
                            await page.waitForTimeout(500); // Delay after click

                            console.log(`Redirected to: ${page.url()}. Waiting 15 seconds...`);
                            await page.waitForTimeout(15000);

                            // Check if we need to navigate back or if we're already on the content page
                            if (!page.url().includes('/m/v/')) {
                                console.log('Navigating back to content page...');
                                await page.goto('https://www.neobux.com/m/v/', { waitUntil: 'domcontentloaded', timeout: 60000 });
                                await page.waitForTimeout(400); // Delay after navigation
                            } else {
                                console.log('Already on content page, checking ap_ctr...');
                            }

                            // Immediately check for the ap_ctr container after DOM content loads
                            apCtrContainer = await page.$('div.mbx#ap_ctr');
                            if (!apCtrContainer) {
                                console.log(`ap_ctr container not found after redirect on iteration ${i + 1}. Stopping.`);
                                break;
                            }

                            successfulClicks++;
                            console.log(`Click ${i + 1}/${clickCount} completed.`);

                            const delay = Math.floor(Math.random() * 3000) + 3000;
                            console.log(`Waiting ${delay / 1000} seconds before next click...`);
                            await page.waitForTimeout(delay);
                        }
                        console.log(`Completed ${successfulClicks} clicks on ap_h link.`);
                    }
                }
            }

            console.log('All tasks completed. Exiting.');
        } else {
            console.error('Login failed! Current URL:', page.url());
            process.exit(1);
        }
    } catch (error) {
        console.error('Navigation error:', error.message);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
