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
        headless: false,    
        firefoxUserPrefs: {    
            'dom.webdriver.enabled': false,    
            'privacy.resistFingerprinting': false,    
            'general.appversion.override': '5.0 (X11)',    
            'general.platform.override': 'Linux x86_64',    
            'intl.accept_languages': 'en-US,en',    
            'media.peerconnection.enabled': false,    
            'webgl.disabled': true,    
            'browser.sessionstore.resume_from_crash': false    
        }    
    });    
    
    const context = await browser.newContext({    
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0'    
    });    
    const page = await context.newPage();    
    
    await page.addInitScript(() => {    
        Object.defineProperty(navigator, 'webdriver', {    
            get: () => false,    
        });    
    });    
    
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
        await page.waitForTimeout(300);    
    
        if (page.url().includes('/c/')) {    
            console.log('Login successful.');    
            await page.waitForTimeout(5000);    
            await page.goto('https://www.neobux.com/c/po/', { waitUntil: 'networkidle', timeout: 60000 });    
            console.log('Navigated to https://www.neobux.com/c/po/');    

            await page.waitForTimeout(5000);    
            const paymentButton = await page.$('#t_pgt1');    
            if (paymentButton) {    
                await paymentButton.click();    
                console.log('Clicked on "your payment" button.');    

                // Wait for 5 seconds after clicking the "your payment" button
                await page.waitForTimeout(5000);

                // Click the Litecoin button
                const litecoinButton = await page.$('#crpt-bttn-ltc');    
                if (litecoinButton) {    
                    await litecoinButton.click();    
                    console.log('Clicked on "Litecoin" button.');    

                    // Wait for 5 seconds after clicking the "Litecoin" button
                    await page.waitForTimeout(5000);

                    // Click the "withdrawal" button
                    const withdrawalButton = await page.$('#crpt-yes');
                    if (withdrawalButton) {
                        await withdrawalButton.click();
                        console.log('Clicked on "withdrawal" button.');
                    } else {
                        console.log('"withdrawal" button not found.');
                    }

                } else {    
                    console.log('"Litecoin" button not found.');    
                }    
            } else {    
                console.log('"your payment" button not found.');    
            }    
        } else {    
            console.log('Login may have failed. Please check session cookies or login flow.');    
        }    
    } catch (error) {    
        console.error('Failed to open NeoBux Dashboard:', error.message);    
    } finally {    
        console.log('Browser will remain open for manual inspection.');    
        // Don't close the browser automatically    
    }    
})();
