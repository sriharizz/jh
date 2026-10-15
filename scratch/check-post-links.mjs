import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function checkPostLinks() {
  const ctx = await createLinkedInContext({ headless: true });
  const page = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();

  const queryUrl = 'https://www.linkedin.com/search/results/content/?keywords=ai%20hiring&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D';

  await page.goto(queryUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await page.waitForTimeout(5000);

  const linksData = await page.evaluate(() => {
    const authorLinks = Array.from(document.querySelectorAll('a[href*="/in/"]'));
    if (authorLinks.length === 0) return [];

    let container = authorLinks[0];
    for (let i = 0; i < 8; i++) {
      if (!container.parentElement) break;
      container = container.parentElement;
      if (container.innerText && container.innerText.includes('Like') && container.innerText.includes('Comment')) break;
    }

    const allLinks = Array.from(container.querySelectorAll('a')).map(a => ({
      href: a.href,
      text: a.innerText.trim(),
      aria: a.getAttribute('aria-label') || '',
    }));

    // Check data attributes on container and descendants
    const dataAttributes = [];
    const allEls = [container, ...Array.from(container.querySelectorAll('*'))];
    allEls.forEach(el => {
      Array.from(el.attributes).forEach(attr => {
        if (attr.name.startsWith('data-') || attr.name.includes('urn')) {
          dataAttributes.push({ tag: el.tagName, name: attr.name, value: attr.value });
        }
      });
    });

    return {
      allLinks,
      sampleDataAttrs: dataAttributes.filter(d => d.value.includes('activity') || d.value.includes('urn')).slice(0, 5),
    };
  });

  console.log('Links & URNs:', JSON.stringify(linksData, null, 2));
  await ctx.close();
}

checkPostLinks().catch(console.error);
