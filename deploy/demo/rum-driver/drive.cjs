const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL ?? 'http://rum-sample:3000/';
const SESSIONS = Number(process.env.SESSIONS ?? 3);
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 300) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(browser, i) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  let rejected = 0;
  page.on('response', (r) => {
    if (r.url().includes('/rum/v1/') && r.status() >= 400) rejected++;
  });
  await page.goto(APP_URL, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  for (const label of ['Product', 'Search', 'Cart', 'Home']) {
    await page.click(`text=${label}`);
    await page.waitForTimeout(300 + Math.random() * 500);
    if (Math.random() < 0.6) {
      await page.click('#order');
      await page.waitForTimeout(700);
    }
  }
  if (i % 3 === 0) await page.click('#fail');
  if (i % 4 === 1) await page.click('#reject');
  await page.waitForTimeout(300);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.waitForTimeout(1500);
  await ctx.close();
  return rejected;
}

(async () => {
  for (let round = 0; ; round++) {
    let rejected = 0;
    const browser = await chromium.launch();
    try {
      for (let i = 0; i < SESSIONS; i++) rejected += await session(browser, round * SESSIONS + i);
      console.log(new Date().toISOString(), 'sessions', SESSIONS, 'rejected', rejected);
    } catch (err) {
      console.error(new Date().toISOString(), err.message);
    } finally {
      await browser.close();
    }
    await sleep(INTERVAL_MS);
  }
})();
