const { firefox } = require('playwright');
const fs = require('fs');

// Main script function to allow restarting
const runScript = async () => {
    let adButtonTimeoutCount = 0;
    const maxAdButtonTimeouts = 3;

    const sessionFile = 'x7k9p23.json';

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
        await page.goto('https://www.neobux.com/c/', { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForTimeout(300); // Small delay to mimic human behavior

        if (page.url().includes('/c/')) {
            console.log('Login successful. Navigating to the game page...');
            await page.goto('https://www.neobux.com/m/ag/', { waitUntil: 'domcontentloaded', timeout: 120000 });
            await page.waitForTimeout(400); // Small delay

            console.log('Checking for the game start button...');
            const gameButton = await page.waitForSelector('table#pntb', { timeout: 30000, state: 'visible' });

            if (gameButton) {
                console.log('Game button found! Clicking and waiting for new tab...');
                const newPagePromise = context.waitForEvent('page', { timeout: 60000 });
                await gameButton.click();
                const gamePage = await newPagePromise;

                //console.log(`New tab opened: ${gamePage.url()}`);
                await gamePage.waitForLoadState('domcontentloaded', { timeout: 60000 });

                // Spoof navigator.webdriver in the new tab as well
                await gamePage.addInitScript(() => {
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => false,
                    });
                });

                console.log('New tab detected. Verifying the game page...');
                await gamePage.waitForSelector('span:text("All Games")', { timeout: 30000, state: 'visible' });
                console.log('"All Games" button appeared! Clicking...');
                await gamePage.click('span:text("All Games")');
                await gamePage.waitForTimeout(300); // Delay after click

                console.log('Verifying the page loaded successfully...');
                await gamePage.waitForSelector('a.contact-us-btn', { timeout: 30000, state: 'visible' });

                console.log('Looking for "Knife Smash" game...');
                await gamePage.waitForSelector('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")', { timeout: 30000, state: 'visible' });
                console.log('"Knife Smash" found! Clicking...');
                await gamePage.click('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")');
                await gamePage.waitForTimeout(400); // Delay after click

                console.log('Waiting for page to load after clicking "Knife Smash"...');
                await gamePage.waitForLoadState('domcontentloaded', { timeout: 30000 });

                // Retry logic for "PLAY NOW" button with shorter timeout
                let playNowButtonFound = false;
                let playNowAttempts = 0;
                const maxPlayNowAttempts = 3;

                while (!playNowButtonFound && playNowAttempts < maxPlayNowAttempts) {
                    try {
                        console.log('Waiting for "PLAY NOW" button...');
                        await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-now"]', { timeout: 30000, state: 'visible' });
                        console.log('"PLAY NOW" button found! Clicking...');
                        await gamePage.click('ark-div[ark-test-id="ark-play-now"]');
                        await gamePage.waitForTimeout(500); // Delay after click
                        playNowButtonFound = true;
                    } catch (error) {
                        playNowAttempts++;
                        console.log(`Attempt ${playNowAttempts}/${maxPlayNowAttempts} failed to find "PLAY NOW" button: ${error.message}`);
                        if (playNowAttempts < maxPlayNowAttempts) {
                            console.log('Retrying in 5 seconds...');
                            await gamePage.waitForTimeout(5000);
                            console.log('Reloading game page to recover...');
                            await gamePage.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                            await gamePage.waitForSelector('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")', { timeout: 30000, state: 'visible' });
                            await gamePage.click('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")');
                            await gamePage.waitForLoadState('domcontentloaded', { timeout: 30000 });
                        } else {
                            console.error('Max attempts reached for "PLAY NOW" button. Aborting this session...');
                            await browser.close();
                            return false; // Signal failure to trigger restart
                        }
                    }
                }

                if (!playNowButtonFound) {
                    console.error('Failed to proceed after retries. Restarting script...');
                    await browser.close();
                    return false;
                }

                let shouldRestart = false;
                let sequenceCount = 0;
                const maxSequences = 1;

                // Function to play the game sequence with retry logic
                const playGameSequence = async () => {
                    let sequenceAttempts = 0;
                    const maxSequenceAttempts = 3;

                    while (sequenceCount < maxSequences && sequenceAttempts < maxSequenceAttempts) {
                        if (shouldRestart) {
                            console.log('Restart flag detected, stopping current sequence...');
                            shouldRestart = false;
                            continue;
                        }

                        try {
                            console.log(`Starting sequence ${sequenceCount + 1}/${maxSequences} (Attempt ${sequenceAttempts + 1}/${maxSequenceAttempts})...`);
                            console.log('Waiting for Ad button...');
                            await gamePage.waitForTimeout(3000);
                            await gamePage.waitForSelector('button.ark-ad-button[data-type="play-button"]', { timeout: 30000, state: 'visible' });
                            console.log('Ad button found! Clicking...');
                            await gamePage.click('button.ark-ad-button[data-type="play-button"]');
                            await gamePage.waitForTimeout(5000); // Wait for stability

                            console.log('Waiting for game to fully load (ark-play-widget-container)...');
                            await gamePage.waitForSelector('ark-div.ark-play-widget-container', { timeout: 120000, state: 'visible' });

                            console.log('Game loaded successfully. Waiting an additional 3 minutes...');
                            await gamePage.waitForTimeout(180000);

                            let attempts = 0;
                            const maxAttempts = 3;
                            let canvasFound = false;
                            let frame;

                            while (attempts < maxAttempts && !canvasFound && !shouldRestart) {
                                try {
                                    console.log('Locating game iframe...');
                                    const mainIframeElement = await gamePage.waitForSelector('iframe[ark-test-id="ark-game-iframe"]', { timeout: 30000, state: 'visible' });
                                    const mainIframe = await mainIframeElement.contentFrame();

                                    if (mainIframe) {
                                        console.log('Switched to game iframe! Searching for nested iframes...');
                                        const nestedFrames = mainIframe.childFrames();

                                        for (const f of nestedFrames) {
                                            frame = f;
                                            const canvas = await frame.$('canvas[width="640"][height="480"]');
                                            if (canvas) {
                                                canvasFound = true;
                                                console.log('Game canvas found! Clicking different positions...');
                                                for (let i = 1; i <= 10 && !shouldRestart; i++) {
                                                    for (let y = 400; y <= 410 && !shouldRestart; y += 10) {
                                                        console.log(`Clicking sequence #${i}/10 at (320, ${y})...`);
                                                        await frame.click('canvas', { position: { x: 320, y: y } });
                                                        await gamePage.waitForTimeout(10000);
                                                    }
                                                }
                                                break;
                                            }
                                        }
                                    }
                                    if (!canvasFound) throw new Error('Canvas not found');
                                } catch (error) {
                                    attempts++;
                                    console.log(`Attempt ${attempts}/${maxAttempts} failed: ${error.message}`);
                                    if (attempts < maxAttempts) {
                                        console.log('Waiting 5 seconds before retrying...');
                                        await gamePage.waitForTimeout(5000);
                                    }
                                }
                            }

                            if (!canvasFound) {
                                console.log('Failed to find stable canvas after max attempts, waiting before retry...');
                                await gamePage.waitForTimeout(10000);
                            } else {
                                sequenceCount++;
                                console.log(`Sequence ${sequenceCount}/${maxSequences} completed successfully`);
                            }
                        } catch (error) {
                            sequenceAttempts++;
                            console.log(`Sequence attempt ${sequenceAttempts}/${maxSequenceAttempts} failed: ${error.message}`);
                            if (error.message.includes('Timeout 30000ms exceeded') && error.message.includes('button.ark-ad-button[data-type="play-button"]')) {
                                adButtonTimeoutCount++;
                                console.log(`Ad button timeout occurred (${adButtonTimeoutCount}/${maxAdButtonTimeouts})`);
                                if (adButtonTimeoutCount >= maxAdButtonTimeouts) {
                                    console.log('Max ad button timeouts reached. Restarting script from beginning...');
                                    await browser.close();
                                    return false; // Signal to restart
                                }
                            }
                            if (sequenceAttempts < maxSequenceAttempts) {
                                console.log('Retrying sequence in 5 seconds...');
                                await gamePage.waitForTimeout(5000);
                                console.log('Reloading game page to recover...');
                                await gamePage.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
                                await gamePage.waitForSelector('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")', { timeout: 30000, state: 'visible' });
                                await gamePage.click('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")');
                                await gamePage.waitForLoadState('domcontentloaded', { timeout: 30000 });
                                await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-now"]', { timeout: 30000, state: 'visible' });
                                await gamePage.click('ark-div[ark-test-id="ark-play-now"]');
                            } else {
                                console.error('Max sequence attempts reached. Aborting this session...');
                                await browser.close();
                                return false; // Signal failure to trigger restart
                            }
                        }
                    }
                    if (sequenceCount >= maxSequences) {
                        console.log(`Completed all ${maxSequences} sequences!`);
                        return true; // Signal successful completion
                    }
                    return false; // Signal failure if max attempts reached without success
                };

                // Main game loop
                const playGameLoop = async () => {
                    await playGameSequence();
                    console.log('Game loop finished');
                };

                // Inactivity popup handler
                const handleInactivityPopup = async () => {
                    while (sequenceCount < maxSequences) {
                        try {
                            const popup = await gamePage.$('#ARK_popup_gamePaused');
                            if (popup) {
                                await gamePage.mouse.click(50, 50);
                            }
                        } catch (error) {
                            // Silently handle errors
                        }
                        await gamePage.waitForTimeout(5000);
                    }
                };

                // End game handler
                const handleEndGame = async () => {
                    while (sequenceCount < maxSequences) {
                        try {
                            const endGameElement = await gamePage.$('ark-div.ark-game-end');
                            if (endGameElement) {
                                await gamePage.waitForTimeout(3000);
                                const playAgainButton = await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-again-button"]', { timeout: 30000, state: 'visible' });
                                if (playAgainButton) {
                                    console.log('"Play Again" button found! Clicking...');
                                    await playAgainButton.click({ timeout: 10000 });
                                    console.log('"Play Again" clicked. Checking for ad button...');
                                    shouldRestart = true;

                                    await gamePage.waitForTimeout(3000);
                                    const adButton = await gamePage.waitForSelector('button.ark-ad-button[data-type="play-button"]', { timeout: 10000, state: 'visible' })
                                        .catch(() => null);
                                    if (adButton) {
                                        console.log('Ad button found after Play Again! Sequence will restart from ad click...');
                                    } else {
                                        console.log('No ad button found, sequence will continue normally...');
                                        shouldRestart = false;
                                    }
                                }
                            }
                        } catch (error) {
                            if (error.message.includes('Timeout')) {
                                await gamePage.waitForTimeout(5000);
                            }
                        }
                        await gamePage.waitForTimeout(5000);
                    }
                };

                // Run the game loop and handlers
                const success = await Promise.all([
                    playGameLoop(),
                    handleInactivityPopup(),
                    handleEndGame()
                ]).then(() => true)
                .catch(error => {
                    console.log('Main promise error:', error.message);
                    return false;
                })
                .finally(async () => {
                    console.log('Script completed or errored, closing browser...');
                    await browser.close();
                });

                return success;
            }
        }
    } catch (error) {
        console.error('Navigation error:', error.message);
        await browser.close();
        return false; // Signal failure to trigger restart
    }
};

// Retry loop to restart the script if needed
(async () => {
    let restartCount = 0;
    const maxRestarts = 10; // Prevent infinite restarts

    while (restartCount < maxRestarts) {
        console.log(`Script attempt ${restartCount + 1}/${maxRestarts}`);
        const success = await runScript();
        if (success) {
            console.log('Script completed successfully.');
            break;
        }
        restartCount++;
        if (restartCount < maxRestarts) {
            console.log('Restarting script due to ad button timeout or "PLAY NOW" failures...');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Brief delay before restart
        } else {
            console.log('Max restart attempts reached. Exiting...');
            process.exit(1);
        }
    }
})();
