const { firefox } = require('playwright');
const fs = require('fs');

(async () => {
    const sessionFile = 'neobux-session_02.json';

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
        await page.goto('https://www.neobux.com/c/', { waitUntil: 'domcontentloaded', timeout: 120000 });

        if (page.url().includes('/c/')) {
            console.log('Login successful. Navigating to the game page...');
            await page.goto('https://www.neobux.com/m/ag/', { waitUntil: 'domcontentloaded', timeout: 120000 });

            console.log('Checking for the game start button...');
            const gameButton = await page.waitForSelector('table#pntb', { timeout: 30000, state: 'visible' });

            if (gameButton) {
                console.log('Game button found! Clicking...');
                await gameButton.click();

                console.log('Waiting for the new tab to open...');
                const [gamePage] = await Promise.all([
                    context.waitForEvent('page', { timeout: 30000 }),
                    page.waitForLoadState('domcontentloaded'),
                ]);

                console.log('New tab detected. Verifying the game page...');
                await gamePage.waitForSelector('span:text("All Games")', { timeout: 30000, state: 'visible' });
                console.log('"All Games" button appeared! Clicking...');
                await gamePage.click('span:text("All Games")');

                console.log('Verifying the page loaded successfully...');
                await gamePage.waitForSelector('a.contact-us-btn', { timeout: 30000, state: 'visible' });

                console.log('Looking for "Knife Smash" game...');
                await gamePage.waitForSelector('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")', { timeout: 30000, state: 'visible' });
                console.log('"Knife Smash" found! Clicking...');
                await gamePage.click('ark-gname[ark-test-id="game-card-name"]:text("Knife Smash")');

                console.log('Waiting for "PLAY NOW" button...');
                await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-now"]', { timeout: 60000, state: 'visible' });
                console.log('"PLAY NOW" button found! Clicking...');
                await gamePage.click('ark-div[ark-test-id="ark-play-now"]');

                let shouldRestart = false; // Flag to control game sequence restart
                let sequenceCount = 0; // Counter for completed sequences
                const maxSequences = 13; // Limit to 12 runs

                // Function to play the game sequence
                const playGameSequence = async () => {
                    while (sequenceCount < maxSequences) {
                        if (shouldRestart) {
                            console.log('Restart flag detected, stopping current sequence...');
                            shouldRestart = false;
                            continue;
                        }

                        try {
                            console.log(`Starting sequence ${sequenceCount + 1}/${maxSequences}...`);
                            console.log('Waiting for Ad button...');
                            await gamePage.waitForTimeout(3000);
                            await gamePage.waitForSelector('button.ark-ad-button[data-type="play-button"]', { timeout: 30000, state: 'visible' });
                            console.log('Ad button found! Clicking...');
                            await gamePage.click('button.ark-ad-button[data-type="play-button"]');
                            await gamePage.waitForTimeout(5000); // Wait for stability

                            console.log('Waiting for game to fully load (ark-play-widget-container)...');
                            await gamePage.waitForSelector('ark-div.ark-play-widget-container', { timeout: 120000, state: 'visible' });

                            console.log('Game loaded successfully. Waiting an additional 3 minute...');
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
                                                for (let i = 1; i <= 15 && !shouldRestart; i++) {
                                                    for (let y = 400; y <= 410 && !shouldRestart; y += 10) {
                                                        console.log(`Clicking sequence #${i}/15 at (320, ${y})...`);
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
                                sequenceCount++; // Increment only on successful completion
                                console.log(`Sequence ${sequenceCount}/${maxSequences} completed successfully`);
                            }
                        } catch (error) {
                            console.log('Error in game sequence:', error.message);
                            await gamePage.waitForTimeout(5000);
                        }
                    }
                    console.log(`Completed all ${maxSequences} sequences!`);
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
                                console.log('Inactivity popup detected! Clicking outside to close...');
                                await gamePage.mouse.click(50, 50);
                                console.log('Popup closed.');
                            }
                        } catch (error) {
                            console.log('Error checking inactivity popup:', error.message);
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
                                console.log('End game detected! Waiting 3s before clicking "Play Again"...');
                                await gamePage.waitForTimeout(3000);
                                const playAgainButton = await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-again-button"]', { timeout: 30000, state: 'visible' });
                                if (playAgainButton) {
                                    console.log('"Play Again" button found! Clicking...');
                                    await playAgainButton.click({ timeout: 10000 }); // Reduced timeout for click
                                    console.log('"Play Again" clicked. Checking for ad button...');
                                    shouldRestart = true; // Restart flag

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
                            console.log('Error checking end game:', error.message);
                            if (error.message.includes('Timeout')) {
                                console.log('Timeout occurred, retrying in 5 seconds...');
                                await gamePage.waitForTimeout(5000);
                            }
                        }
                        await gamePage.waitForTimeout(5000);
                    }
                };

                // Start all handlers in parallel
                await Promise.all([
                    playGameLoop(),
                    handleInactivityPopup(),
                    handleEndGame()
                ]).catch(error => console.log('Main promise error:', error))
                .finally(async () => {
                    console.log('Script completed or errored, closing browser...');
                    await browser.close();
                });
            }
        }
    } catch (error) {
        console.error('Navigation error:', error.message);
        await browser.close();
        process.exit(1);
    }
})();
