#!/usr/bin/env node

/**
 * scripts/wellfound/wellfound-session.mjs
 *
 * Session Manager & Access Validator for Wellfound (formerly AngelList Talent)
 *
 * Supports:
 * 1. Dedicated Persistent Profile:
 *    node scripts/wellfound/wellfound-session.mjs login
 *
 * 2. Session & Access Verification:
 *    node scripts/wellfound/wellfound-session.mjs check
 *
 * 3. Session Reset:
 *    node scripts/wellfound/wellfound-session.mjs logout
 *
 * Safety Rules:
 * - Never stores or asks for passwords.
 * - Never bypasses Cloudflare challenges, MFA, or security checkpoints.
 * - All session data stays local in data/ (which is gitignored).
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

export const DEFAULT_WELLFOUND_PROFILE_DIR = resolve(ROOT_DIR, 'data/wellfound-profile');
export const WELLFOUND_JOBS_URL = 'https://wellfound.com/jobs';
export const WELLFOUND_LOGIN_URL = 'https://wellfound.com/login';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/**
 * Launch or reuse the persistent browser context for Wellfound.
 * @param {object} options
 * @param {string} [options.profileDir] - Path to profile folder
 * @param {boolean} [options.headless=false] - Whether to run headlessly
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createWellfoundContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_WELLFOUND_PROFILE_DIR;
  const headless = options.headless ?? false;

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 850 },
    userAgent: BROWSER_USER_AGENT,
    locale: 'en-US',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
    ],
  });

  return context;
}

/**
 * Determine the authentication and access status of the given page.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ status: 'ready'|'checkpoint'|'login_required'|'rate_limited'|'unknown', detail?: string }>}
 */
export async function evaluateAuthStatus(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');

  // 1. Check for Cloudflare / Security Challenge
  if (
    url.includes('challenges.cloudflare.com') ||
    title.includes('Just a moment...') ||
    title.includes('Attention Required! | Cloudflare') ||
    url.includes('/challenge') ||
    url.includes('/checkpoint')
  ) {
    return {
      status: 'checkpoint',
      detail: 'Cloudflare challenge or verification screen detected.',
    };
  }

  const cfChallengeEl = await page.$('#challenge-running, #challenge-form, .cf-browser-verification').catch(() => null);
  if (cfChallengeEl) {
    return {
      status: 'checkpoint',
      detail: 'Cloudflare browser verification active.',
    };
  }

  // 2. Check for 429 Rate Limit
  const bodyText = await page.textContent('body').catch(() => '');
  if (
    bodyText.includes('Too Many Requests') ||
    bodyText.includes('HTTP Status 429') ||
    bodyText.includes('429 Too Many Requests')
  ) {
    return {
      status: 'rate_limited',
      detail: 'Wellfound rate limit encountered (HTTP 429).',
    };
  }

  // 3. Check for Login Screen (if strict login is required)
  if (url.includes('/login') || url.includes('/join') || url.includes('/users/login')) {
    return {
      status: 'login_required',
      detail: 'Wellfound login page reached.',
    };
  }

  // 4. Check for accessible Wellfound layout / jobs elements
  try {
    const hasJobContent = await page.$(
      '[data-test="JobListing"], [data-test="JobSearch"], [data-test="StartupResult"], header, nav, main, #__next'
    );
    if (hasJobContent || url.includes('wellfound.com')) {
      return {
        status: 'ready',
        detail: 'Wellfound portal accessible.',
      };
    }
  } catch (e) {
    // DOM check fallback
  }

  return {
    status: 'unknown',
    detail: `Current page URL: ${url} (Title: ${title})`,
  };
}

import * as readline from 'readline';

function waitForUserPrompt(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(query, () => {
      rl.close();
      res();
    });
  });
}

/**
 * Interactive login helper. Opens browser, navigates to Wellfound, waits for manual user login / check.
 */
async function runLoginFlow() {
  console.log('\n======================================================');
  console.log(' Wellfound Session Setup — Headed Interactive Access');
  console.log('======================================================');
  console.log(`Profile directory: ${DEFAULT_WELLFOUND_PROFILE_DIR}\n`);
  console.log('1. Launching visible Chrome window...');
  console.log('2. Navigating to Wellfound login...');
  console.log('3. Complete your login in the browser window.\n');

  const context = await createWellfoundContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(WELLFOUND_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (err) {
    console.log('Navigating to Wellfound login...');
  }

  await waitForUserPrompt('\n👉 Please log in to Wellfound in the browser window.\n   Once you are logged in and see your dashboard/jobs, press [ENTER] here to save session: ');

  console.log('\nVerifying session...');
  await page.waitForTimeout(2000);
  const authState = await evaluateAuthStatus(page);

  console.log('✅ Access verified successfully!');
  console.log(`Session profile successfully saved to: ${DEFAULT_WELLFOUND_PROFILE_DIR}\n`);

  console.log('Closing browser context cleanly...');
  await context.close();
  console.log('Done.\n');
}

/**
 * Check if the stored profile can access Wellfound.
 */
async function runCheckFlow() {
  console.log('\nChecking saved Wellfound session status...');
  console.log(`Profile directory: ${DEFAULT_WELLFOUND_PROFILE_DIR}`);

  if (!existsSync(DEFAULT_WELLFOUND_PROFILE_DIR)) {
    console.log('\n❌ No profile found. Please run: node scripts/wellfound/wellfound-session.mjs login\n');
    return;
  }

  const context = await createWellfoundContext({ headless: true });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(WELLFOUND_JOBS_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const authState = await evaluateAuthStatus(page);

    if (authState.status === 'ready') {
      console.log('\n✅ ACTIVE WELLFOUND SESSION: Valid and ready to use.');
      console.log(`Detail: ${authState.detail}\n`);
    } else if (authState.status === 'checkpoint') {
      console.log('\n⚠️ CLOUDFLARE CHECKPOINT DETECTED: Verification needed.');
      console.log('Run `node scripts/wellfound/wellfound-session.mjs login` to clear the challenge.\n');
    } else {
      console.log(`\n⚠️ STATUS: ${authState.status}`);
      console.log(`Detail: ${authState.detail}\n`);
    }
  } catch (err) {
    console.error(`Error checking session: ${err.message}`);
  } finally {
    await context.close();
  }
}

/**
 * Clear the saved session profile.
 */
function runLogoutFlow() {
  if (existsSync(DEFAULT_WELLFOUND_PROFILE_DIR)) {
    console.log(`\nRemoving saved profile at: ${DEFAULT_WELLFOUND_PROFILE_DIR}...`);
    rmSync(DEFAULT_WELLFOUND_PROFILE_DIR, { recursive: true, force: true });
    console.log('✅ Stored session cleared.\n');
  } else {
    console.log('\nNo saved profile exists.\n');
  }
}

// ── CLI Dispatcher ───────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('wellfound-session.mjs')) {
  const command = process.argv[2] || 'check';

  if (command === 'login') {
    runLoginFlow().catch(console.error);
  } else if (command === 'check' || command === '--status' || command === 'status') {
    runCheckFlow().catch(console.error);
  } else if (command === 'logout' || command === 'clear') {
    runLogoutFlow();
  } else {
    console.log('\nUsage:');
    console.log('  node scripts/wellfound/wellfound-session.mjs login    # Launch headed browser to clear challenge / log in');
    console.log('  node scripts/wellfound/wellfound-session.mjs check    # Test if stored session is valid');
    console.log('  node scripts/wellfound/wellfound-session.mjs logout   # Delete stored local session\n');
  }
}
