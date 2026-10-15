import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function inspectPostHierarchy() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(4000);

  const hierarchy = await page.evaluate(() => {
    // Find any element containing #Hiring or hiring
    const candidates = Array.from(document.querySelectorAll('span, p, div, a'))
      .filter(el => el.innerText && el.innerText.toLowerCase().includes('hiring') && el.children.length === 0);

    if (candidates.length === 0) return { error: 'No candidate text found' };

    const first = candidates[0];
    const path = [];
    let curr = first;
    while (curr && curr !== document.body) {
      path.push({
        tag: curr.tagName,
        id: curr.id,
        className: curr.className,
        role: curr.getAttribute('role'),
        dataUrn: curr.getAttribute('data-urn') || curr.getAttribute('data-chameleon-result-urn') || curr.getAttribute('data-view-name'),
        hasLinks: curr.querySelectorAll('a[href*="/in/"], a[href*="activity"], a[href*="/posts/"]').length,
      });
      curr = curr.parentElement;
    }

    // Also find all links on page matching /in/ or /posts/ or /activity/
    const links = Array.from(document.querySelectorAll('a[href*="activity"], a[href*="/posts/"], a[href*="/feed/update/"]'))
      .map(a => a.href)
      .slice(0, 10);

    return {
      totalFound: candidates.length,
      path: path.slice(0, 10),
      samplePostLinks: links,
    };
  });

  console.log('Hierarchy:', JSON.stringify(hierarchy, null, 2));
  await ctx.close();
}

inspectPostHierarchy().catch(console.error);
