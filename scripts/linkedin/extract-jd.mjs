#!/usr/bin/env node

/**
 * scripts/linkedin/extract-jd.mjs
 *
 * Robust Semantic Job Description & Metadata Extractor
 */

import { createLinkedInContext } from './linkedin-session.mjs';

function extractJdFromDom() {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, span, strong'));
  const aboutJobHeader = headings.find(el => (el.innerText || '').trim().toLowerCase().includes('about the job'));
  if (aboutJobHeader) {
    let node = aboutJobHeader;
    while (node && node.parentElement && node.parentElement.tagName !== 'BODY') {
      node = node.parentElement;
      if (node.innerText && node.innerText.length > 300) {
        return node.innerText.trim();
      }
    }
  }
  const fullText = document.body.innerText || '';
  const idx = fullText.toLowerCase().indexOf('about the job');
  if (idx !== -1) {
    return fullText.slice(idx).trim();
  }
  return '';
}

async function main() {
  const url = process.argv[2];
  if (!url) {
    console.error('Usage: node scripts/linkedin/extract-jd.mjs <linkedin_job_url>');
    process.exit(1);
  }

  const context = await createLinkedInContext({ headless: true });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await new Promise(r => setTimeout(r, 2500));

    // Scroll slightly to trigger hydration
    await page.evaluate(() => {
      window.scrollBy(0, 800);
      const btns = Array.from(document.querySelectorAll('button'));
      btns.forEach(b => {
        const txt = (b.innerText || '').toLowerCase();
        if (txt.includes('see more') || txt.includes('show more')) b.click();
      });
    });
    await new Promise(r => setTimeout(r, 1200));

    const pageTitle = await page.title().catch(() => '');
    const title = await page.$eval('h1, .job-details-jobs-unified-top-card__job-title', el => el.innerText.trim()).catch(() => pageTitle.split('|')[0].trim());
    const company = await page.$eval('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name', el => el.innerText.trim()).catch(() => '');
    const location = await page.$eval('.job-details-jobs-unified-top-card__primary-description-container, .jobs-unified-top-card__primary-description', el => el.innerText.trim()).catch(() => '');

    const easyApplyBtn = await page.$(
      'button.jobs-apply-button[aria-label*="Easy Apply"], button.jobs-apply-button:has-text("Easy Apply"), button:has-text("Easy Apply")'
    );
    const isEasyApply = Boolean(easyApplyBtn);

    const jdText = await page.evaluate(extractJdFromDom);

    const result = {
      url,
      title,
      company,
      location,
      isEasyApply,
      jdLength: jdText.length,
      jdText
    };

    console.log(JSON.stringify(result, null, 2));
  } catch (err) {
    console.error(JSON.stringify({ error: err.message, url }));
  } finally {
    await context.close();
  }
}

main().catch(console.error);
