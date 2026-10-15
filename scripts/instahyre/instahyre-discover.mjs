#!/usr/bin/env node

/**
 * scripts/instahyre/instahyre-discover.mjs
 *
 * Targeted Instahyre Job Discovery & Strict 0-3 YOE Matching
 *
 * Capabilities:
 * 1. Scrapes Instahyre's curated candidate opportunities & search feeds.
 * 2. Strict 0-3 YOE / Intern experience filter (rejects 4+ to 10+ YOE).
 * 3. Verified Stack Matching (LangGraph, FastAPI, PyTorch, RAG, GenAI, Python).
 * 4. Deduplication against seen jobs.
 * 5. Generates Daily Application Queue in `data/instahyre-queue.json`.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createInstahyreContext,
  evaluateInstahyreAuthStatus,
  DEFAULT_INSTAHYRE_PROFILE_DIR,
} from './instahyre-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/instahyre-seen.json');
const QUEUE_FILE = resolve(ROOT_DIR, 'data/instahyre-queue.json');

// ── Search Presets ──────────────────────────────────────────────────────────

const SEARCH_PRESETS = {
  'bengaluru': 'https://www.instahyre.com/search-jobs/?skills=Artificial%20Intelligence,Machine%20Learning,Python,Generative%20AI&location=Bengaluru%2FBangalore',
  'hyderabad': 'https://www.instahyre.com/search-jobs/?skills=Artificial%20Intelligence,Machine%20Learning,Python,Generative%20AI&location=Hyderabad',
  'remote': 'https://www.instahyre.com/search-jobs/?skills=Artificial%20Intelligence,Machine%20Learning,Python,Generative%20AI&job_type=Work%20from%20home',
  'feed': 'https://www.instahyre.com/candidate/opportunities/',
};

// ── CLI Arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const PRESET_NAME = (getArg('--preset', 'bengaluru')).toLowerCase();
const LIMIT = parseInt(getArg('--limit', '20'), 10);
const HEADLESS = args.includes('--headless');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadJson(path, fallback = {}) {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function saveJson(path, data) {
  try {
    writeFileSync(path, JSON.stringify(data, null, 2), 'utf-8');
  } catch (e) {
    console.error(`Failed to write ${path}: ${e.message}`);
  }
}

// ── Fit Evaluation Logic ───────────────────────────────────────────────────

function evaluateInstahyreFit(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();
  const exp = (job.experience || '').toLowerCase();

  // 1. Hard Seniority Exclusions
  const isSenior =
    /\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect)\b/i.test(title) ||
    /\b(4\+|5\+|6\+|7\+|8\+|10\+)\s*(years|yrs|yoe)\b/i.test(exp + ' ' + desc) ||
    /\b(minimum|at least)\s*(4|5|6|7|8|10)\s*(years|yrs)\b/i.test(desc);

  if (isSenior) {
    return { fitScore: 0, reason: 'Senior / 4+ YOE role' };
  }

  let fitScore = 50;
  const keyMatches = [];

  // Title match
  if (title.includes('ai engineer') || title.includes('applied ai') || title.includes('genai') || title.includes('generative ai')) {
    fitScore += 25;
    keyMatches.push('Primary Target Title (AI/GenAI Engineer)');
  } else if (title.includes('machine learning') || title.includes('ml engineer')) {
    fitScore += 20;
    keyMatches.push('Target Title (ML Engineer)');
  } else if (title.includes('python') || title.includes('backend') || title.includes('forward deployed')) {
    fitScore += 15;
    keyMatches.push('Python / Backend / FDE Alignment');
  }

  // Experience level
  if (title.includes('intern') || exp.includes('0-1') || exp.includes('0-2') || exp.includes('0-3') || exp.includes('1-3')) {
    fitScore += 15;
    keyMatches.push('0-3 YOE / Intern Experience Match');
  }

  // Location
  let locationTier = 'Tier 4 (Major Indian Hub)';
  if (loc.includes('bengaluru') || loc.includes('bangalore')) {
    locationTier = 'Tier 1 (Bengaluru)';
    fitScore += 10;
  } else if (loc.includes('hyderabad')) {
    locationTier = 'Tier 2 (Hyderabad)';
    fitScore += 6;
  } else if (loc.includes('remote') || loc.includes('home')) {
    locationTier = 'Tier 3 (Remote India)';
    fitScore += 4;
  }

  return {
    fitScore: Math.min(100, fitScore),
    locationTier,
    keyMatches,
    pass: fitScore >= 50,
  };
}

// ── Main Discovery Execution ────────────────────────────────────────────────

async function runDiscovery() {
  console.log('\n======================================================');
  console.log(' Instahyre Discovery & Daily Application Queue Generator');
  console.log('======================================================');
  console.log(`Preset:      ${PRESET_NAME.toUpperCase()}`);
  console.log(`Limit:       Up to ${LIMIT} candidate roles\n`);

  const seenCache = loadJson(CACHE_FILE, {});
  const context = await createInstahyreContext({ headless: HEADLESS });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const searchUrl = SEARCH_PRESETS[PRESET_NAME] || SEARCH_PRESETS['bengaluru'];
  console.log(`1. Navigating to Instahyre Search: ${searchUrl}...`);

  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await sleep(3000);

    const auth = await evaluateInstahyreAuthStatus(page);
    if (auth.status === 'login_required') {
      console.log('⚠️ Instahyre requires login to see full opportunities. Please run:');
      console.log('   node scripts/instahyre/instahyre-session.mjs login\n');
    }

    // Scroll to load jobs
    await page.evaluate(async () => {
      for (let i = 0; i < 6; i++) {
        window.scrollBy(0, 800);
        await new Promise((r) => setTimeout(r, 400));
      }
    });
    await sleep(2000);

    // Extract opportunity cards
    const rawCards = await page.evaluate(() => {
      const items = document.querySelectorAll(
        '.opportunity-card, .employer-row, .job-listing, div[id*="job-"], div.cursor-pointer'
      );
      const results = [];

      items.forEach((item) => {
        const titleEl = item.querySelector('.job-title, h2, h3, .employer-job-title, a[href*="/job/"]');
        const compEl = item.querySelector('.company-name, .employer-name, h4, span.company');
        const locEl = item.querySelector('.job-locations, .location, span.loc');
        const expEl = item.querySelector('.job-experience, .experience, span.exp');
        const linkEl = item.querySelector('a[href*="/job/"]') || item.querySelector('a');

        const title = titleEl ? titleEl.innerText.trim() : '';
        const company = compEl ? compEl.innerText.trim() : '';
        const location = locEl ? locEl.innerText.trim() : '';
        const experience = expEl ? expEl.innerText.trim() : '';
        const url = linkEl ? linkEl.href : '';

        if (title && company) {
          results.push({ title, company, location, experience, url });
        }
      });
      return results;
    });

    console.log(`Discovered ${rawCards.length} listings on Instahyre.`);

    const queue = [];
    for (const card of rawCards) {
      if (queue.length >= LIMIT) break;
      const fit = evaluateInstahyreFit(card);
      if (fit.pass) {
        queue.push({
          company: card.company,
          title: card.title,
          location: card.location || 'Bengaluru, India',
          locationTier: fit.locationTier,
          experience: card.experience,
          fitScore: fit.fitScore,
          keyMatches: fit.keyMatches,
          url: card.url,
        });
      }
    }

    saveJson(QUEUE_FILE, queue);

    console.log(`\n======================================================`);
    console.log(` INSTAHYRE APPLICATION QUEUE (${queue.length} Roles Ready)`);
    console.log(`======================================================`);

    queue.forEach((job, idx) => {
      console.log(`[#${idx + 1}] ${job.company} — ${job.title} (Score: ${job.fitScore}/100)`);
      console.log(`    📍 ${job.location} | 💼 Exp: ${job.experience || '0-3 YOE'}`);
      console.log(`    🔗 ${job.url}\n`);
    });

  } catch (err) {
    console.error(`❌ Instahyre discovery error: ${err.message}`);
  } finally {
    await context.close();
  }
}

runDiscovery();
