#!/usr/bin/env node

/**
 * scripts/naukri/naukri-session.mjs
 *
 * Authenticated Session Manager & Browser Context for Naukri.com
 *
 * Capabilities:
 * 1. Dedicated Persistent Profile in data/naukri-profile
 * 2. Safe session validation without storing passwords or credentials
 * 3. Anti-detection configurations and human-like viewport settings
 * 4. Interactive login mode: node scripts/naukri/naukri-session.mjs login
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

export const DEFAULT_NAUKRI_PROFILE_DIR = resolve(ROOT_DIR, 'data/naukri-profile');
export const NAUKRI_HOME_URL = 'https://www.naukri.com';
export const NAUKRI_LOGIN_URL = 'https://www.naukri.com/nlogin/login';
export const NAUKRI_PROFILE_URL = 'https://www.naukri.com/mnjuser/profile';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function askUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(query, (ans) => {
      rl.close();
      res(ans.trim());
    });
  });
}

/**
 * Launch or reuse the persistent browser context for Naukri.
 * @param {object} options
 * @param {string} [options.profileDir]
 * @param {boolean} [options.headless=false]
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createNaukriContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_NAUKRI_PROFILE_DIR;
  const headless = options.headless ?? false;

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless,
    viewport: { width: 1280, height: 850 },
    locale: 'en-IN',
    timezoneId: 'Asia/Kolkata',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
    ],
  });

  return context;
}

/**
 * Determine the authentication status of the given Naukri page.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ status: 'authenticated'|'login_required'|'checkpoint'|'unknown', detail?: string }>}
 */
export async function evaluateNaukriAuthStatus(page) {
  const url = page.url();

  // 1. CAPTCHA / Bot detection challenge
  if (url.includes('captcha') || url.includes('challenge') || url.includes('blocked') || url.includes('distil')) {
    return {
      status: 'checkpoint',
      detail: 'Verification challenge or CAPTCHA detected.',
    };
  }

  // 2. Login or Registration Screen
  if (url.includes('/nlogin/login') || url.includes('/registration/createAccount')) {
    return {
      status: 'login_required',
      detail: 'Logged out — Naukri login screen is visible.',
    };
  }

  // 3. Authenticated indicators in DOM or Cookies
  try {
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some((c) =>
      ['nauk_at', 'nauk_auth', 'user', 'isloggedin', 'nlogin', 'profile'].some((prefix) =>
        c.name.toLowerCase().includes(prefix)
      )
    );

    const hasUserDrawer = await page.$(
      '.nI-gNb-drawer, [data-user-type], .user-name, a[href*="/mnjuser/profile"], .nI-gNb-header__user-name, .view-profile-wrapper, a[title*="My Naukri"], div.user-info, .profile-name'
    ).catch(() => null);

    const hasGlobalNav = await page.$(
      '.nI-gNb-header, div.nI-gNb-menuItems, a[href*="/mnjuser/homepage"], a[href*="/job-listings"]'
    ).catch(() => null);

    if (hasUserDrawer || (hasAuthCookie && (hasGlobalNav || !url.includes('/nlogin/')))) {
      return {
        status: 'authenticated',
        detail: 'Active authenticated Naukri session verified.',
      };
    }

    if (!url.includes('/nlogin') && !url.includes('/registration') && cookies.length > 5) {
      return {
        status: 'authenticated',
        detail: 'Active Naukri browser profile session confirmed.',
      };
    }
  } catch {
    // fallback
  }

  return {
    status: 'unknown',
    detail: 'Could not definitively verify authentication state.',
  };
}


// ── Interactive CLI Login Helper ────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const command = process.argv[2] || 'status';

  (async () => {
    console.log('\n======================================================');
    console.log(' Naukri Authenticated Session Manager');
    console.log('======================================================');
    console.log(`Profile Dir: ${DEFAULT_NAUKRI_PROFILE_DIR}\n`);

    if (command === 'login') {
      console.log('1. Launching visible browser for Naukri login...');
      const context = await createNaukriContext({ headless: false });
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      console.log(`2. Navigating to ${NAUKRI_LOGIN_URL}...`);
      await page.goto(NAUKRI_LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await sleep(2000);

      console.log('\n👉 PLEASE LOG IN TO NAUKRI DIRECTLY IN THE OPEN BROWSER WINDOW.');
      console.log('👉 Complete any OTP, MFA, or CAPTCHA requirements manually.');
      await askUser('\n👉 Once you see your Naukri homepage / profile, press [Enter] here to verify session: ');

      const auth = await evaluateNaukriAuthStatus(page);
      console.log(`\n• Auth Status: ${auth.status.toUpperCase()}`);
      console.log(`• Details:     ${auth.detail}`);

      if (auth.status === 'authenticated') {
        console.log('\n✅ Session saved successfully to data/naukri-profile!');
        console.log('You can now run Naukri job discovery and application assistance.');
      } else {
        console.warn('\n⚠️ Session could not be verified automatically. Check your browser state.');
      }

      await context.close();
      process.exit(0);
    } else {
      console.log('Checking current Naukri session...');
      const context = await createNaukriContext({ headless: true });
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      await page.goto(NAUKRI_HOME_URL, { waitUntil: 'domcontentloaded' });
      await sleep(2500);

      const auth = await evaluateNaukriAuthStatus(page);
      console.log(`• Status:  ${auth.status.toUpperCase()}`);
      console.log(`• Details: ${auth.detail}`);

      if (auth.status !== 'authenticated') {
        console.log('\n👉 To log in and save your session, run:');
        console.log('   node scripts/naukri/naukri-session.mjs login\n');
      } else {
        console.log('\n✅ Session is active and ready.\n');
      }

      await context.close();
      process.exit(0);
    }
  })();
}
