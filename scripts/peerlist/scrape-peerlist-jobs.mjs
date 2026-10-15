import { createPeerlistContext } from './peerlist-session.mjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

async function scrapePeerlist() {
  console.log('Connecting to Peerlist browser session...');
  const ctx = await createPeerlistContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  try {
    console.log('Navigating to https://peerlist.io/jobs ...');
    await page.goto('https://peerlist.io/jobs', { waitUntil: 'domcontentloaded', timeout: 35000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1000);
      await page.waitForTimeout(1000);
    }

    const cards = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('a[href*="/jobs/"], div[class*="JobCard"], div[class*="job-card"]'));
      const list = [];
      const seen = new Set();
      for (const el of items) {
        const a = el.tagName === 'A' ? el : el.querySelector('a[href*="/jobs/"]');
        const href = a ? a.href : '';
        if (!href || seen.has(href) || href.endsWith('/jobs')) continue;
        seen.add(href);
        const text = (el.innerText || '').trim();
        list.push({ href, text });
      }
      return list;
    });

    console.log(`Discovered ${cards.length} raw cards on Peerlist.`);

    const qualified = [];
    for (const card of cards) {
      const lines = card.text.split('\n').map(s => s.trim()).filter(Boolean);
      const title = lines[0] || '';
      const company = lines[1] || '';
      const textAll = card.text.toLowerCase();

      // Check if AI/ML/Python/FDE
      const isAi = /\b(ai\b|machine learning|ml\b|genai|generative|llm|agentic|langgraph|fde|forward deployed|python)\b/i.test(card.text);
      if (!isAi) continue;

      // Check seniority (< 3 YOE)
      const isSenior = /\b(lead|principal|staff|head of|vp|director|manager|architect|5\+|6\+|7\+|8\+|10\+)\b/i.test(card.text);
      if (isSenior) continue;

      // Check location
      const isIndiaOrRemote = /\b(bengaluru|bangalore|hyderabad|remote|india)\b/i.test(textAll);
      let locTier = 'Tier 3 (Remote India)';
      if (/bengaluru|bangalore/i.test(textAll)) locTier = 'Tier 1 (Bengaluru)';
      else if (/hyderabad/i.test(textAll)) locTier = 'Tier 2 (Hyderabad)';

      qualified.push({
        company,
        title,
        locationTier: locTier,
        url: card.href,
        snippet: card.text.replace(/\n+/g, ' | ')
      });
    }

    console.log(`Qualified ${qualified.length} AI roles on Peerlist:`);
    qualified.forEach((q, i) => {
      console.log(`[#${i+1}] ${q.company} — ${q.title} [${q.locationTier}]`);
      console.log(`    URL: ${q.url}`);
    });

    fs.writeFileSync(resolve(ROOT_DIR, 'data/peerlist-discovered.json'), JSON.stringify(qualified, null, 2), 'utf-8');
  } catch (err) {
    console.error('Peerlist scrape error:', err.message);
  } finally {
    await ctx.close().catch(() => {});
  }
}

scrapePeerlist();
