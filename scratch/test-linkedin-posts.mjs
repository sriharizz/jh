import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function testPostsSearch() {
  console.log('Testing LinkedIn Posts (Content) Search DOM extraction...');
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=(%22hiring%22%20OR%20%22looking%20for%22)%20AND%20(%22AI%20intern%22%20OR%20%22Machine%20Learning%20intern%22%20OR%20%22GenAI%22)&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  console.log('Navigating to:', queryUrl);
  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(4000);

  // Scroll a bit
  await page.evaluate(() => window.scrollBy(0, 1000));
  await page.waitForTimeout(2000);

  const postsInfo = await page.evaluate(() => {
    // Select post containers
    const containers = Array.from(document.querySelectorAll('div.feed-shared-update-v2, div[data-urn*="urn:li:activity"], li.reusable-search__result-container, div.artdeco-card'));
    
    return containers.slice(0, 5).map(c => {
      const authorEl = c.querySelector('span.update-components-actor__name, span.feed-shared-actor__name, a.update-components-actor__meta-link span[dir="ltr"], .app-aware-link span');
      const headlineEl = c.querySelector('span.update-components-actor__description, span.feed-shared-actor__description');
      const timeEl = c.querySelector('span.update-components-actor__sub-description, time, .feed-shared-actor__sub-description');
      const textEl = c.querySelector('div.feed-shared-update-v2__description, span.break-words, div.feed-shared-text, .update-components-text');
      const linkEl = c.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
      const urn = c.getAttribute('data-urn') || '';

      return {
        author: authorEl ? authorEl.innerText.trim() : '',
        headline: headlineEl ? headlineEl.innerText.trim() : '',
        time: timeEl ? timeEl.innerText.trim() : '',
        textSnippet: textEl ? textEl.innerText.trim().slice(0, 150) : '',
        postUrl: linkEl ? linkEl.href : '',
        urn,
      };
    });
  });

  console.log(`Found ${postsInfo.length} sample posts:`);
  console.log(JSON.stringify(postsInfo, null, 2));

  await ctx.close();
}

testPostsSearch().catch(console.error);
