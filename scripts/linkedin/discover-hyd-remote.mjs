import { createLinkedInContext } from './linkedin-session.mjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

async function main() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const hydAndRemoteQueries = [
    {
      lane: 'Hyderabad — AI & Machine Learning Internships',
      url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern&geoId=105556991&f_JT=I&f_TPR=r604800',
    },
    {
      lane: 'Hyderabad — AI & GenAI Engineer (< 3 YOE)',
      url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20OR%20Applied%20AI&geoId=105556991&f_E=1,2,3&f_TPR=r604800',
    },
    {
      lane: 'Remote India — AI / GenAI Internships',
      url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern&geoId=102713980&f_WT=2&f_JT=I&f_TPR=r604800',
    },
    {
      lane: 'Remote India — Forward Deployed / AI Engineer (< 3 YOE)',
      url: 'https://www.linkedin.com/jobs/search/?keywords=%22Forward%20Deployed%22%20OR%20%22AI%20Engineer%22&geoId=102713980&f_WT=2&f_E=1,2,3&f_TPR=r604800',
    },
  ];

  let seen = {};
  try { seen = JSON.parse(fs.readFileSync(resolve(ROOT_DIR, 'data/linkedin-seen.json'), 'utf-8')); } catch(e){}

  const results = [];

  for (const q of hydAndRemoteQueries) {
    console.log(`Querying ${q.lane}...`);
    try {
      await page.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2500);

      const cards = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div.base-card, div[data-job-id]'));
        return items.map(it => {
          const titleEl = it.querySelector('.job-card-list__title, a.job-card-container__link, h3, a.base-card__full-link');
          const compEl = it.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4, span.job-card-container__company-name');
          const locEl = it.querySelector('.job-card-container__metadata-item, .job-search-card__location, span.job-card-container__metadata-wrapper');
          const linkEl = it.querySelector('a[href*="/jobs/view/"]');
          const isEasyApply = Boolean(it.querySelector('.job-card-container__easy-apply-text, svg[data-test-icon*="easy-apply"]'));
          const timeEl = it.querySelector('time, .job-search-card__listdate, .job-card-container__listed-time');

          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\/jobs\/view\/(\d+)/);
          const jobId = m ? m[1] : '';

          return {
            jobId,
            title: titleEl ? titleEl.innerText.trim() : '',
            company: compEl ? compEl.innerText.trim() : '',
            location: locEl ? locEl.innerText.trim() : '',
            posted: timeEl ? timeEl.innerText.trim() : '',
            isEasyApply,
            url: jobId ? `https://www.linkedin.com/jobs/view/${jobId}/` : '',
          };
        }).filter(c => c.jobId && c.title);
      });

      console.log(`Found ${cards.length} cards in ${q.lane}`);

      for (const c of cards) {
        if (seen[c.jobId] && seen[c.jobId].status === 'APPLIED') continue;
        if (results.some(r => r.jobId === c.jobId)) continue;

        const titleLower = c.title.toLowerCase();
        if (/\b(lead|principal|staff|director|manager|architect|head of)\b/i.test(titleLower)) continue;
        if (!/\b(ai\b|machine learning|ml\b|genai|generative|llm|agentic|langgraph|fde|forward deployed|data science|nlp|deep learning|python)\b/i.test(titleLower)) continue;

        results.push({
          ...c,
          lane: q.lane,
        });
      }
    } catch (err) {
      console.warn(`Error querying ${q.lane}: ${err.message}`);
    }
  }

  console.log(`\nTotal Qualified Hyd & Remote LinkedIn Candidates: ${results.length}`);
  results.forEach((r, idx) => {
    console.log(`[#${idx + 1}] ${r.company} — ${r.title} (${r.location}) [${r.isEasyApply ? '🟢 Easy Apply' : '🔵 External ATS'}]`);
    console.log(`     URL: ${r.url}`);
  });

  fs.writeFileSync(resolve(ROOT_DIR, 'data/linkedin-hyd-remote.json'), JSON.stringify(results, null, 2), 'utf-8');
  await ctx.close();
}

main().catch(console.error);
