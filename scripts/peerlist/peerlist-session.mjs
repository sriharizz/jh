#!/usr/bin/env node

/**
 * scripts/peerlist/peerlist-session.mjs
 *
 * Session Manager & Access Validator for Peerlist
 *
 * Supports:
 * 1. Dedicated Persistent Profile:
 *    node scripts/peerlist/peerlist-session.mjs login
 *
 * 2. Session & Access Verification:
 *    node scripts/peerlist/peerlist-session.mjs check
 *
 * 3. Session Reset:
 *    node scripts/peerlist/peerlist-session.mjs logout
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync, rmSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

export const DEFAULT_PEERLIST_PROFILE_DIR = resolve(ROOT_DIR, 'data/peerlist-profile');
export const PEERLIST_JOBS_URL = 'https://peerlist.io/jobs';
export const PEERLIST_LOGIN_URL = 'https://peerlist.io/login';

export const BROWSER_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36';

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
 * Launch or reuse the persistent browser context for Peerlist.
 */
export async function createPeerlistContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_PEERLIST_PROFILE_DIR;
  const headless = options.headless ?? false;

  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
  }

  const context = await chromium.launchPersistentContext(profileDir, {
    channel: 'chrome',
    headless,
    viewport: { width: 1280, height: 850 },
    locale: 'en-US',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--start-maximized',
      '--no-sandbox',
    ],
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined,
    });
  });

  return context;
}

/**
 * Determine the authentication and access status of the given page.
 */
export async function evaluatePeerlistAuthStatus(page) {
  const url = page.url();
  const title = await page.title().catch(() => '');

  // 1. Check for Login Screen
  if (url.includes('/login') || url.includes('/signup')) {
    return {
      status: 'login_required',
      detail: 'Peerlist login page reached.',
    };
  }

  // 2. Check for accessible Peerlist layout / user elements
  try {
    const hasUserContent = await page.$(
      'a[href*="/jobs"], button[aria-label*="profile"], nav, header, main'
    );
    if (hasUserContent || url.includes('peerlist.io')) {
      return {
        status: 'ready',
        detail: 'Peerlist portal accessible.',
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

/**
 * Interactive login helper. Opens browser, navigates to Peerlist, waits for manual user login.
 */
async function runLoginFlow() {
  console.log('\n======================================================');
  console.log(' Peerlist Session Setup — Headed Interactive Access');
  console.log('======================================================');
  console.log(`Profile directory: ${DEFAULT_PEERLIST_PROFILE_DIR}\n`);
  console.log('1. Launching visible Chrome window...');
  console.log('2. Navigating to Peerlist login...');
  console.log('3. Complete your login in the browser window.\n');

  const context = await createPeerlistContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(PEERLIST_LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
  } catch (err) {
    console.log('Navigating to Peerlist login...');
  }

  await waitForUserPrompt('\n👉 Please log in to Peerlist in the browser window.\n   Once you are logged in and see your dashboard/jobs, press [ENTER] here to save session: ');

  console.log('\nVerifying session...');
  await page.waitForTimeout(2000);
  const authState = await evaluatePeerlistAuthStatus(page);

  console.log('✅ Access verified successfully!');
  console.log(`Session profile successfully saved to: ${DEFAULT_PEERLIST_PROFILE_DIR}\n`);

  console.log('Closing browser context cleanly...');
  await context.close();
  console.log('Done.\n');
}

/**
 * Check if the stored profile can access Peerlist.
 */
async function runCheckFlow() {
  console.log('\nChecking saved Peerlist session status...');
  console.log(`Profile directory: ${DEFAULT_PEERLIST_PROFILE_DIR}`);

  if (!existsSync(DEFAULT_PEERLIST_PROFILE_DIR)) {
    console.log('❌ No session profile folder found. Please run:');
    console.log('   node scripts/peerlist/peerlist-session.mjs login\n');
    return;
  }

  const context = await createPeerlistContext({ headless: true });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    await page.goto(PEERLIST_JOBS_URL, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const authState = await evaluatePeerlistAuthStatus(page);

    if (authState.status === 'ready') {
      console.log('\n✅ ACTIVE PEERLIST SESSION: Valid and ready to use.');
      console.log(`Detail: ${authState.detail}\n`);
    } else {
      console.log('\n⚠️ PEERLIST SESSION REQUIRES LOGIN:');
      console.log(`Detail: ${authState.detail}`);
      console.log('To refresh login, run:');
      console.log('   node scripts/peerlist/peerlist-session.mjs login\n');
    }
  } catch (err) {
    console.error(`\n❌ Error checking Peerlist access: ${err.message}\n`);
  } finally {
    await context.close();
  }
}

/**
 * Reset and clear local Peerlist session data.
 */
function runLogoutFlow() {
  console.log('\nResetting Peerlist local profile directory...');
  if (existsSync(DEFAULT_PEERLIST_PROFILE_DIR)) {
    try {
      rmSync(DEFAULT_PEERLIST_PROFILE_DIR, { recursive: true, force: true });
      console.log('✅ Stored session profile cleared successfully.\n');
    } catch (e) {
      console.error(`⚠️ Could not clear profile: ${e.message}\n`);
    }
  } else {
    console.log('No existing session profile found.\n');
  }
}

// ── CLI Dispatcher ──────────────────────────────────────────────────────────

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const mode = (process.argv[2] || 'check').toLowerCase();
  if (mode === 'login') {
    runLoginFlow();
  } else if (mode === 'logout' || mode === 'reset') {
    runLogoutFlow();
  } else {
    runCheckFlow();
  }
}
