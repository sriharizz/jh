import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function testDom() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/jobs/view/4429572630/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const titleText = await page.title();
  console.log('Document title:', titleText);

  const heading1s = await page.$$eval('h1, h2, h3', headings => headings.map(h => ({ tag: h.tagName, text: h.innerText.trim(), class: h.className })));
  console.log('Headings:', JSON.stringify(heading1s.slice(0, 10), null, 2));

  const textSnippets = await page.evaluate(() => {
    return {
      main: document.querySelector('main')?.innerText?.slice(0, 500),
      body: document.body.innerText.slice(0, 500)
    };
  });
  console.log('\nBody text snippet:\n', textSnippets.body);

  await context.close();
}

testDom().catch(console.error);
