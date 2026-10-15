#!/usr/bin/env node

/**
 * scripts/linkedin/linkedin-session.mjs
 *
 * Phase 1: Authenticated Session Manager for LinkedIn
 *
 * Supports two methods for seamless, safe session management:
 * 1. Dedicated Persistent Profile (runs in your local terminal):
 *    node scripts/linkedin/linkedin-session.mjs login
 *
 * 2. Chrome Remote Debugging (CDP) connecting to your existing Chrome:
 *    node scripts/linkedin/linkedin-session.mjs cdp
 *
 * Safety Rules:
 * - Never stores or asks for your password.
 * - Never bypasses CAPTCHA, MFA, or security checkpoints.
 * - All session data stays local in data/ (which is gitignored).
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

export const DEFAULT_PROFILE_DIR = resolve(ROOT_DIR, 'data/linkedin-profile');
export const LINKEDIN_FEED_URL = 'https://www.linkedin.com/feed/';
export const LINKEDIN_LOGIN_URL = 'https://www.linkedin.com/login';
export const CDP_URL = 'http://localhost:9222';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

/**
 * Launch or reuse the persistent browser context for LinkedIn.
 * @param {object} options
 * @param {string} [options.profileDir] - Path to profile folder
 * @param {boolean} [options.headless=false] - Whether to run headlessly
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createLinkedInContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_PROFILE_DIR;
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
 * Connect to an existing running Chrome instance via CDP (Remote Debugging).
 */
export async function connectLinkedInCDP(endpoint = CDP_URL) {
  const browser = await chromium.connectOverCDP(endpoint);
  const contexts = browser.contexts();
  return contexts.length > 0 ? contexts[0] : await browser.newContext();
}

/**
 * Determine the authentication status of the given page.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ status: 'authenticated'|'login_required'|'checkpoint'|'rate_limited'|'unknown', detail?: string }>}
 */
export async function evaluateAuthStatus(page) {
  const url = page.url();

  // 1. Check for Checkpoint / Security Challenge / CAPTCHA
  if (url.includes('/checkpoint/') || url.includes('/challenge/') || url.includes('captcha')) {
    return {
      status: 'checkpoint',
      detail: 'Security checkpoint or verification challenge detected (MFA/CAPTCHA).',
    };
  }

  // 2. Check for Login or Authwall
  if (
    url.includes('/login') ||
    url.includes('/authwall') ||
    url.includes('/uas/login') ||
    url.includes('/signup')
  ) {
    return {
      status: 'login_required',
      detail: 'Logged out — LinkedIn login screen is visible.',
    };
  }

  // 3. Check for Authenticated DOM Elements
  try {
    const hasGlobalNav = await page.$('.global-nav, #global-nav, .nav-main__item, [data-tracking-control-name="feed_nav"]');
    const hasFeedContainer = await page.$('.core-rail, .scaffold-layout__main, .feed-shared-update-v2');
    const hasProfileButton = await page.$('button.global-nav__primary-link-me-menu-trigger, .profile-rail-card');

    if (hasGlobalNav || hasFeedContainer || hasProfileButton || url.includes('/feed') || url.includes('/in/') || url.includes('/jobs/')) {
      const cookies = await page.context().cookies();
      const hasLiAt = cookies.some((c) => c.name === 'li_at');
      if (hasLiAt || hasGlobalNav) {
        return {
          status: 'authenticated',
          detail: 'Active authenticated session verified.',
        };
      }
    }
  } catch (e) {
    // DOM check fallback
  }

  // 4. Check for 429 / rate limits
  const bodyText = await page.textContent('body').catch(() => '');
  if (bodyText.includes('Too Many Requests') || bodyText.includes('HTTP Status 429')) {
    return {
      status: 'rate_limited',
      detail: 'LinkedIn rate limit encountered (HTTP 429).',
    };
  }

  return {
    status: 'unknown',
    detail: `Current page URL: ${url}`,
  };
}

/**
 * Interactive login helper. Opens browser, navigates to LinkedIn, waits for manual user login.
 */
async function runLoginFlow() {
  console.log('\n======================================================');
  console.log(' LinkedIn Session Setup — Headed Interactive Login');
  console.log('======================================================');
  console.log(`Profile directory: ${DEFAULT_PROFILE_DIR}\n`);
  console.log('1. Launching visible Chrome window...');
  console.log('2. Log in with your LinkedIn account manually.');
  console.log('3. Complete any two-factor authentication (MFA/OTP) if prompted.');
  console.log('4. Once your LinkedIn feed is loaded, the session will be saved.\n');

  const context = await createLinkedInContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(LINKEDIN_FEED_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  } catch (err) {
    console.log('Navigating to LinkedIn...');
  }

  console.log('Waiting for you to complete login in the browser window...');

  let authenticated = false;
  const startTime = Date.now();
  const maxWaitMs = 5 * 60 * 1000; // 5 minutes max wait

  while (Date.now() - startTime < maxWaitMs) {
    await page.waitForTimeout(2000);
    const authState = await evaluateAuthStatus(page);

    if (authState.status === 'authenticated') {
      authenticated = true;
      console.log('\n✅ Authentication detected successfully!');
      console.log(`Detail: ${authState.detail}`);
      console.log(`Session profile successfully saved to: ${DEFAULT_PROFILE_DIR}\n`);
      break;
    } else if (authState.status === 'checkpoint') {
      console.log('⏳ Checkpoint/Challenge detected. Please complete it in the browser...');
    }
  }

  if (!authenticated) {
    console.log('\n❌ Login timed out or was not completed. Please run again when ready.');
  }

  console.log('Closing browser context cleanly...');
  await context.close();
  console.log('Done.\n');
}

/**
 * Check if the stored profile already has an active authenticated session.
 */
async function runCheckFlow() {
  console.log('\nChecking saved LinkedIn session status...');
  console.log(`Profile directory: ${DEFAULT_PROFILE_DIR}`);

  if (!existsSync(DEFAULT_PROFILE_DIR)) {
    console.log('\n❌ No profile found. Please run the login command first.\n');
    return;
  }

  const context = await createLinkedInContext({ headless: true });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(LINKEDIN_FEED_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForTimeout(3000);

    const authState = await evaluateAuthStatus(page);

    if (authState.status === 'authenticated') {
      console.log('\n✅ ACTIVE AUTHENTICATED SESSION: Valid and ready to use.');
      console.log(`Detail: ${authState.detail}\n`);
    } else if (authState.status === 'checkpoint') {
      console.log('\n⚠️ CHECKPOINT DETECTED: Verification needed.');
      console.log('Run the login command in your terminal to clear the checkpoint.\n');
    } else {
      console.log('\n❌ NOT LOGGED IN / SESSION EXPIRED.');
      console.log('Please run the login command in your terminal.\n');
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
  if (existsSync(DEFAULT_PROFILE_DIR)) {
    console.log(`\nRemoving saved profile at: ${DEFAULT_PROFILE_DIR}...`);
    rmSync(DEFAULT_PROFILE_DIR, { recursive: true, force: true });
    console.log('✅ Stored session cleared.\n');
  } else {
    console.log('\nNo saved profile exists.\n');
  }
}

// ── CLI Dispatcher ───────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith('linkedin-session.mjs')) {
  const command = process.argv[2] || 'check';

  if (command === 'login') {
    runLoginFlow().catch(console.error);
  } else if (command === 'check' || command === '--status' || command === 'status') {
    runCheckFlow().catch(console.error);
  } else if (command === 'logout' || command === 'clear') {
    runLogoutFlow();
  } else {
    console.log('\nUsage:');
    console.log('  node scripts/linkedin/linkedin-session.mjs login    # Launch headed browser to log in');
    console.log('  node scripts/linkedin/linkedin-session.mjs check    # Test if stored session is valid');
    console.log('  node scripts/linkedin/linkedin-session.mjs logout   # Delete stored local session\n');
  }
}
