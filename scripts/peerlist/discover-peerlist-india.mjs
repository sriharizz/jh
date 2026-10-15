import { createPeerlistContext } from './peerlist-session.mjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

async function main() {
  const ctx = await createPeerlistContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const urls = [
    'https://peerlist.io/jobs/role/ai-engineer',
    'https://peerlist.io/jobs/role/machine-learning-engineer',
    'https://peerlist.io/jobs/role/software-engineer',
  ];

  const seenUrls = new Set();
  const matches = [];

  for (const u of urls) {
    console.log(`Checking ${u}...`);
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      // Scroll a bit
      for (let i = 0; i < 3; i++) {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(800);
      }

      const items = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/careers/"]'));
        return anchors.map(a => ({
          href: a.href,
          text: a.innerText.trim(),
        }));
      });

      for (const it of items) {
        const cleanUrl = (it.href || '').split('?')[0];
        if (!cleanUrl || seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);

        const text = it.text.toLowerCase();
        const isAi = /\b(ai\b|machine learning|ml\b|genai|generative|llm|agentic|langgraph|fde|forward deployed|python)\b/i.test(it.text);
        if (!isAi) continue;

        const isSenior = /\b(4\+|5\+|6\+|7\+|8\+|10\+|principal|lead|staff|director|manager|head of)\b/i.test(it.text);
        if (isSenior) continue;

        const isForeignInOffice = /(san francisco|new york|los angeles|seattle|london|austin|chicago|canada|germany|uk)/i.test(text) && !text.includes('remote');
        if (isForeignInOffice) continue;

        const isIndia = /bengaluru|bangalore|hyderabad|remote|india/i.test(text);
        if (!isIndia) continue;

        const lines = it.text.split('\n').map(s => s.trim()).filter(Boolean);
        const title = lines[0] || 'AI Engineer';
        const companyMatch = it.text.match(/at\s+([^|\n]+)/i);
        const company = companyMatch ? companyMatch[1].trim() : (lines[1] || 'Peerlist Startup');

        let locationTier = 'Tier 3 (Remote India)';
        if (/bengaluru|bangalore/i.test(text)) locationTier = 'Tier 1 (Bengaluru)';
        else if (/hyderabad/i.test(text)) locationTier = 'Tier 2 (Hyderabad)';

        matches.push({
          company,
          title,
          locationTier,
          url: cleanUrl,
          raw: it.text.replace(/\n+/g, ' | '),
          source: 'Peerlist',
        });
      }
    } catch (err) {
      console.warn(`Failed ${u}: ${err.message}`);
    }
  }

  console.log(`\nFound ${matches.length} qualified matches on Peerlist!`);
  matches.forEach((m, idx) => {
    console.log(`[#${idx + 1}] ${m.company} — ${m.title} [${m.locationTier}]`);
    console.log(`     URL: ${m.url}`);
    console.log(`     Details: ${m.raw}`);
  });

  fs.writeFileSync(resolve(ROOT_DIR, 'data/peerlist-matches.json'), JSON.stringify(matches, null, 2), 'utf-8');
  await ctx.close();
}

main().catch(console.error);
