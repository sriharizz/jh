import { chromium } from 'playwright';

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  console.log('Searching Tiger Analytics AI Engineer...');
  await page.goto('https://www.linkedin.com/jobs/search/?keywords=Tiger%20Analytics%20AI%20Engineer&geoId=102713980', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const tiger = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div.base-card, li')).map(el => {
      const title = el.querySelector('h3, .base-search-card__title')?.innerText?.trim();
      const company = el.querySelector('h4, .base-search-card__subtitle')?.innerText?.trim();
      const link = el.querySelector('a[href*="/jobs/view/"]')?.href?.split('?')[0];
      return title ? { title, company, link } : null;
    }).filter(Boolean);
  });
  console.log('Tiger results:', tiger.slice(0, 5));

  console.log('\nSearching Infused Solutions Intelligence Data Engineer...');
  await page.goto('https://www.linkedin.com/jobs/search/?keywords=Infused%20Solutions%20Intelligence%20Data%20Engineer&geoId=102713980', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const infused = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('div.base-card, li')).map(el => {
      const title = el.querySelector('h3, .base-search-card__title')?.innerText?.trim();
      const company = el.querySelector('h4, .base-search-card__subtitle')?.innerText?.trim();
      const link = el.querySelector('a[href*="/jobs/view/"]')?.href?.split('?')[0];
      return title ? { title, company, link } : null;
    }).filter(Boolean);
  });
  console.log('Infused results:', infused.slice(0, 5));

  await browser.close();
}

main().catch(console.error);
