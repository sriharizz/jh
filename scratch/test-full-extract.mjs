import { createLinkedInContext } from '../scripts/linkedin/linkedin-session.mjs';

async function testExtraction() {
  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();
  await page.goto('https://www.linkedin.com/jobs/view/4429572630/', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2500);

  const docTitle = await page.title();
  const parts = docTitle.split(' | ');
  const title = parts[0]?.trim() || '';
  const company = parts[1]?.trim() || '';

  // Extract description text under "About the job"
  const jobText = await page.evaluate(() => {
    // 1. Look for text under "About the job"
    const headings = Array.from(document.querySelectorAll('h2, h3, div'));
    const aboutHeading = headings.find(h => h.innerText && h.innerText.trim() === 'About the job');
    if (aboutHeading) {
      let next = aboutHeading.nextElementSibling;
      if (next) return next.innerText.trim();
      let parent = aboutHeading.parentElement;
      if (parent) return parent.innerText.trim();
    }
    // Fallback: main content
    return document.querySelector('main')?.innerText || document.body.innerText;
  });

  const easyApplyButton = await page.$('button[aria-label*="Easy Apply"], button:has-text("Easy Apply")');
  const hasEasyApply = easyApplyButton !== null;

  console.log('Title:', title);
  console.log('Company:', company);
  console.log('Easy Apply:', hasEasyApply);
  console.log('\nExtracted Job Description Snippet (first 800 chars):\n', jobText.slice(0, 800));

  await context.close();
}

testExtraction().catch(console.error);
