import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function inspectSearchPage() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();

  const url = 'https://www.linkedin.com/jobs/search/?keywords=artificial%20intelligence%20engineer&f_WT=2&geoId=102713980';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(4000);

  console.log('Current URL after navigation:', page.url());

  const pageTitle = await page.title();
  console.log('Page Title:', pageTitle);

  // Check possible selectors
  const selectors = [
    '.jobs-search-results-list',
    '.scaffold-layout__list',
    '.scaffold-layout__list-container',
    'ul.jobs-search__results-list',
    'li[data-occludable-job-id]',
    '.job-card-container',
    'div[data-job-id]',
    'div[data-view-name="job-card"]',
    '.jobs-search-results__list-item',
    'a[href*="/jobs/view/"]'
  ];

  for (const sel of selectors) {
    const count = await page.$$eval(sel, els => els.length).catch(() => 0);
    console.log(`Selector "${sel}": ${count} elements found.`);
  }

  // Get sample HTML snippet of the list container if found
  const listHtml = await page.evaluate(() => {
    const container = document.querySelector('.scaffold-layout__list') || document.querySelector('.jobs-search-results-list') || document.querySelector('main');
    return container ? container.innerHTML.slice(0, 1000) : 'No container found';
  });
  console.log('\nContainer HTML snippet:\n', listHtml.slice(0, 500));

  await context.close();
}

inspectSearchPage().catch(console.error);
