import { createWellfoundContext } from './wellfound-session.mjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

async function main() {
  const ctx = await createWellfoundContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const urls = [
    'https://wellfound.com/jobs?job_types[]=internship&role_titles[]=Artificial%20Intelligence%20Engineer&locations[]=Bengaluru',
    'https://wellfound.com/jobs?role_titles[]=Artificial%20Intelligence%20Engineer&role_titles[]=Machine%20Learning%20Engineer&locations[]=Bengaluru&locations[]=Hyderabad',
  ];

  const seenUrls = new Set();
  const matches = [];

  for (const u of urls) {
    console.log(`Checking Wellfound: ${u}...`);
    try {
      await page.goto(u, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(3000);

      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 800);
        await page.waitForTimeout(600);
      }

      const jobCards = await page.evaluate(() => {
        const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
        return anchors.map(a => {
          let cardEl = a.closest('div[class*="styles_job"], div[class*="JobCard"], div[class*="listing"], div.styles_component__') || a.parentElement;
          return {
            href: a.href,
            text: cardEl ? cardEl.innerText.trim() : a.innerText.trim(),
          };
        });
      });

      console.log(`Found ${jobCards.length} potential job card links.`);

      for (const card of jobCards) {
        const cleanUrl = (card.href || '').split('?')[0];
        if (!cleanUrl || seenUrls.has(cleanUrl) || cleanUrl.endsWith('/jobs')) continue;
        seenUrls.add(cleanUrl);

        const text = card.text.toLowerCase();
        const isForeignInOffice = /(san francisco|mountain view|los angeles|seattle|new york|chicago|austin|boston|london|canada|germany|uk)/i.test(text) && !text.includes('remote');
        if (isForeignInOffice) continue;

        const isIndia = /bengaluru|bangalore|hyderabad|remote|india/i.test(text);
        if (!isIndia) continue;

        const isSenior = /\b(4\+|5\+|6\+|7\+|8\+|10\+|principal|lead|staff|director|manager|head of|vp)\b/i.test(text);
        if (isSenior) continue;

        const lines = card.text.split('\n').map(s => s.trim()).filter(Boolean);
        const title = lines[0] || 'AI Engineer';
        const company = lines[1] || 'Wellfound AI Startup';

        let locTier = 'Tier 3 (Remote India)';
        if (/bengaluru|bangalore/i.test(text)) locTier = 'Tier 1 (Bengaluru)';
        else if (/hyderabad/i.test(text)) locTier = 'Tier 2 (Hyderabad)';

        matches.push({
          company,
          title,
          locationTier: locTier,
          url: cleanUrl,
          raw: card.text.replace(/\n+/g, ' | '),
          source: 'Wellfound',
        });
      }
    } catch (err) {
      console.warn(`Error on ${u}: ${err.message}`);
    }
  }

  console.log(`\nFound ${matches.length} qualified matches on Wellfound:`);
  matches.forEach((m, idx) => {
    console.log(`[#${idx + 1}] ${m.company} — ${m.title} [${m.locationTier}]`);
    console.log(`     URL: ${m.url}`);
    console.log(`     Details: ${m.raw}`);
  });

  fs.writeFileSync(resolve(ROOT_DIR, 'data/wellfound-matches.json'), JSON.stringify(matches, null, 2), 'utf-8');
  await ctx.close();
}

main().catch(console.error);
