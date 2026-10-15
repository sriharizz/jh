import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function inspectContentPage() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  console.log('Navigating to:', queryUrl);
  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  const debugInfo = await page.evaluate(() => {
    // Collect all classes on main/div elements
    const elements = Array.from(document.querySelectorAll('*'));
    const classes = new Set();
    elements.forEach(el => {
      if (el.className && typeof el.className === 'string') {
        el.className.split(/\s+/).forEach(c => {
          if (c.includes('feed') || c.includes('update') || c.includes('search') || c.includes('result') || c.includes('card')) {
            classes.add(c);
          }
        });
      }
    });

    const articles = document.querySelectorAll('div[data-urn], div.feed-shared-update-v2, div.artdeco-card, .search-results-container, main');

    // Find any post text
    const textSnippets = Array.from(document.querySelectorAll('p, span, div'))
      .filter(el => el.innerText && el.innerText.toLowerCase().includes('hiring') && el.innerText.length < 300)
      .slice(0, 5)
      .map(el => ({ tag: el.tagName, class: el.className, text: el.innerText.trim().slice(0, 100) }));

    return {
      title: document.title,
      url: window.location.href,
      matchingClasses: Array.from(classes).slice(0, 30),
      articlesCount: articles.length,
      textSnippets,
    };
  });

  console.log('Debug Info:', JSON.stringify(debugInfo, null, 2));
  await ctx.close();
}

inspectContentPage().catch(console.error);
