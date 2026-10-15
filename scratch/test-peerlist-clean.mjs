import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');
const profileDir = resolve(ROOT_DIR, 'data/peerlist-user-data');

async function test() {
  console.log('Testing with clean user-data dir...');
  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless: false,
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'],
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  await page.goto('https://peerlist.io/jobs?q=AI', { waitUntil: 'domcontentloaded', timeout: 35000 });
  console.log('Waiting for Cloudflare...');
  await new Promise(r => setTimeout(r, 6000));
  
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  const count = await page.$$eval('a[href*="/careers/"], a[href*="/jobs/"]', els => els.length).catch(() => 0);
  console.log('Cards count:', count);

  await context.close();
}

test().catch(console.error);
