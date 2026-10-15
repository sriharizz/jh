import { chromium } from 'playwright';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');
const PROFILE_DIR = resolve(ROOT_DIR, 'data/linkedin-profile');

async function main() {
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: true,
    viewport: { width: 1280, height: 800 },
  });
  const page = context.pages()[0] || await context.newPage();

  console.log('Searching Cyncly in authenticated session...');
  await page.goto('https://www.linkedin.com/jobs/search/?keywords=Cyncly&geoId=102713980', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const cardData = await page.evaluate(() => {
    const list = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div[data-job-id]');
    return Array.from(list).map(el => {
      const title = el.querySelector('.job-card-list__title, a.job-card-container__link, h3')?.innerText?.trim();
      const company = el.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4')?.innerText?.trim();
      const link = el.querySelector('a[href*="/jobs/view/"]')?.href;
      return { title, company, link };
    }).filter(x => x.title);
  });

  console.log('Authenticated Cyncly cards found:', cardData.length);
  console.log('Cards:', cardData.slice(0, 10));

  console.log('\nSearching user screenshot query: "Intelligence Data Engineer (AI)" with In my network...');
  await page.goto('https://www.linkedin.com/jobs/search/?keywords=Intelligence%20Data%20Engineer%20(AI)&geoId=102713980&f_AL=true', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);

  const networkCards = await page.evaluate(() => {
    const list = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div[data-job-id]');
    return Array.from(list).map(el => {
      const title = el.querySelector('.job-card-list__title, a.job-card-container__link, h3')?.innerText?.trim();
      const company = el.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, h4')?.innerText?.trim();
      const link = el.querySelector('a[href*="/jobs/view/"]')?.href;
      return { title, company, link };
    }).filter(x => x.title);
  });

  console.log('Network cards found:', networkCards.length);
  console.log('Network cards:', networkCards.slice(0, 10));

  await context.close();
}

main().catch(console.error);
