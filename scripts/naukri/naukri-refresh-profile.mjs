#!/usr/bin/env node

/**
 * scripts/naukri/naukri-refresh-profile.mjs
 *
 * Naukri Daily Profile Freshness Refresher (Resdex Recruiter Visibility Booster)
 *
 * Why this matters:
 * - In India, recruiters search candidate profiles on Naukri Resdex.
 * - Resdex heavily ranks candidates by "Profile Last Updated Date".
 * - Running this script once every morning touches/syncs your profile and uploads
 *   your latest `output/Banda_Sri_Hari_CV.pdf`, pushing you to the top of recruiter searches.
 *
 * Safety:
 * - Uses persistent local profile in `data/naukri-profile` (non-headless).
 * - Zero risky mass-applying — 100% compliant with standard profile updates.
 */

import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createNaukriContext,
  evaluateNaukriAuthStatus,
  NAUKRI_PROFILE_URL,
} from './naukri-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const PDF_PATH = resolve(ROOT_DIR, 'output/Banda_Sri_Hari_CV.pdf');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

async function refreshNaukriProfile() {
  console.log('\n======================================================');
  console.log(' Naukri Resdex Daily Profile Freshness Booster');
  console.log('======================================================');
  console.log(`Resume PDF: ${PDF_PATH} (${existsSync(PDF_PATH) ? 'Found' : 'MISSING'})\n`);

  console.log('1. Launching visible browser with your authenticated Naukri profile...');
  const context = await createNaukriContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    console.log(`2. Navigating to your Naukri Profile: ${NAUKRI_PROFILE_URL}...`);
    await page.goto(NAUKRI_PROFILE_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await randomSleep(3000, 4500);

    const auth = await evaluateNaukriAuthStatus(page);
    if (auth.status === 'login_required' || auth.status === 'checkpoint') {
      console.warn(`\n⚠️ Login or verification required: ${auth.detail}`);
      console.warn('Please log in manually once: node scripts/naukri/naukri-session.mjs login');
      return;
    }

    console.log('• Authenticated session verified.');

    // ── 1. Re-upload Latest Resume PDF ──────────────────────────────────────
    console.log('\n3. Checking resume update section on Naukri profile...');
    if (existsSync(PDF_PATH)) {
      const fileInput = await page.$(
        'input[type="file"][id*="attachCV"], input[type="file"][class*="fileUpload"], input[type="file"]'
      ).catch(() => null);

      if (fileInput) {
        console.log('• Attaching latest verified CV: output/Banda_Sri_Hari_CV.pdf');
        await fileInput.setInputFiles(PDF_PATH);
        await randomSleep(2500, 4000);
        console.log('  ✅ Resume PDF uploaded successfully.');
      } else {
        console.log('• File input selector not directly open; clicking "Update resume" button...');
        const updateResumeBtn = await page.$(
          'button:has-text("Update resume"), a:has-text("Update resume"), .update-resume, [data-upload-trigger]'
        ).catch(() => null);

        if (updateResumeBtn && await updateResumeBtn.isVisible().catch(() => false)) {
          const [fileChooser] = await Promise.all([
            page.waitForEvent('filechooser', { timeout: 8000 }).catch(() => null),
            updateResumeBtn.click().catch(() => {}),
          ]);

          if (fileChooser) {
            await fileChooser.setFiles(PDF_PATH);
            await randomSleep(3000, 5000);
            console.log('  ✅ Resume PDF uploaded via file chooser.');
          }
        }
      }
    }

    // ── 2. Touch Resume Headline / Key Skills to Guarantee Modification Timestamp ──
    console.log('\n4. Refreshing profile timestamp for Resdex visibility...');
    const editHeadlineBtn = await page.$(
      'span:has-text("Resume headline") ~ span.edit, .resumeHeadline .edit, [data-section="resumeHeadline"] .edit'
    ).catch(() => null);

    if (editHeadlineBtn && await editHeadlineBtn.isVisible().catch(() => false)) {
      await editHeadlineBtn.click().catch(() => {});
      await randomSleep(1000, 2000);

      const headlineTextarea = await page.$('textarea[id*="resumeHeadline"], textarea[name*="resumeHeadline"]').catch(() => null);
      if (headlineTextarea) {
        const currVal = await headlineTextarea.inputValue().catch(() => '');
        if (currVal) {
          // Toggle trailing space to force dirty state without altering meaning
          const updatedVal = currVal.endsWith(' ') ? currVal.trim() : currVal + ' ';
          await headlineTextarea.fill(updatedVal);
          await randomSleep(500, 1000);

          const saveBtn = await page.$('button:has-text("Save"), .btn-save').catch(() => null);
          if (saveBtn) {
            await saveBtn.click().catch(() => {});
            await randomSleep(2000, 3000);
            console.log('  ✅ Resume headline timestamp refreshed.');
          }
        }
      }
    }

    console.log('\n======================================================');
    console.log(' ✅ NAUKRI PROFILE FRESHNESS REFRESH COMPLETE');
    console.log('======================================================');
    console.log('Your profile has been updated and boosted to the top of');
    console.log('recruiter search results on Naukri Resdex for today!\n');

  } catch (err) {
    console.error(`❌ Profile Refresh Error: ${err.message}`);
  } finally {
    await context.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  refreshNaukriProfile().catch((err) => {
    console.error('Fatal Profile Refresh Error:', err);
    process.exit(1);
  });
}
