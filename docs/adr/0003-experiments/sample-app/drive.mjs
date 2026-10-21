// Drives sessions through the sample app and prints what each tab saw.
import { chromium } from 'playwright';

const APP = process.env.APP ?? 'http://localhost:3350';
const browser = await chromium.launch();
const result = {};

async function hide(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

const waitOut = (page, text) => page.waitForFunction((t) => document.getElementById('out').textContent.includes(t), text);

async function sessionId(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('fusescope.session')));
}

// Session 1: sampled, two tabs.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const otlp = [];
  page.on('request', (r) => r.url().includes(':14318/') && otlp.push(`${r.method()} ${r.url()}`));
  page.on('response', (r) => r.url().includes(':14318/') && otlp.push(`${r.status()} ${r.url()}`));
  await page.goto(`${APP}/`);
  await page.waitForLoadState('networkidle');
  await page.click('text=Order 123');
  await page.click('#dispatch');
  await waitOut(page, '"fetch":200');
  await page.click('#dispatch-xhr');
  await waitOut(page, '"xhr":200');
  await page.click('#cors');
  await waitOut(page, '/deny');
  await page.click('text=Customer 392');
  await page.click('#throw');
  await page.click('#reject');
  await page.waitForTimeout(500);
  const tab2 = await ctx.newPage();
  await tab2.goto(`${APP}/orders/456`);
  await tab2.waitForLoadState('networkidle');
  result.sampled = {
    tab1: await sessionId(page),
    tab2: await sessionId(tab2),
    cors: await page.locator('#out').textContent(),
  };
  await hide(page);
  await hide(tab2);
  await page.waitForTimeout(4_000);
  result.sampled.otlp = [...new Set(otlp)];
  await ctx.close();
}

// Session 2: rate 0, so nothing is exported and no traceparent is sent.
{
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const sent = [];
  page.on('request', (r) => r.url().includes('/api/') && sent.push(r.headers().traceparent ?? null));
  await page.goto(`${APP}/?rate=0`);
  await page.click('#dispatch');
  await waitOut(page, '"fetch":200');
  await hide(page);
  await page.waitForTimeout(3_000);
  result.unsampled = { session: await sessionId(page), traceparentSent: sent };
  await ctx.close();
}

await browser.close();
console.log(JSON.stringify(result, null, 2));
