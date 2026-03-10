import { chromium } from 'playwright';

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();

    // Log all console messages
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.error('PAGE ERROR:', error));

    console.log('Navigating to http://localhost:5179/');
    await page.goto('http://localhost:5179/');

    console.log('Waiting for "Play Solo" button...');
    await page.waitForSelector('text=Play Solo');

    console.log('Clicking "Play Solo"...');
    await page.click('text=Play Solo');

    console.log('Clicked "Play Solo". Waiting 10 seconds for game to load...');
    await page.waitForTimeout(10000);

    console.log('Taking screenshot...');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.screenshot({ path: 'game-screenshot3.png' });

    console.log('Done! Screenshot saved as game-screenshot3.png');
    await browser.close();
})();
