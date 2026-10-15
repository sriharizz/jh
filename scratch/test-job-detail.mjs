import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function testSingleJob() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();

  const url = 'https://www.linkedin.com/jobs/view/4429572630/';
  console.log('Navigating to:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(3000);

  const title = await page.$eval('h1', el => el.innerText.trim()).catch(() => 'N/A');
  const company = await page.$eval('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name', el => el.innerText.trim()).catch(() => 'N/A');
  const loc = await page.$eval('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet', el => el.innerText.trim()).catch(() => 'N/A');
  const desc = await page.$eval('#job-details, .jobs-description__content, .jobs-box__html-content', el => el.innerText.trim()).catch(() => 'N/A');
  const easyApply = await page.$('button.jobs-apply-button[aria-label*="Easy Apply"], button.jobs-apply-button, button:has-text("Easy Apply")');

  console.log('\n--- Extracted Data ---');
  console.log('Title:', title);
  console.log('Company:', company);
  console.log('Location:', loc);
  console.log('Easy Apply Available:', easyApply !== null);
  console.log('Description Snippet (first 400 chars):\n', desc.slice(0, 400));

  await context.close();
}

testSingleJob().catch(console.error);
