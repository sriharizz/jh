import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function test() {
  const context = await createLinkedInContext({ headless: true });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  const url = 'https://www.linkedin.com/jobs/search/?keywords=%22Generative%20AI%22%20OR%20GenAI%20OR%20LLM&geoId=105214831&f_TPR=r604800&sortBy=DD';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));

  const cards = await page.evaluate(() => {
    const items = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div.base-card, div[data-job-id]');
    const res = [];
    items.forEach(item => {
      const titleEl = item.querySelector('.job-card-list__title, a.job-card-container__link, h3, a.base-card__full-link');
      const compEl = item.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4, span.job-card-container__company-name');
      const lines = item.innerText.split('\n').map(s => s.trim()).filter(Boolean);
      const loc = lines.find(l => /india|bengaluru|bangalore|hyderabad|remote|hybrid|pune|mumbai|noida|gurgaon|chennai/i.test(l)) || '';
      const hasEasy = lines.includes('Easy Apply') || item.innerText.includes('Easy Apply');
      if (titleEl) {
        res.push({
          title: titleEl.innerText.trim(),
          company: compEl ? compEl.innerText.trim() : (lines[1] || ''),
          location: loc,
          easyApply: hasEasy
        });
      }
    });
    return res;
  });

  console.log(`Found ${cards.length} cards.`);
  for (const c of cards.slice(0, 10)) {
    console.log(`Company: "${c.company}" | Title: "${c.title}" | Loc: "${c.location}" | EasyApply: ${c.easyApply}`);
  }
  await context.close();
}

test().catch(console.error);
