import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';
import { readFileSync, existsSync } from 'fs';

async function main() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();

  console.log('Searching for Entry-Level & Mid-Level Easy Apply AI/GenAI roles in India...');
  // f_AL=true (Easy Apply), f_TPR=r604800 (past week), f_E=1,2,3 (Internship, Entry level, Associate)
  const searchUrl = 'https://www.linkedin.com/jobs/search/?keywords=%22AI%20Engineer%22%20OR%20%22Generative%20AI%22%20OR%20%22Machine%20Learning%20Engineer%22&location=India&f_AL=true&f_TPR=r604800&f_E=1%2C2%2C3&sortBy=DD';
  
  await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(3000);

  const jobs = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item, li[data-occludable-job-id]'));
    const seen = new Set();
    const list = [];
    for (const c of cards) {
      const titleEl = c.querySelector('.job-card-list__title, a[href*="/jobs/view/"]');
      const companyEl = c.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle');
      const linkEl = c.querySelector('a[href*="/jobs/view/"]');
      const url = linkEl ? linkEl.href.split('?')[0] : '';
      const m = url.match(/\/jobs\/view\/(\d+)/);
      if (m && !seen.has(m[1])) {
        seen.add(m[1]);
        list.push({
          jobId: m[1],
          title: titleEl ? titleEl.innerText.trim() : '',
          company: companyEl ? companyEl.innerText.trim() : '',
          url
        });
      }
    }
    return list;
  });

  console.log(`Found ${jobs.length} tailored Easy Apply candidate jobs:`);
  for (const j of jobs) {
    console.log(`- [${j.jobId}] ${j.company} — ${j.title} (${j.url})`);
  }

  await context.close();
}

main().catch(console.error);
