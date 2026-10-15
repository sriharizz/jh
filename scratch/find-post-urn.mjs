import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function findPostUrn() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';
  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  const urns = await page.evaluate(() => {
    // Look at all elements on the entire page that have 'activity' in any attribute or innerHTML
    const all = Array.from(document.querySelectorAll('*'));
    const matches = [];

    all.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.value && attr.value.includes('urn:li:activity:')) {
          matches.push({ tag: el.tagName, attr: attr.name, val: attr.value });
        }
      });
    });

    // Also look for button[aria-label*="Control menu"] or button[aria-label*="More actions"]
    const buttons = Array.from(document.querySelectorAll('button[aria-label*="Control menu"], button[aria-label*="more actions"], button[aria-label*="More options"]')).slice(0, 3).map(b => b.outerHTML.slice(0, 150));

    return {
      activityMatches: matches.slice(0, 10),
      buttons,
    };
  });

  console.log('URN matches:', JSON.stringify(urns, null, 2));
  await ctx.close();
}

findPostUrn().catch(console.error);
