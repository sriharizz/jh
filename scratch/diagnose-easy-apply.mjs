import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function main() {
  const context = await createLinkedInContext({ headless: false });
  const page = await context.newPage();

  const url = 'https://www.linkedin.com/jobs/view/4468017235/';
  console.log('Navigating to', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const easyApplyBtn = await page.$('button[aria-label*="Easy Apply"], button:has-text("Easy Apply")');
  if (easyApplyBtn) {
    console.log('Clicking Easy Apply button...');
    await easyApplyBtn.click();
    await page.waitForTimeout(2000);

    const dialog = await page.$('dialog[open], dialog');
    if (dialog) {
      const text = await dialog.innerText();
      console.log('✅ Successfully matched <dialog>!');
      console.log('Dialog innerText preview:\n', text.slice(0, 400));
    } else {
      console.log('❌ Could not match <dialog>');
    }
  }
  await context.close();
}

main().catch(console.error);
