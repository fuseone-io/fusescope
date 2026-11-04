const { chromium } = require('playwright');

const APP_URL = process.env.APP_URL ?? 'http://rum-sample:3000/';
const REACT_APP_URL = process.env.REACT_APP_URL ?? '';
// Caddy's self-signed certificate, which the RUM endpoint is behind.
const FUSESCOPE_TLS_INTERNAL = process.env.FUSESCOPE_TLS === 'internal';
const SESSIONS = Number(process.env.SESSIONS ?? 3);
const INTERVAL_MS = Number(process.env.INTERVAL_SECONDS ?? 300) * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function session(browser, i) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: FUSESCOPE_TLS_INTERNAL });
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

const pause = (page) => page.waitForTimeout(300 + Math.random() * 500);

// Client-side navigation only: every click goes through React Router's <Link>.
async function reactSession(browser, i) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ignoreHTTPSErrors: FUSESCOPE_TLS_INTERNAL });
  const page = await ctx.newPage();
  let rejected = 0;
  page.on('response', (r) => {
    if (r.url().includes('/rum/v1/') && r.status() >= 400) rejected++;
  });
  await page.goto(REACT_APP_URL, { waitUntil: 'load' });
  await page.waitForSelector('nav');
  await page.waitForTimeout(800);
  await page.click(`a[data-product="${1 + (i % 3)}"]`);
  await pause(page);
  if (i % 3 === 0) {
    await page.click('#coupon');
    await page.waitForSelector('#reset');
    await pause(page);
    await page.click('#reset');
    await page.waitForSelector('#coupon');
  }
  await page.click('nav >> text=Cart');
  await pause(page);
  if (Math.random() < 0.6) {
    await page.click('#order');
    await page.waitForTimeout(700);
  }
  await page.click('nav >> text=Account');
  await pause(page);
  await page.click(`text=Order ${1001 + (i % 2)}`);
  await pause(page);
  if (i % 2 === 1) {
    await page.click('nav >> text=Promotions');
    await pause(page);
  }
  await page.click('nav >> text=Home');
  await page.waitForTimeout(300);
  await page.goto('about:blank');
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
      if (REACT_APP_URL) {
        rejected = 0;
        for (let i = 0; i < SESSIONS; i++) rejected += await reactSession(browser, round * SESSIONS + i);
        console.log(new Date().toISOString(), 'react sessions', SESSIONS, 'rejected', rejected);
      }
    } catch (err) {
      console.error(new Date().toISOString(), err.message);
    } finally {
      await browser.close();
    }
    await sleep(INTERVAL_MS);
  }
})();
