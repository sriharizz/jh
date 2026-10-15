import { chromium } from 'playwright';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const PROFILE_DIR = resolve('data/linkedin-profile');
const APPS_FILE = resolve('data/applications.md');
const QUEUE_FILE = resolve('data/linkedin-queue.json');

function getApplied() {
  const urls = new Set();
  const companies = new Set();
  if (existsSync(APPS_FILE)) {
    const lines = readFileSync(APPS_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const matchUrl = line.match(/\(https?:\/\/[^\)]+\)/);
      if (matchUrl) urls.add(matchUrl[0].slice(1, -1).trim());
      const parts = line.split('|').map(s => s.trim());
      if (parts[2]) companies.add(parts[2].toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').trim());
    }
  }
  return { urls, companies };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function run() {
  const { urls: appliedUrls, companies: appliedCompanies } = getApplied();
  
  const searchUrls = [
    { lane: 'India Remote AI', url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer&geoId=102713980&f_TPR=r1209600&sortBy=DD' },
    { lane: 'India GenAI Engineer', url: 'https://www.linkedin.com/jobs/search/?keywords=Generative%20AI%20Engineer&geoId=102713980&f_TPR=r1209600&sortBy=DD' },
    { lane: 'India Agent AI Engineer', url: 'https://www.linkedin.com/jobs/search/?keywords=Agentic%20AI%20OR%20Agent%20AI&geoId=102713980&f_TPR=r1209600&sortBy=DD' },
    { lane: 'India AI Internships', url: 'https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern&geoId=102713980&f_TPR=r1209600&sortBy=DD' },
    { lane: 'India Python AI', url: 'https://www.linkedin.com/jobs/search/?keywords=Python%20AI%20OR%20LLM&geoId=102713980&f_TPR=r1209600&sortBy=DD' },
  ];

  console.log('Launching browser to fetch expanded 20-30 LinkedIn roles...');
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 850 },
    args: ['--disable-blink-features=AutomationControlled'],
  });

  const page = ctx.pages()[0] || (await ctx.newPage());
  const discovered = [];
  const seenIds = new Set();

  for (const s of searchUrls) {
    console.log(`\n• Fetching lane: ${s.lane}...`);
    try {
      await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await sleep(2000);

      // Scroll list
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => {
          const items = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container');
          if (items.length) items[items.length - 1].scrollIntoView();
          const scroller = document.querySelector('.jobs-search-results-list, main');
          if (scroller) scroller.scrollTop += 800;
        });
        await sleep(500);
      }

      const cards = await page.evaluate(() => {
        const items = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div.base-card');
        const list = [];
        items.forEach((item) => {
          const titleEl = item.querySelector('.job-card-list__title, a.job-card-container__link, h3');
          const companyEl = item.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4');
          const locEl = item.querySelector('.job-card-container__metadata-item, span.job-card-container__metadata-wrapper');
          const linkEl = item.querySelector('a[href*="/jobs/view/"]');
          const isEasyApply = Boolean(item.querySelector('.job-card-container__easy-apply-text, svg[data-test-icon*="easy-apply"]'));
          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\/jobs\/view\/(\d+)/);
          if (m && titleEl) {
            list.push({
              jobId: m[1],
              title: titleEl.innerText.trim(),
              company: companyEl ? companyEl.innerText.trim() : '',
              location: locEl ? locEl.innerText.trim() : '',
              url: `https://www.linkedin.com/jobs/view/${m[1]}/`,
              easyApply: isEasyApply,
            });
          }
        });
        return list;
      });

      console.log(`  Found ${cards.length} cards in lane.`);

      for (const c of cards) {
        if (seenIds.has(c.jobId) || appliedUrls.has(c.url)) continue;
        const normComp = (c.company || '').toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').trim();
        if (appliedCompanies.has(normComp)) continue;

        const titleLower = c.title.toLowerCase();
        // Senior exclusion
        if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief|expert)\b/i.test(titleLower)) continue;
        if (/\b(sales|marketing|recruiter|hr|talent|bde|sdr|accountant|writer|graphic|operations|support)\b/i.test(titleLower)) continue;
        if (!/\b(ai|ml|genai|llm|agent|fde|machine learning|python|data science|nlp|vision|intern)\b/i.test(titleLower)) continue;

        seenIds.add(c.jobId);
        discovered.push({
          title: c.title.replace(/\s+with\s+verification$/i, '').replace(/\n/g, ' ').trim(),
          company: c.company,
          location: c.location || 'India',
          url: c.url,
          easyApply: c.easyApply ? '🟢 Easy Apply' : '🔵 External Apply',
          lane: s.lane
        });
      }
    } catch (e) {
      console.error(`Error in lane ${s.lane}: ${e.message}`);
    }
  }

  await ctx.close();
  console.log(`\nDiscovered ${discovered.length} total fresh qualified LinkedIn opportunities.`);
  writeFileSync(resolve('scratch/fresh-linkedin-jobs.json'), JSON.stringify(discovered, null, 2), 'utf-8');
}

run();
