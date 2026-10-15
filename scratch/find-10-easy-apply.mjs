import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const ROOT_DIR = resolve('.');
const TRACKER_FILE = resolve(ROOT_DIR, 'data/applications.md');

async function main() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();

  const appliedIds = new Set();
  if (existsSync(TRACKER_FILE)) {
    const trackerText = readFileSync(TRACKER_FILE, 'utf-8');
    const matches = trackerText.matchAll(/\/jobs\/view\/(\d+)/g);
    for (const m of matches) {
      appliedIds.add(m[1]);
    }
  }

  const searchUrls = [
    'https://www.linkedin.com/jobs/search/?keywords=%22AI%20Engineer%22%20OR%20%22GenAI%22%20OR%20%22Generative%20AI%22&location=Bengaluru&f_AL=true&f_TPR=r604800&sortBy=DD',
    'https://www.linkedin.com/jobs/search/?keywords=%22Machine%20Learning%22%20OR%20%22Data%20Science%22%20OR%20%22AI%22&location=Bengaluru&f_AL=true&f_TPR=r604800&f_E=1%2C2%2C3&sortBy=DD',
    'https://www.linkedin.com/jobs/search/?keywords=%22AI%22%20AND%20(%22Intern%22%20OR%20%22Junior%22%20OR%20%22Graduate%22)&location=India&f_AL=true&f_TPR=r604800&sortBy=DD'
  ];

  const candidateJobs = [];
  const seenJobIds = new Set(appliedIds);

  for (const url of searchUrls) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await page.waitForTimeout(2500);

      for (let i = 0; i < 4; i++) {
        await page.evaluate(() => {
          const listContainer = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-detail-inner');
          if (listContainer) listContainer.scrollTop += 800;
          else window.scrollBy(0, 800);
        });
        await page.waitForTimeout(1000);
      }

      const extracted = await page.evaluate(() => {
        const cards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, li[data-occludable-job-id]'));
        const list = [];
        for (const c of cards) {
          const titleEl = c.querySelector('.job-card-list__title, a[href*="/jobs/view/"]');
          const companyEl = c.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
          const locationEl = c.querySelector('.job-card-container__metadata-item');
          const linkEl = c.querySelector('a[href*="/jobs/view/"]');
          const url = linkEl ? linkEl.href.split('?')[0] : '';
          const m = url.match(/\/jobs\/view\/(\d+)/);
          if (m) {
            list.push({
              jobId: m[1],
              title: titleEl ? titleEl.innerText.trim() : '',
              company: companyEl ? companyEl.innerText.trim() : '',
              location: locationEl ? locationEl.innerText.trim() : 'India',
              url
            });
          }
        }
        return list;
      });

      for (const j of extracted) {
        if (!seenJobIds.has(j.jobId) && j.title && j.company) {
          seenJobIds.add(j.jobId);
          candidateJobs.push(j);
        }
      }
    } catch (err) {}
  }

  console.log(`Discovered total unapplied candidates: ${candidateJobs.length}`);
  const outPath = resolve(ROOT_DIR, 'data/fresh-candidates.json');
  writeFileSync(outPath, JSON.stringify(candidateJobs, null, 2), 'utf-8');
  await context.close();
}

main().catch(console.error);
