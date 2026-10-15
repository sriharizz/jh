import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function inspectTimeLink() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';
  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  const timeEls = await page.evaluate(() => {
    // Find elements with text matching '1m •' or '2m •' or '\d+[mhdw] •'
    const all = Array.from(document.querySelectorAll('*'));
    const timeMatches = all.filter(el => {
      const txt = (el.innerText || '').trim();
      return /^\d+\s*[smhdw]\s*•?/i.test(txt) && txt.length < 20 && el.children.length === 0;
    });

    return timeMatches.slice(0, 3).map(el => {
      // Walk up to find parent anchor or button
      let parent = el;
      const chain = [];
      for (let i = 0; i < 5; i++) {
        if (!parent) break;
        chain.push({
          tag: parent.tagName,
          href: parent.getAttribute('href'),
          className: parent.className,
        });
        if (parent.tagName === 'A') break;
        parent = parent.parentElement;
      }
      return {
        text: el.innerText,
        chain,
      };
    });
  });

  console.log('Time elements:', JSON.stringify(timeEls, null, 2));
  await ctx.close();
}

inspectTimeLink().catch(console.error);
