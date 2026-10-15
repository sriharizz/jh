import { createWellfoundContext } from '../scripts/wellfound/wellfound-session.mjs';

async function test() {
  const ctx = await createWellfoundContext({ headless: true });
  const p = ctx.pages().length > 0 ? ctx.pages()[0] : await ctx.newPage();
  await p.goto('https://wellfound.com/jobs', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(2000);

  const inputs = await p.$$('input[type="text"]');
  if (inputs.length > 0) {
    await inputs[0].fill('AI Intern');
    await p.waitForTimeout(500);
    const searchBtn = await p.$('button:has-text("Search")');
    if (searchBtn) await searchBtn.click();
    else await inputs[0].press('Enter');
    await p.waitForTimeout(4000);

    const cards = await p.evaluate(() => {
      const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
      return anchors.slice(0, 10).map(a => {
        let card = a.closest('div[class*="styles_job"], div[class*="JobCard"], div[class*="listing"], div.styles_component__') || a.parentElement;
        return {
          href: a.href,
          cardText: card ? card.innerText.replace(/\n+/g, ' | ').slice(0, 200) : a.innerText
        };
      });
    });
    console.log('AI INTERN CARDS:\n', JSON.stringify(cards, null, 2));
  }
  await ctx.close();
}

test().catch(console.error);
