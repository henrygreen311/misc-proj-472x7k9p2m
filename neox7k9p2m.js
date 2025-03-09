const { firefox } = require('playwright');
const fs = require('fs');

// Main script function
const runScript = async () => {
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

                console.log('Waiting for page to load after clicking "Knife Smash"...');
                await gamePage.waitForLoadState('domcontentloaded', { timeout: 30000 });

                let playNowAttempts = 0;
                const maxPlayNowAttempts = 3;

                while (playNowAttempts < maxPlayNowAttempts) {
                    try {
                        console.log('Waiting for "PLAY NOW" button...');
                        await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-now"]', { timeout: 30000, state: 'visible' });
                        console.log('"PLAY NOW" button found! Clicking...');
                        await gamePage.click('ark-div[ark-test-id="ark-play-now"]');
                        break;
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
                            console.error('Max attempts reached for "PLAY NOW" button. Aborting...');
                            await browser.close();
                            process.exit(1);
                        }
                    }
                }

                let shouldStop = false; // Flag to stop clicking when game ends

                // Function to play the game sequence
                const playGameSequence = async () => {
                    try {
                        console.log('Starting game sequence...');
                        console.log('Waiting for Ad button...');
                        await gamePage.waitForTimeout(3000);
                        await gamePage.waitForSelector('button.ark-ad-button[data-type="play-button"]', { timeout: 30000, state: 'visible' });
                        console.log('Ad button found! Clicking...');
                        await gamePage.click('button.ark-ad-button[data-type="play-button"]');
                        await gamePage.waitForTimeout(5000);

                        console.log('Waiting for game to fully load (ark-play-widget-container)...');
                        await gamePage.waitForSelector('ark-div.ark-play-widget-container', { timeout: 120000, state: 'visible' });

                        console.log('Game loaded successfully. Waiting an additional 3 minutes...');
                        await gamePage.waitForTimeout(180000);

                        console.log('Locating game iframe...');
                        let attempts = 0;
                        const maxAttempts = 3;
                        let canvasFound = false;
                        let frame;

                        while (attempts < maxAttempts && !canvasFound && !shouldStop) {
                            try {
                                const mainIframeElement = await gamePage.waitForSelector('iframe[ark-test-id="ark-game-iframe"]', { timeout: 30000, state: 'visible' });
                                const mainIframe = await mainIframeElement.contentFrame();

                                if (mainIframe) {
                                    console.log('Switched to game iframe! Searching for nested iframes...');
                                    const nestedFrames = mainIframe.childFrames();

                                    for (const f of nestedFrames) {
                                        frame = f;
                                        const canvas = await frame.waitForSelector('canvas[width="640"][height="480"]', { timeout: 30000, state: 'visible' });
                                        if (canvas) {
                                            canvasFound = true;
                                            console.log('Game canvas found! Clicking different positions...');
                                            for (let i = 1; i <= 10 && !shouldStop; i++) {
                                                for (let y = 400; y <= 410 && !shouldStop; y += 10) {
                                                    console.log(`Clicking sequence #${i}/10 at (320, ${y})...`);
                                                    let clickAttempts = 0;
                                                    const maxClickAttempts = 3;
                                                    while (clickAttempts < maxClickAttempts && !shouldStop) {
                                                        try {
                                                            await frame.click('canvas[width="640"][height="480"]', { position: { x: 320, y: y }, timeout: 30000 });
                                                            break;
                                                        } catch (error) {
                                                            clickAttempts++;
                                                            console.log(`Click attempt ${clickAttempts}/${maxClickAttempts} failed: ${error.message}`);
                                                            if (clickAttempts < maxClickAttempts) {
                                                                await gamePage.waitForTimeout(5000);
                                                            } else {
                                                                throw new Error('Max click attempts reached');
                                                            }
                                                        }
                                                    }
                                                    if (!shouldStop) {
                                                        await gamePage.waitForTimeout(10000);
                                                    }
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
                                if (attempts < maxAttempts && !shouldStop) {
                                    console.log('Waiting 5 seconds before retrying...');
                                    await gamePage.waitForTimeout(5000);
                                }
                            }
                        }

                        if (!canvasFound && !shouldStop) {
                            console.error('Failed to find stable canvas after max attempts.');
                            throw new Error('Canvas not found');
                        }
                        console.log('Game sequence completed successfully');
                    } catch (error) {
                        if (!shouldStop) {
                            console.error('Error in game sequence:', error.message);
                            throw error;
                        }
                    }
                };

                // Inactivity popup handler (silent)
                const handleInactivityPopup = async () => {
                    while (!shouldStop) {
                        try {
                            const popup = await gamePage.$('#ARK_popup_gamePaused');
                            if (popup) {
                                await gamePage.mouse.click(50, 50, { timeout: 10000 });
                            }
                        } catch (error) {
                            // Silently ignore errors
                        }
                        await gamePage.waitForTimeout(5000);
                    }
                };

                // End game handler with game end container check
                const handleEndGame = async () => {
                    try {
                        console.log('Waiting for game end container to be visible...');
                        await gamePage.waitForSelector('ark-div.ark-game-end.background-blue', { timeout: 300000, state: 'visible' });
                        console.log('Game end container visible! Waiting for "Play Again" button...');
                        const playAgainButton = await gamePage.waitForSelector('ark-div[ark-test-id="ark-play-again-button"]', { timeout: 30000 });
                        console.log('"Play Again" button found! Clicking...');
                        await playAgainButton.click({ timeout: 10000 });
                        console.log('"Play Again" clicked. Stopping script...');
                        shouldStop = true;
                    } catch (error) {
                        console.error('Error in end game handling:', error.message);
                        throw error;
                    }
                };

                // Run the game sequence and handlers concurrently
                await Promise.all([
                    playGameSequence(),
                    handleInactivityPopup(),
                    handleEndGame()
                ]).then(async () => {
                    console.log('All tasks completed or stopped. Closing browser...');
                    await browser.close();
                    process.exit(0); // Exit successfully
                }).catch(async error => {
                    console.error('Main promise error:', error.message);
                    await browser.close();
                    process.exit(1); // Exit on error
                });
            }
        }
    } catch (error) {
        console.error('Navigation error:', error.message);
        await browser.close();
        process.exit(1);
    }
};

// Run the script once
(async () => {
    console.log('Starting script...');
    await runScript().catch(error => {
        console.error('Script failed:', error.message);
        process.exit(1);
    });
})();
