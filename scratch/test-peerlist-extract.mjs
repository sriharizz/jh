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
  
  console.log('Navigating with commit / load...');
  try {
    await page.goto('https://peerlist.io/jobs?q=AI', { waitUntil: 'commit', timeout: 25000 });
  } catch (e) {
    console.log('Commit note:', e.message);
  }

  console.log('Waiting 7s for Cloudflare to clear...');
  await new Promise(r => setTimeout(r, 7000));
  
  console.log('Title:', await page.title());
  console.log('URL:', page.url());

  const cards = await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/careers/"], a[href*="/jobs/"]'));
    return anchors.map(a => {
      const text = a.innerText.trim();
      const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
      return {
        url: a.href,
        title: lines[0] || '',
        company: lines[1] || '',
        fullText: text.replace(/\n+/g, ' | ')
      };
    }).filter(a => !a.url.endsWith('/jobs') && !a.url.endsWith('/jobs/'));
  });

  console.log(`Successfully extracted ${cards.length} jobs from Peerlist!`);
  cards.slice(0, 8).forEach((c, idx) => {
    console.log(`[#${idx+1}] ${c.title} — ${c.url}`);
    console.log(`     ${c.fullText}`);
  });

  await context.close();
}

test().catch(console.error);
