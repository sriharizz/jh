import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const profileDir = resolve(ROOT_DIR, 'data/naukri-profile');

async function test() {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
    ],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  // Stealth: delete webdriver
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  console.log('Testing with real Chrome channel...');
  await page.goto('https://www.naukri.com', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));
  
  console.log('Home title:', await page.title());
  console.log('Home URL:', page.url());

  const searchUrl = 'https://www.naukri.com/ai-engineer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7';
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('Search Title:', await page.title());
  console.log('Search URL:', page.url());
  const count = await page.$$eval('div.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple', els => els.length).catch(() => 0);
  console.log('Found jobs count:', count);

  await context.close();
}

test().catch(console.error);
