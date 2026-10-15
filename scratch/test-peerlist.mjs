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
  
  await page.goto('https://peerlist.io/jobs', { waitUntil: 'domcontentloaded', timeout: 25000 });
  await new Promise(r => setTimeout(r, 8000));
  
  const title = await page.title();
  console.log('Title after 8s:', title);
  
  const text = await page.evaluate(() => document.body.innerText);
  console.log('Text preview:\n', text.slice(0, 400));
  
  await context.close();
}

test().catch(console.error);
