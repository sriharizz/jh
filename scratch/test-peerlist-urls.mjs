import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const profileDir = resolve(ROOT_DIR, 'data/peerlist-profile');

async function test() {
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  const testUrl = 'https://peerlist.io/jobs?q=AI';
  console.log('Navigating to', testUrl);
  await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 6000));
  
  console.log('Title:', await page.title());
  console.log('Final URL:', page.url());

  const cards = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"], a[href*="/careers/"]'));
    return anchors.map(a => ({
      href: a.href,
      text: a.innerText.trim().replace(/\n+/g, ' | ')
    })).filter(a => !a.href.endsWith('/jobs') && !a.href.endsWith('/jobs/'));
  });

  console.log(`Found ${cards.length} cards:`);
  cards.slice(0, 10).forEach((c, idx) => console.log(`[${idx+1}] ${c.href} -> ${c.text}`));

  await context.close();
}

test().catch(console.error);
