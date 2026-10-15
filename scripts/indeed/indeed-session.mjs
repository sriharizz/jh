#!/usr/bin/env node

/**
 * scripts/indeed/indeed-session.mjs
 *
 * Authenticated Session Manager & Browser Context for Indeed India (in.indeed.com)
 *
 * Capabilities:
 * 1. Dedicated Persistent Profile in data/indeed-profile
 * 2. Non-headless Playwright context configured for India locale (en-IN, Asia/Kolkata)
 * 3. Anti-bot flags and Cloudflare challenge detection
 * 4. Interactive login mode: node scripts/indeed/indeed-session.mjs login
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

export const DEFAULT_INDEED_PROFILE_DIR = resolve(ROOT_DIR, 'data/indeed-profile');
export const INDEED_HOME_URL = 'https://in.indeed.com';
export const INDEED_LOGIN_URL = 'https://secure.indeed.com/auth';

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
 * Launch or reuse the persistent browser context for Indeed.
 * @param {object} options
 * @param {string} [options.profileDir]
 * @param {boolean} [options.headless=false]
 * @returns {Promise<import('playwright').BrowserContext>}
 */
export async function createIndeedContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_INDEED_PROFILE_DIR;
  const headless = options.headless ?? false;

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    viewport: { width: 1280, height: 850 },
    userAgent: BROWSER_USER_AGENT,
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
 * Determine the authentication status of the given Indeed page.
 * @param {import('playwright').Page} page
 * @returns {Promise<{ status: 'authenticated'|'login_required'|'checkpoint'|'unknown', detail?: string }>}
 */
export async function evaluateIndeedAuthStatus(page) {
  const url = page.url();

  // 1. Bot challenge / Cloudflare checkpoint
  if (url.includes('challenge') || url.includes('captcha') || url.includes('blocked') || url.includes('cf-browser-verification')) {
    return {
      status: 'checkpoint',
      detail: 'Cloudflare / Security challenge detected.',
    };
  }

  // 2. Login or Auth screen
  if (url.includes('/auth') || url.includes('/account/login') || url.includes('/account/register')) {
    return {
      status: 'login_required',
      detail: 'Logged out — Indeed login screen is visible.',
    };
  }

  // 3. Authenticated DOM indicators or Cookies
  try {
    const cookies = await page.context().cookies();
    const hasAuthCookie = cookies.some((c) =>
      ['shst', 'surfer_token', 'indeed_rsh', 'ppuid', 'ia_sid', 'logged_in'].some((prefix) =>
        c.name.toLowerCase().includes(prefix)
      )
    );

    const hasWelcome = await page.$(
      'h1:has-text("Welcome"), h2:has-text("Welcome"), div:has-text("Welcome, Sri Hari"), span:has-text("Sri Hari"), [data-gnav-element-name="UserMenu"], button[aria-label*="account"], div.gnav-UserMenu, a[href*="/account"]'
    ).catch(() => null);

    const hasNav = await page.$(
      'nav.gnav, #gnav-main-container, a[data-gnav-element-name="FindJobs"], input#text-input-what, button:has-text("Find jobs")'
    ).catch(() => null);

    if (hasWelcome || (hasAuthCookie && hasNav)) {
      return {
        status: 'authenticated',
        detail: 'Active authenticated Indeed session verified.',
      };
    }

    if (!url.includes('/auth') && !url.includes('/account/login') && cookies.length > 3) {
      return {
        status: 'authenticated',
        detail: 'Active Indeed browser profile session confirmed.',
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
    console.log(' Indeed Authenticated Session Manager');
    console.log('======================================================');
    console.log(`Profile Dir: ${DEFAULT_INDEED_PROFILE_DIR}\n`);

    if (command === 'login') {
      console.log('1. Launching visible browser for Indeed login...');
      const context = await createIndeedContext({ headless: false });
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      console.log(`2. Navigating to ${INDEED_LOGIN_URL}...`);
      await page.goto(INDEED_LOGIN_URL, { waitUntil: 'domcontentloaded' });
      await sleep(2500);

      console.log('\n👉 PLEASE LOG IN TO INDEED DIRECTLY IN THE OPEN BROWSER WINDOW.');
      console.log('👉 Complete any Google login, OTP, or CAPTCHA requirements manually.');
      await askUser('\n👉 Once you see your Indeed home page, press [Enter] here to verify session: ');

      const auth = await evaluateIndeedAuthStatus(page);
      console.log(`\n• Auth Status: ${auth.status.toUpperCase()}`);
      console.log(`• Details:     ${auth.detail}`);

      if (auth.status === 'authenticated') {
        console.log('\n✅ Session saved successfully to data/indeed-profile!');
        console.log('You can now run Indeed job discovery and application assistance.');
      } else {
        console.warn('\n⚠️ Session could not be verified automatically. Check your browser state.');
      }

      await context.close();
      process.exit(0);
    } else {
      console.log('Checking current Indeed session...');
      const context = await createIndeedContext({ headless: true });
      const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      await page.goto(INDEED_HOME_URL, { waitUntil: 'domcontentloaded' });
      await sleep(2500);

      const auth = await evaluateIndeedAuthStatus(page);
      console.log(`• Status:  ${auth.status.toUpperCase()}`);
      console.log(`• Details: ${auth.detail}`);

      if (auth.status !== 'authenticated') {
        console.log('\n👉 To log in and save your session, run:');
        console.log('   node scripts/indeed/indeed-session.mjs login\n');
      } else {
        console.log('\n✅ Session is active and ready.\n');
      }

      await context.close();
      process.exit(0);
    }
  })();
}
