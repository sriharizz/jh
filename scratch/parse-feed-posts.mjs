import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function parseFeedPosts() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  const posts = await page.evaluate(() => {
    // Strategy: Look for all author profile links `a[href*="/in/"]` inside the main search feed
    const authorLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
    const uniquePosts = [];
    const seenAuthors = new Set();

    authorLinks.forEach(a => {
      const href = a.href.split('?')[0];
      if (seenAuthors.has(href)) return;

      // Find the card container by walking up
      let container = a;
      for (let i = 0; i < 8; i++) {
        if (!container.parentElement) break;
        container = container.parentElement;
        // If container has significant text or buttons like Like, Comment, Repost
        if (container.innerText && (container.innerText.includes('Like') || container.innerText.includes('Comment') || container.innerText.includes('Repost'))) {
          break;
        }
      }

      if (container && container.innerText && container.innerText.length > 100) {
        seenAuthors.add(href);

        // Find post action / activity link
        const postLinkEl = container.querySelector('a[href*="activity"], a[href*="/posts/"], a[href*="/feed/update/"]');
        const allText = container.innerText;
        
        // Extract post URL from any link or share button
        let postUrl = postLinkEl ? postLinkEl.href.split('?')[0] : '';
        if (!postUrl) {
          // Look for data-urn
          const urnEl = container.querySelector('[data-urn*="activity"], [data-chameleon-result-urn*="activity"]');
          if (urnEl) {
            const urn = urnEl.getAttribute('data-urn') || urnEl.getAttribute('data-chameleon-result-urn');
            const actId = urn.match(/activity:(\d+)/);
            if (actId) postUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${actId[1]}/`;
          }
        }

        uniquePosts.push({
          authorUrl: href,
          postUrl,
          containerTag: container.tagName,
          containerClass: container.className,
          text: allText.slice(0, 300).replace(/\n+/g, ' '),
        });
      }
    });

    return uniquePosts.slice(0, 5);
  });

  console.log('Extracted Posts:', JSON.stringify(posts, null, 2));
  await ctx.close();
}

parseFeedPosts().catch(console.error);
