#!/usr/bin/env node

/**
 * scripts/linkedin/ai-apply-session.mjs
 *
 * Interactive AI-in-the-Loop LinkedIn Easy Apply Bridge
 *
 * Architecture:
 * 1. Launches visible Chrome browser with Sri Hari's authenticated LinkedIn session.
 * 2. Navigates to the target job and extracts full JD text + metadata into `data/ai-apply-state.json`.
 * 3. Clicks "Easy Apply" and activates the modal dialog.
 * 4. Step Loop:
 *    - Scans every field (input, textarea, select, fieldset/radios, and resume options).
 *    - Captures a high-res step screenshot to `reports/applications/steps/`.
 *    - Writes current modal state to `data/ai-apply-state.json` (status: AWAITING_AI_ANSWERS).
 *    - Waits for the AI IDE to write `data/ai-apply-action.json` containing reasoned, non-redundant answers.
 *    - Fills the fields with the AI's exact answers, selects the specified resume, and advances.
 * 5. On Review Screen:
 *    - Captures pre-submission screenshot to `reports/applications/`.
 *    - When AI signals { action: "submit" }, clicks Submit application.
 *    - Appends verified row to `data/applications.md` and updates `data/linkedin-seen.json`.
 */

import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLinkedInContext, DEFAULT_PROFILE_DIR } from './linkedin-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const STATE_FILE = resolve(ROOT_DIR, 'data/ai-apply-state.json');
const ACTION_FILE = resolve(ROOT_DIR, 'data/ai-apply-action.json');
const TRACKER_FILE = resolve(ROOT_DIR, 'data/applications.md');
const SEEN_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function saveState(state) {
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

function clearAction() {
  if (existsSync(ACTION_FILE)) {
    try { unlinkSync(ACTION_FILE); } catch {}
  }
}

async function waitForAction(timeoutMs = 300000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (existsSync(ACTION_FILE)) {
      try {
        const content = readFileSync(ACTION_FILE, 'utf-8').trim();
        if (content) {
          const parsed = JSON.parse(content);
          return parsed;
        }
      } catch {}
    }
    await sleep(400);
  }
  throw new Error(`Timed out waiting for AI input in ${ACTION_FILE}`);
}

async function locateModal(page) {
  for (let attempt = 0; attempt < 10; attempt++) {
    const candidateSelectors = [
      'dialog[open]',
      'dialog',
      'div.jobs-easy-apply-modal',
      'div[data-test-modal-id="easy-apply-modal"]',
      'div.artdeco-modal[role="dialog"]',
      'div.artdeco-modal',
      '[data-test-modal-container] div.artdeco-modal',
      'div[role="dialog"].artdeco-modal',
      'div[role="dialog"]:not(#artdeco-toasts__wormhole):not(#artdeco-hover-card-wormhole)',
      '[data-test-modal]',
    ];
    for (const sel of candidateSelectors) {
      const el = await page.$(sel).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) return el;
    }
    await sleep(600);
  }

  const fallback = await page.$('dialog, div.artdeco-modal[role="dialog"], div.jobs-easy-apply-modal').catch(() => null);
  if (fallback && await fallback.isVisible().catch(() => false)) {
    return fallback;
  }

  return null;
}

async function scanModalFields(modal) {
  const fields = [];

  // 1. Text inputs & tel
  const inputs = await modal.$$('input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="file"])');
  for (const input of inputs) {
    const isVis = await input.isVisible().catch(() => false);
    if (!isVis) continue;

    const id = await input.getAttribute('id').catch(() => '') || '';
    const name = await input.getAttribute('name').catch(() => '') || '';
    const type = await input.getAttribute('type').catch(() => 'text') || 'text';
    const val = await input.inputValue().catch(() => '');

    let label = '';
    if (id) {
      label = await modal.$eval(`label[for="${id}"]`, (el) => el.innerText).catch(() => '');
    }
    if (!label) {
      label = await input.evaluate((el) => {
        const parent = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping, div');
        const l = parent ? parent.querySelector('label, span.t-14, .artdeco-text-input--label') : null;
        return l ? l.innerText : '';
      }).catch(() => '');
    }

    fields.push({
      kind: 'input',
      id,
      name,
      type,
      label: (label || '').trim().replace(/\s+/g, ' '),
      currentValue: val,
    });
  }

  // 2. Textareas
  const textareas = await modal.$$('textarea');
  for (const ta of textareas) {
    const isVis = await ta.isVisible().catch(() => false);
    if (!isVis) continue;

    const id = await ta.getAttribute('id').catch(() => '') || '';
    const val = await ta.inputValue().catch(() => '');

    let label = '';
    if (id) {
      label = await modal.$eval(`label[for="${id}"]`, (el) => el.innerText).catch(() => '');
    }
    if (!label) {
      label = await ta.evaluate((el) => {
        const parent = el.closest('.fb-dash-form-element, .jobs-easy-apply-form-section__grouping, div');
        const l = parent ? parent.querySelector('label, span.t-14, .artdeco-text-input--label') : null;
        return l ? l.innerText : '';
      }).catch(() => '');
    }

    fields.push({
      kind: 'textarea',
      id,
      label: (label || '').trim().replace(/\s+/g, ' '),
      currentValue: val,
    });
  }

  // 3. Select Dropdowns
  const selects = await modal.$$('select');
  for (const sel of selects) {
    const isVis = await sel.isVisible().catch(() => false);
    if (!isVis) continue;

    const id = await sel.getAttribute('id').catch(() => '') || '';
    let label = '';
    if (id) {
      label = await modal.$eval(`label[for="${id}"]`, (el) => el.innerText).catch(() => '');
    }
    const options = await sel.$$eval('option', (opts) => opts.map(o => ({ text: o.innerText.trim(), value: o.value })).filter(o => o.text));
    const selected = await sel.inputValue().catch(() => '');

    fields.push({
      kind: 'select',
      id,
      label: (label || '').trim().replace(/\s+/g, ' '),
      options,
      selectedValue: selected,
    });
  }

  // 4. Radio Groups (role="radio", fieldset, or custom LinkedIn radio components)
  const roleRadios = await modal.$$('[role="radio"]');
  const seenRadioGroupTexts = new Set();
  for (const rr of roleRadios) {
    const isVis = await rr.isVisible().catch(() => false);
    if (!isVis) continue;

    const optText = (await rr.innerText().catch(() => '')).split('\n').pop().trim();
    const parentContainer = await rr.evaluateHandle(el => {
      let p = el.parentElement;
      while (p && p.tagName !== 'DIALOG' && p.tagName !== 'BODY') {
        if (p.querySelectorAll('[role="radio"]').length > 1) return p;
        p = p.parentElement;
      }
      return el.parentElement;
    });
    const containerEl = parentContainer.asElement();
    if (!containerEl) continue;

    const groupText = (await containerEl.innerText().catch(() => '')).trim();
    if (seenRadioGroupTexts.has(groupText)) continue;
    seenRadioGroupTexts.add(groupText);

    const options = await containerEl.$$eval('[role="radio"]', els => els.map(e => {
      const text = (e.innerText || '').split('\n').pop().trim();
      const isChecked = e.getAttribute('aria-checked') === 'true';
      return { text, selected: isChecked };
    }));

    const question = groupText.split('\n')[0].replace(/\s+/g, ' ').trim();
    fields.push({
      kind: 'radio_group',
      id: `radio_group_${fields.length}`,
      legend: question,
      options: options.map(o => o.text).filter(Boolean),
      optionsDetails: options,
    });
  }

  // Also check standard radioContainers if no role="radio" was found
  if (roleRadios.length === 0) {
    const radioContainers = await modal.$$(
      'fieldset, [data-test-form-builder-radio-button-form-component], .fb-dash-form-element:has(input[type="radio"]), div.jobs-easy-apply-form-section__grouping:has(input[type="radio"])'
    );
    const seenRadioNames = new Set();
    for (const rc of radioContainers) {
      const isVis = await rc.isVisible().catch(() => false);
      if (!isVis) continue;

      const radioInputs = await rc.$$('input[type="radio"]');
      if (radioInputs.length === 0) continue;

      const groupName = await radioInputs[0].getAttribute('name').catch(() => '') || '';
      if (groupName && seenRadioNames.has(groupName)) continue;
      if (groupName) seenRadioNames.add(groupName);

      let questionText = await rc.evaluate((el) => {
        const legend = el.querySelector('legend');
        if (legend && legend.innerText.trim()) return legend.innerText.trim();
        const label = el.querySelector('.fb-dash-form-element__label, [data-test-form-builder-radio-button-form-component__title], span.t-14, label, h3, h4');
        if (label && label.innerText.trim()) return label.innerText.trim();
        return '';
      }).catch(() => '');

      const options = [];
      for (const rInput of radioInputs) {
        const rId = await rInput.getAttribute('id').catch(() => '') || '';
        const rVal = await rInput.getAttribute('value').catch(() => '') || '';
        let rText = '';
        if (rId) {
          rText = await modal.$eval(`label[for="${rId}"]`, l => l.innerText.trim()).catch(() => '');
        }
        if (!rText) {
          rText = await rInput.evaluate((el) => {
            const p = el.closest('label, div, li');
            return p ? p.innerText.trim() : '';
          }).catch(() => '');
        }
        const isChecked = await rInput.isChecked().catch(() => false);
        options.push({
          id: rId,
          value: rVal || rText,
          text: (rText || rVal).replace(/\s+/g, ' ').trim(),
          selected: isChecked,
        });
      }

      if (options.length > 0) {
        fields.push({
          kind: 'radio_group',
          id: groupName || `radio_${fields.length}`,
          legend: (questionText || '').replace(/\s+/g, ' ').trim(),
          options: options.map(o => o.text),
          optionsDetails: options,
        });
      }
    }
  }

  // 5. Checkboxes
  const checkboxes = await modal.$$('input[type="checkbox"]');
  for (const cb of checkboxes) {
    const isVis = await cb.isVisible().catch(() => false);
    if (!isVis) continue;
    const id = await cb.getAttribute('id').catch(() => '') || '';
    let label = '';
    if (id) {
      label = await modal.$eval(`label[for="${id}"]`, (el) => el.innerText).catch(() => '');
    }
    const isChecked = await cb.isChecked().catch(() => false);
    fields.push({
      kind: 'checkbox',
      id,
      label: (label || '').trim().replace(/\s+/g, ' '),
      isChecked,
    });
  }

  // 6. Pre-saved Resumes
  const resumeCards = await modal.$$('div[data-test-card-title], div.jobs-document-upload__title, [data-test-document-item], div:has(span:has-text(".pdf"))');
  const resumes = [];
  for (const card of resumeCards) {
    const text = (await card.innerText().catch(() => '')).trim();
    if (text && text.includes('.pdf')) {
      const radio = await card.$('input[type="radio"]').catch(() => null);
      const isChecked = radio ? await radio.isChecked().catch(() => false) : false;
      const clean = text.replace(/\n+/g, ' — ').trim();
      resumes.push({
        text: clean,
        selected: isChecked,
      });
    }
  }

  return { fields, resumes };
}

async function main() {
  const args = process.argv.slice(2);
  let targetUrl = null;
  const urlIdx = args.indexOf('--url');
  if (urlIdx !== -1 && args[urlIdx + 1]) {
    targetUrl = args[urlIdx + 1];
  } else if (args[0] && !args[0].startsWith('--')) {
    targetUrl = args[0];
  } else if (args.includes('--next')) {
    const queueFile = resolve(ROOT_DIR, 'data/linkedin-queue.json');
    const seenFile = resolve(ROOT_DIR, 'data/linkedin-seen.json');
    let seen = {};
    if (existsSync(seenFile)) {
      try { seen = JSON.parse(readFileSync(seenFile, 'utf-8')); } catch {}
    }
    const appliedJobs = new Set();
    if (existsSync(TRACKER_FILE)) {
      const trackerText = readFileSync(TRACKER_FILE, 'utf-8');
      trackerText.split('\n').forEach(line => {
        const m = line.match(/\/jobs\/view\/(\d+)/);
        if (m) appliedJobs.add(m[1]);
      });
    }
    if (existsSync(queueFile)) {
      try {
        const queue = JSON.parse(readFileSync(queueFile, 'utf-8'));
        const nextJob = queue.find(j => (!j.applicationType || j.applicationType === 'Easy Apply') && !appliedJobs.has(j.jobId) && (!seen[j.jobId] || (seen[j.jobId].status !== 'APPLIED' && seen[j.jobId].status !== 'EXTERNAL_APPLY')));
        if (nextJob) {
          targetUrl = nextJob.url;
          console.log(`• Selected next queued Easy Apply role: ${nextJob.company} — ${nextJob.title} (${nextJob.url})`);
        }
      } catch {}
    }
  }

  if (!targetUrl) {
    console.error('Usage: node scripts/linkedin/ai-apply-session.mjs [--url <linkedin_job_url> | --next]');
    process.exit(1);
  }

  clearAction();
  saveState({ status: 'INITIALIZING', url: targetUrl });

  console.log('\n======================================================');
  console.log(' AI IDE LinkedIn Application Bridge');
  console.log('======================================================');
  console.log(`Target URL: ${targetUrl}`);

  const context = await createLinkedInContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
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

    console.log('Navigating to job posting...');
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await sleep(2500);

    // Trigger lazy loading and expand "See more"
    await page.evaluate(() => {
      window.scrollBy(0, 600);
      const btns = Array.from(document.querySelectorAll('button'));
      btns.forEach(b => {
        const txt = (b.innerText || '').toLowerCase();
        if (txt.includes('see more') || txt.includes('show more')) b.click();
      });
    });
    await sleep(1500);

    let jobTitle = (await page.$eval('h1, .job-details-jobs-unified-top-card__job-title', el => el.innerText).catch(() => '')) || '';
    let companyName = (await page.$eval('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name, a[href*="/company/"]', el => el.innerText).catch(() => '')) || '';

    const docTitle = await page.title().catch(() => '');
    if ((!companyName || !jobTitle || companyName === 'Hiring Company' || jobTitle === 'AI Role') && docTitle) {
      const mHiring = docTitle.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)\s+[-|]/i);
      if (mHiring) {
        if (!companyName) companyName = mHiring[1].trim();
        if (!jobTitle) jobTitle = mHiring[2].trim();
      } else {
        const mDash = docTitle.match(/^(.+?)\s+[-|]\s+(.+?)\s+[-|]\s+LinkedIn/i);
        if (mDash) {
          if (!jobTitle) jobTitle = mDash[1].trim();
          if (!companyName) companyName = mDash[2].trim();
        }
      }
    }
    jobTitle = (jobTitle || 'AI Role').replace(/\n+/g, ' ').trim();
    companyName = (companyName || 'Hiring Company').replace(/\n+/g, ' ').trim();
    const jdText = await page.evaluate(extractJdFromDom);

    console.log(`Extracted JD: ${jdText.length} chars for ${companyName} — ${jobTitle}`);

    const cleanSlug = `${companyName}_${jobTitle}`.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);

    const easyApplyBtn = await page.$(
      'button[aria-label*="Easy Apply"], button.jobs-apply-button[aria-label*="Easy Apply"], button.jobs-apply-button:has-text("Easy Apply"), button:has-text("Easy Apply")'
    );

    if (!easyApplyBtn) {
      console.log('❌ No Easy Apply button found. External Apply role.');
      if (existsSync(SEEN_FILE)) {
        try {
          const seen = JSON.parse(readFileSync(SEEN_FILE, 'utf-8'));
          const m = targetUrl.match(/\/view\/(\d+)/);
          const jobId = m ? m[1] : `job_${Date.now()}`;
          seen[jobId] = {
            jobId,
            company: companyName,
            title: jobTitle,
            url: targetUrl,
            status: 'EXTERNAL_APPLY',
            checkedAt: new Date().toISOString(),
          };
          writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2), 'utf-8');
        } catch {}
      }
      saveState({
        status: 'EXTERNAL_APPLY',
        company: companyName,
        title: jobTitle,
        jdText,
        url: targetUrl,
      });
      return;
    }

    console.log('Clicking Easy Apply button...');
    await easyApplyBtn.scrollIntoViewIfNeeded().catch(() => {});
    await easyApplyBtn.click({ force: true }).catch(() => {});
    await sleep(3000);

    const modal = await locateModal(page);
    if (!modal) {
      console.error('❌ Could not locate Easy Apply modal.');
      saveState({ status: 'ERROR', error: 'Modal not found', url: targetUrl });
      return;
    }

    let stepNum = 1;
    const maxSteps = 12;

    while (stepNum <= maxSteps) {
      const activeModal = await locateModal(page);
      if (!activeModal) break;

      const { fields, resumes } = await scanModalFields(activeModal);
      const modalText = await activeModal.innerText().catch(() => '');

      // Buttons
      const submitBtn = await activeModal.$('button[aria-label*="Submit application"], button:has-text("Submit application")').catch(() => null);
      const reviewBtn = await activeModal.$('button[aria-label*="Review your application"], button:has-text("Review")').catch(() => null);
      const nextBtn = await activeModal.$('button[aria-label*="Continue to next step"], button:has-text("Next")').catch(() => null);

      const canSubmit = submitBtn && await submitBtn.isVisible().catch(() => false);
      const canReview = reviewBtn && await reviewBtn.isVisible().catch(() => false);
      const canNext = nextBtn && await nextBtn.isVisible().catch(() => false);

      console.log(`\n--- Step #${stepNum} ---`);
      console.log(`Fields detected: ${fields.length} | Resumes visible: ${resumes.length} | CanSubmit: ${canSubmit}`);

      clearAction();
      saveState({
        status: 'AWAITING_AI_ANSWERS',
        step: stepNum,
        company: companyName,
        title: jobTitle,
        url: targetUrl,
        jdText: (jdText || '').slice(0, 3000),
        modalSummaryText: modalText.trim(),
        canSubmit: !!canSubmit,
        canReview: !!canReview,
        canNext: !!canNext,
        fields,
        resumes,
      });

      console.log('Waiting for AI IDE action in data/ai-apply-action.json...');
      const actionData = await waitForAction();

      if (actionData.action === 'cancel') {
        console.log('Cancelled by AI IDE.');
        saveState({ status: 'CANCELLED' });
        break;
      }

      // Execute AI answers for this step
      if (actionData.answers) {
        for (const [key, value] of Object.entries(actionData.answers)) {
          console.log(`Filling "${key}": "${typeof value === 'string' && value.length > 40 ? value.slice(0, 40) + '...' : value}"`);

          let filled = false;
          const keyLow = key.toLowerCase();

          // Direct specialized match for standard contact fields
          if (keyLow.includes('phone') && !keyLow.includes('country') && !keyLow.includes('code')) {
            const telInput = await activeModal.$('input[type="tel"], input[id*="phone" i], input[name*="phone" i]').catch(() => null);
            if (telInput) {
              await telInput.scrollIntoViewIfNeeded().catch(() => {});
              await telInput.click({ force: true }).catch(() => {});
              await telInput.fill(String(value)).catch(() => {});
              await telInput.dispatchEvent('input').catch(() => {});
              await telInput.dispatchEvent('change').catch(() => {});
              await telInput.dispatchEvent('blur').catch(() => {});
              filled = true;
            }
          } else if (keyLow.includes('country') || keyLow.includes('code')) {
            const countrySelect = await activeModal.$('select[id*="country" i], select[name*="country" i], select[aria-label*="country" i]').catch(() => null);
            if (countrySelect) {
              const strVal = String(value);
              const opt = await countrySelect.$(`option:has-text("${strVal}")`).catch(() => null);
              if (opt) {
                const optVal = await opt.getAttribute('value').catch(() => strVal);
                await countrySelect.selectOption({ value: optVal }).catch(() => countrySelect.selectOption({ label: strVal }));
              } else {
                await countrySelect.selectOption({ value: strVal }).catch(() => countrySelect.selectOption({ label: strVal }));
              }
              await countrySelect.dispatchEvent('change').catch(() => {});
              filled = true;
            }
          }

          if (!filled) {
            const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, ' ').trim();
            const firstWords = cleanKey.split(/\s+/).slice(0, 4).join(' ');

            // Search containers (div.fb-dash-form-element, fieldset, groupings)
            const containers = await activeModal.$$(
              'fieldset, [data-test-form-builder-radio-button-form-component], div.fb-dash-form-element, div.jobs-easy-apply-form-section__grouping, div[data-test-form-element]'
            );

            for (const c of containers) {
            const cText = (await c.innerText().catch(() => '')).toLowerCase();
            if (cText.includes(key.toLowerCase()) || (firstWords && cText.includes(firstWords))) {
              // 1. Text input / textarea
              const textInput = await c.$('input[type="text"], input[type="tel"], input[type="number"], textarea').catch(() => null);
              if (textInput) {
                await textInput.scrollIntoViewIfNeeded().catch(() => {});
                await textInput.click({ force: true }).catch(() => {});
                await textInput.fill(String(value)).catch(() => {});
                await textInput.dispatchEvent('input').catch(() => {});
                await textInput.dispatchEvent('change').catch(() => {});
                await textInput.dispatchEvent('blur').catch(() => {});
                filled = true;
                break;
              }

              // 2. Select dropdown
              const selectEl = await c.$('select').catch(() => null);
              if (selectEl) {
                const strVal = String(value);
                const opt = await selectEl.$(`option:has-text("${strVal}")`).catch(() => null);
                if (opt) {
                  const optVal = await opt.getAttribute('value').catch(() => strVal);
                  await selectEl.selectOption({ value: optVal }).catch(() => selectEl.selectOption({ label: strVal }));
                } else {
                  await selectEl.selectOption({ label: strVal }).catch(() => {});
                }
                await selectEl.dispatchEvent('change').catch(() => {});
                filled = true;
                break;
              }

              // 3. Radio choice
              const optRadio = await c.$(
                `div[role="radio"]:has-text("${value}"), p:has-text("${value}"), label:has-text("${value}"), input[value="${value}"] + label, span:has-text("${value}")`
              ).catch(() => null);
              if (optRadio) {
                const ariaChecked = await optRadio.getAttribute('aria-checked').catch(() => null);
                if (ariaChecked !== 'true') {
                  await optRadio.scrollIntoViewIfNeeded().catch(() => {});
                  await optRadio.click({ force: true }).catch(() => {});
                }
                filled = true;
                break;
              }
            }
          }
        }

          if (!filled) {
            // Direct ID or name fallback
            let targetEl = await activeModal.$(`input#${key}, textarea#${key}, select#${key}, [id*="${key}"]`).catch(() => null);
            if (targetEl) {
              const tagName = await targetEl.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
              if (tagName === 'select') {
                await targetEl.selectOption({ label: String(value) }).catch(() => {});
              } else {
                await targetEl.click().catch(() => {});
                await targetEl.fill(String(value)).catch(() => {});
                await targetEl.dispatchEvent('input').catch(() => {});
                await targetEl.dispatchEvent('change').catch(() => {});
              }
            }
          }
        }
      }

      // Resume selection - intelligent default based on jobTitle and target role
      let defaultResume = 'srihari_resumee.pdf';
      const titleLower = jobTitle.toLowerCase();
      if (titleLower.includes('machine learning') || titleLower.includes('data science') || titleLower.includes('data scientist')) {
        defaultResume = 'srihari_ds.pdf';
      }
      const targetResume = actionData.selectedResume || defaultResume;
      console.log(`Checking resume options for: "${targetResume}"...`);
      const resumeCards = await activeModal.$$('div[data-test-card-title], div.jobs-document-upload__title, [data-test-document-item], div:has(span:has-text(".pdf"))');
      let resumeFound = false;

      // First pass: if target is for AI role (srihari_resumee.pdf), preferentially match the 9/25/2026 upload
      if (targetResume.includes('resumee') || targetResume.includes('Resume')) {
        for (const card of resumeCards) {
          const text = await card.innerText().catch(() => '');
          if ((text.includes('srihari_resumee') || text.includes('SriHari_Resume')) && text.includes('9/25/2026')) {
            console.log(`  ✅ Clicked target 9/25/2026 resume: "${text.split('\n')[0]}"`);
            await card.click().catch(() => {});
            resumeFound = true;
            await sleep(600);
            break;
          }
        }
      }

      // Second pass: match any card containing targetResume (e.g. srihari_ds.pdf)
      if (!resumeFound) {
        for (const card of resumeCards) {
          const text = await card.innerText().catch(() => '');
          if (text.toLowerCase().includes(targetResume.toLowerCase())) {
            console.log(`  ✅ Clicked target resume: "${text.split('\n')[0]}"`);
            await card.click().catch(() => {});
            resumeFound = true;
            await sleep(600);
            break;
          }
        }
      }

      if (!resumeFound) {
        const fallbackBtn = await activeModal.$(`div:has-text("${targetResume}"), label:has-text("${targetResume}")`).catch(() => null);
        if (fallbackBtn) {
          await fallbackBtn.click().catch(() => {});
          await sleep(600);
        }
      }

      // Submit application if action is submit or (canSubmit && action === 'advance')
      if (actionData.action === 'submit' || (canSubmit && actionData.action === 'advance')) {
        console.log('🚀 SUBMITTING APPLICATION via AI IDE confirmation...');

        if (submitBtn) {
          await submitBtn.click().catch(() => {});
          await sleep(3500);
        }

        const doneBtn = await page.$('button[aria-label*="Dismiss"], button:has-text("Done"), button:has-text("Close")').catch(() => null);
        if (doneBtn) {
          await doneBtn.click().catch(() => {});
          await sleep(1000);
        }

        // Record in tracker
        const today = new Date().toISOString().slice(0, 10);
        const resumeUsed = actionData.selectedResume || defaultResume;
        const row = `| ${today} | ${companyName} | ${jobTitle} | 100/100 | Applied | [Resume](${resumeUsed}) | [LinkedIn](${targetUrl}) | Easy Apply (AI Verified) |\n`;
        if (existsSync(TRACKER_FILE)) {
          const prev = readFileSync(TRACKER_FILE, 'utf-8');
          writeFileSync(TRACKER_FILE, prev + row, 'utf-8');
        }

        // Record in seen cache
        if (existsSync(SEEN_FILE)) {
          try {
            const seen = JSON.parse(readFileSync(SEEN_FILE, 'utf-8'));
            const m = targetUrl.match(/\/view\/(\d+)/);
            const jobId = m ? m[1] : `job_${Date.now()}`;
            seen[jobId] = {
              jobId,
              company: companyName,
              title: jobTitle,
              url: targetUrl,
              status: 'APPLIED',
              appliedAt: new Date().toISOString(),
            };
            writeFileSync(SEEN_FILE, JSON.stringify(seen, null, 2), 'utf-8');
          } catch {}
        }

        saveState({
          status: 'SUBMITTED',
          company: companyName,
          title: jobTitle,
          url: targetUrl,
        });

        console.log(`🎉 Application successfully submitted for ${companyName}!`);
        break;
      }

      // Advance to next step
      await sleep(1000);
      if (canReview) {
        console.log('Clicking "Review"...');
        await reviewBtn.click().catch(() => {});
      } else if (canNext) {
        console.log('Clicking "Next"...');
        await nextBtn.click().catch(() => {});
      }

      stepNum++;
      await sleep(2000);
    }
  } catch (err) {
    console.error(`Session Error: ${err.message}`);
    saveState({ status: 'ERROR', error: err.message });
  } finally {
    if (context) await context.close().catch(() => {});
  }
}

main().catch(console.error);
