import { createLinkedInContext, evaluateAuthStatus } from '../scripts/linkedin/linkedin-session.mjs';

const TARGET_URL = 'https://www.linkedin.com/jobs/view/4452243263/';

async function test() {
  console.log('1. Launching browser...');
  const context = await createLinkedInContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  console.log('2. Navigating...');
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
  await new Promise(r => setTimeout(r, 4000));

  console.log('3. Locating Easy Apply button...');
  const easyApplyBtn = await page.$(
    'button.jobs-apply-button[aria-label*="Easy Apply"], button.jobs-apply-button:has-text("Easy Apply"), button:has-text("Easy Apply")'
  );

  if (!easyApplyBtn) {
    console.log('❌ Easy Apply button not found');
    return;
  }

  console.log('4. Clicking Easy Apply button...');
  await easyApplyBtn.click();
  await new Promise(r => setTimeout(r, 4000));

  console.log('5. Inspecting all dialogs and modals in DOM...');
  const domDump = await page.evaluate(() => {
    const dialogs = Array.from(document.querySelectorAll('div[role="dialog"], [data-test-modal], .artdeco-modal, div.jobs-easy-apply-modal, div[aria-modal="true"], div[data-view-name*="job-application"], div[data-view-name*="easy-apply"], div:has(button)'));
    
    return dialogs.map((d, i) => ({
      index: i,
      tagName: d.tagName,
      role: d.getAttribute('role'),
      ariaModal: d.getAttribute('aria-modal'),
      className: d.className,
      id: d.id,
      textPreview: (d.innerText || '').slice(0, 150).replace(/\s+/g, ' '),
      hasInputs: d.querySelectorAll('input').length,
      buttons: Array.from(d.querySelectorAll('button')).map(b => b.innerText.trim() || b.getAttribute('aria-label') || '').filter(Boolean).slice(0, 5)
    })).filter(d => d.textPreview.includes('Apply') || d.textPreview.includes('Contact') || d.textPreview.includes('NURY') || d.hasInputs > 0);
  });

  console.log('DOM DUMP of Matched Elements:', JSON.stringify(domDump, null, 2));

  console.log('\nAll inputs currently in page:');
  const inputs = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      tagName: el.tagName,
      type: el.type,
      id: el.id,
      name: el.name,
      value: el.value,
      placeholder: el.placeholder,
      ariaLabel: el.getAttribute('aria-label'),
      parentText: (el.parentElement ? el.parentElement.innerText : '').slice(0, 80).replace(/\s+/g, ' ')
    }));
  });
  console.log('INPUTS DUMP:', JSON.stringify(inputs, null, 2));
}

test().catch(console.error);
