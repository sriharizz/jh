import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function main() {
  const context = await createLinkedInContext({ headless: false });
  const page = await context.newPage();

  const url = 'https://www.linkedin.com/jobs/view/4468017235/';
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const easyApplyBtn = await page.$('button[aria-label*="Easy Apply"], button:has-text("Easy Apply")');
  await easyApplyBtn.click();
  await page.waitForTimeout(2000);

  const phone = await page.$('input[type="tel"]');
  if (phone) await phone.fill('8125752880');
  const next1 = await page.$('button:has-text("Next")');
  await next1.click();
  await page.waitForTimeout(2000);

  const next2 = await page.$('button:has-text("Next")');
  await next2.click();
  await page.waitForTimeout(2000);

  const dialog = await page.$('dialog[open], dialog');
  console.log('Clicking div[role="radio"]:has-text("Yes") or p:has-text("Yes")...');
  const yesOption = await dialog.$('div[role="radio"]:has-text("Yes"), p:has-text("Yes"), label:has-text("Yes")');
  if (yesOption) {
    await yesOption.click({ force: true });
    console.log('Clicked Yes!');
    await page.waitForTimeout(1000);

    const checked = await dialog.evaluate(d => {
      const radio = d.querySelector('input[type="radio"]');
      const roleRadio = d.querySelector('div[role="radio"]');
      return {
        inputChecked: radio ? radio.checked : null,
        ariaChecked: roleRadio ? roleRadio.getAttribute('aria-checked') : null,
      };
    });
    console.log('Checked state after click:', checked);

    // Try clicking Next
    const nextBtn = await dialog.$('button:has-text("Next"), button:has-text("Review")');
    if (nextBtn) {
      await nextBtn.click();
      await page.waitForTimeout(2500);
      const textAfter = await dialog.innerText();
      console.log('Dialog page text after Next:\n', textAfter.slice(0, 300));
    }
  }

  await context.close();
}

main().catch(console.error);
