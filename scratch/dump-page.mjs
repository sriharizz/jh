import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function dumpPageContent() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  console.log('Navigating to:', queryUrl);
  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(6000);

  const pageInfo = await page.evaluate(() => {
    return {
      title: document.title,
      url: window.location.href,
      bodyTextLength: document.body.innerText.length,
      snippet: document.body.innerText.slice(0, 800),
      hasFeed: Boolean(document.querySelector('.feed-shared-update-v2, .search-results-container, [data-view-name]')),
      linksCount: document.querySelectorAll('a').length,
      sampleLinks: Array.from(document.querySelectorAll('a[href]')).map(a => a.href).slice(0, 10),
    };
  });

  console.log('Page Info:', JSON.stringify(pageInfo, null, 2));
  await ctx.close();
}

dumpPageContent().catch(console.error);
