#!/usr/bin/env node

/**
 * scripts/wellfound/wellfound-discover.mjs
 *
 * Dedicated Autonomous Discovery Engine for Wellfound (formerly AngelList Talent)
 * Multi-lane search covering:
 * - Keywords: "AI", "FDE", "Forward Deployed Engineer"
 * - All Internships (All, Bengaluru, Hyderabad, Remote)
 * - Role taxonomies: AI Engineer, Machine Learning Engineer, Forward Deployed Engineer
 *
 * Workflow:
 * 1. Deep sweep across target lanes, scrolling to capture cards.
 * 2. Filters out non-tech garbage (tax, accounting, sales, recruiters) client-side.
 * 3. Inspects full JDs for AI / ML / FDE relevance (0-1 YOE, including 1 year of exp).
 * 4. Saves raw candidates to data/wellfound-raw.json without sending to Telegram.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createWellfoundContext,
  evaluateAuthStatus,
  DEFAULT_WELLFOUND_PROFILE_DIR,
} from './wellfound-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/wellfound-seen.json');
const RAW_FILE = resolve(ROOT_DIR, 'data/wellfound-raw.json');
const MATCHES_FILE = resolve(ROOT_DIR, 'data/wellfound-matches.json');
const PIPELINE_FILE = resolve(ROOT_DIR, 'data/pipeline.md');

// ── Search Target Lanes ──────────────────────────────────────────────────────

const KEYWORD_SEARCHES = ['AI', 'Forward Deployed Engineer', 'FDE'];

const TARGET_ROLE_URLS = [
  { name: 'Bengaluru Internships', url: 'https://wellfound.com/jobs?job_types[]=internship&locations[]=Bengaluru' },
  { name: 'India Internships Feed', url: 'https://wellfound.com/jobs?job_types[]=internship&locations[]=India' },
  { name: 'Hyderabad Internships', url: 'https://wellfound.com/jobs?job_types[]=internship&locations[]=Hyderabad' },
  { name: 'India AI Engineers', url: 'https://wellfound.com/role/l/artificial-intelligence-engineer/india' },
  { name: 'Bengaluru AI Startups', url: 'https://wellfound.com/role/l/artificial-intelligence-engineer/bengaluru' },
  { name: 'Bengaluru Machine Learning', url: 'https://wellfound.com/role/l/machine-learning-engineer/bengaluru' },
  { name: 'India Machine Learning', url: 'https://wellfound.com/role/l/machine-learning-engineer/india' },
  { name: 'Remote AI Engineers', url: 'https://wellfound.com/role/r/artificial-intelligence-engineer' },
  { name: 'Remote Forward Deployed', url: 'https://wellfound.com/role/r/forward-deployed-engineer' },
  { name: 'Remote Machine Learning', url: 'https://wellfound.com/role/r/machine-learning-engineer' },
];

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

// Default sample test limit: 5 roles
const LIMIT = parseInt(getArg('--limit', '5'), 10);
const HEADLESS = !args.includes('--no-headless');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const jitter = (base) => base + Math.floor(Math.random() * 1000);

function loadSeenCache() {
  if (existsSync(CACHE_FILE)) {
    try { return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')); } catch { return {}; }
  }
  return {};
}

function saveSeenCache(cache) {
  try { writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8'); } catch {}
}

function normalizeText(str = '') {
  if (!str) return '';
  return str
    .normalize('NFKD')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function getCanonicalJobUrl(rawUrl) {
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl, 'https://wellfound.com');
    return `https://wellfound.com${parsed.pathname}`;
  } catch {
    return rawUrl;
  }
}

// Extract cards currently visible in the DOM with immediate garbage rejection
async function extractVisibleJobCards(page) {
  return await page.evaluate(() => {
    const anchors = Array.from(document.querySelectorAll('a[href*="/jobs/"]'));
    const results = [];
    const seen = new Set();

    for (const a of anchors) {
      const href = a.href || '';
      const cleanUrl = href.split('?')[0];
      const m = cleanUrl.match(/\/jobs\/(\d+)/);
      if (!m || seen.has(cleanUrl)) continue;

      let card = a.closest('div[class*="styles_job"], div[class*="JobCard"], div[class*="listing"], div.styles_component__') || a.parentElement;
      const text = card ? card.innerText : a.innerText;

      // Reject non-tech noise and non-engineering functions immediately
      if (/\b(tax|accounting|accountant|account executive|sales|marketing|recruiter|recruiting|talent|business development|bdr|sdr|product manager|operations|growth|customer success|interior designer|hr\b|operations manager|controller|finance manager|merchandise|waiter|driver|lounge)\b/i.test(text)) {
        continue;
      }

      // Reject senior / managerial / leadership / support titles immediately
      if (/\b(manager|director|head of|vp|principal|staff|lead|senior|sr\.?|sde[- ]?2|swe[- ]?2|engineer ii|support engineer|technical support|systems engineer|devops|it support|qa engineer)\b/i.test(text)) {
        continue;
      }

      // Reject cards explicitly showing months or years old
      const cardAgeMatch = text.match(/(?:posted|active|updated)[:\s]*(\d+\s*(?:hours?|days?|weeks?|months?|years?)\s*ago)/i) ||
                           text.match(/(\d+\s*(?:hours?|days?|weeks?|months?|years?)\s*ago)/i);
      const cardAge = cardAgeMatch ? cardAgeMatch[1] : '';
      if (/\b(?:month|year)s?\s*ago\b/i.test(cardAge) || /\b([3-9]|\d{2,})\s*weeks?\s*ago\b/i.test(cardAge)) {
        continue;
      }

      // Positive AI/ML/Tech Role Check
      if (!/\b(ai\b|genai|generative ai|llm|agentic|langgraph|fde|forward deployed|machine learning|ml\b|artificial intelligence|data science|nlp|deep learning|software engineer|developer|intern|engineer)\b/i.test(text)) {
        continue;
      }

      seen.add(cleanUrl);

      results.push({
        jobId: m[1],
        url: cleanUrl,
        rawText: text,
        cardAge,
      });
    }
    return results;
  });
}

export async function discoverWellfound(options = {}) {
  const limit = options.limit || LIMIT;
  const headless = options.headless !== undefined ? options.headless : HEADLESS;

  console.log(`\n======================================================`);
  console.log(` Starting Wellfound AI & FDE Sample Test (Limit: ${limit})`);
  console.log(` Mode: Headless=${headless} | Telegram: DISABLED (Sample Mode)`);
  console.log(` Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`======================================================\n`);

  if (!existsSync(DEFAULT_WELLFOUND_PROFILE_DIR)) {
    mkdirSync(DEFAULT_WELLFOUND_PROFILE_DIR, { recursive: true });
  }

  const seenCache = loadSeenCache();
  const context = await createWellfoundContext({ headless });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const rawCandidateMap = new Map();

  try {
    // ── Phase 1: Keyword Searches on /jobs ──
    for (const kw of KEYWORD_SEARCHES) {
      if (rawCandidateMap.size >= Math.max(30, limit * 6)) break;

      console.log(`🔍 Searching Keyword: "${kw}" on Wellfound...`);
      try {
        await page.goto('https://wellfound.com/jobs', { waitUntil: 'domcontentloaded', timeout: 35000 });
        await sleep(2500);

        const inputs = await page.$$('input[type="text"]');
        if (inputs.length > 0) {
          await inputs[0].fill(kw);
          await sleep(500);
          const searchBtn = await page.$('button:has-text("Search")');
          if (searchBtn) await searchBtn.click();
          else await inputs[0].press('Enter');
          await sleep(3500);

          // Scroll to load dynamic feed items
          for (let s = 0; s < 6; s++) {
            await page.evaluate(() => window.scrollBy(0, 1000));
            await sleep(jitter(1000));
          }

          const cards = await extractVisibleJobCards(page);
          console.log(`   Found ${cards.length} tech/AI candidate cards for "${kw}".`);
          for (const c of cards) {
            if (!rawCandidateMap.has(c.url)) rawCandidateMap.set(c.url, c);
          }
        }
      } catch (err) {
        console.warn(`   ⚠️ Keyword search failed for "${kw}": ${err.message}`);
      }
    }

    // ── Phase 2: Role Taxonomies & Internship Feeds ──
    for (const lane of TARGET_ROLE_URLS) {
      if (rawCandidateMap.size >= Math.max(120, limit * 30)) break;

      console.log(`🔍 Scanning Lane: [${lane.name}]...`);
      try {
        await page.goto(lane.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await sleep(3000);

        const auth = await evaluateAuthStatus(page);
        if (auth.status === 'checkpoint' || auth.status === 'rate_limited') {
          console.warn(`   ⚠️ Access Challenge on ${lane.name}: ${auth.detail}`);
          break;
        }

        // Scroll
        for (let s = 0; s < 6; s++) {
          await page.evaluate(() => window.scrollBy(0, 1000));
          await sleep(jitter(1000));
        }

        const cards = await extractVisibleJobCards(page);
        console.log(`   Found ${cards.length} tech/AI candidate cards in ${lane.name}.`);
        for (const c of cards) {
          if (!rawCandidateMap.has(c.url)) rawCandidateMap.set(c.url, c);
        }
      } catch (err) {
        console.warn(`   ⚠️ Lane scan failed for ${lane.name}: ${err.message}`);
      }
    }

    console.log(`\n📋 Discovered Total ${rawCandidateMap.size} Candidate AI Postings.`);
    console.log(`🚀 Inspecting Job Details to Collect ${limit} Verified AI Roles...\n`);

    const rawJobsList = [];

    // Inspect individual JDs
    for (const [url, item] of rawCandidateMap.entries()) {
      if (rawJobsList.length >= limit) break;

      try {
        console.log(`→ Inspecting Job #${item.jobId} (${url})...`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(jitter(1800));

        const auth = await evaluateAuthStatus(page);
        if (auth.status === 'checkpoint' || auth.status === 'rate_limited') {
          console.warn(`   ⚠️ Checkpoint on ${url}. Halting detail fetch.`);
          break;
        }

        const details = await page.evaluate(() => {
          const docTitle = document.title || '';
          let title = '';
          let company = '';

          const parts = docTitle.split(' at ');
          if (parts.length > 1) {
            title = parts[0].trim();
            company = parts[1].split(' • ')[0].split(' | ')[0].trim();
          } else {
            const h1 = document.querySelector('h1');
            if (h1) title = h1.innerText.trim();
          }

          const bodyText = document.body.innerText;
          let location = '';
          let compensation = '';
          let postedAge = '';

          const locMatch = bodyText.match(/Location\s*\n+([^\n]+)/i);
          if (locMatch) location = locMatch[1].trim();

          const subMatch = bodyText.match(/(?:Full-time|Part-time|Contract|Internship)\s*·\s*([^·\n]+)/i);
          if (subMatch) {
            location = location ? `${location} · ${subMatch[1].trim()}` : subMatch[1].trim();
          }

          const compMatch = bodyText.match(/(?:Salary|Compensation)\s*\n+([^\n]+)/i) || bodyText.match(/([₹$][\d,]+[kKmM]?\s*[-–—]\s*[₹$][\d,]+[kKmM]?|[₹$][\d,]+[kKmM]?\s*•[^\n]+)/);
          if (compMatch) compensation = compMatch[1] || compMatch[0];

          const ageMatch = bodyText.match(/(?:posted|active|updated)[:\s]+(\d+\s*(?:hours?|days?|weeks?|months?|years?)\s*ago)/i) ||
                           bodyText.match(/(\d+\s*(?:hours?|days?|weeks?|months?|years?)\s*ago)/i) ||
                           bodyText.match(/(\d+[hdwy]\s*ago)/i);
          if (ageMatch) postedAge = ageMatch[1].trim();

          const descEl = document.querySelector('[data-test="JobDescription"], [class*="jobDescription"], article, main, div[class*="description"]');
          const description = descEl ? descEl.innerText.trim() : bodyText;

          return { title, company, location, compensation, postedAge, description };
        });

        const cleanAge = (details.postedAge && !details.postedAge.toLowerCase().includes('location') && /\b(?:hours?|days?|weeks?|months?|years?|recent)\b/i.test(details.postedAge))
          ? details.postedAge
          : (item.cardAge || 'Recent');

        const rawRecord = {
          jobId: item.jobId,
          title: normalizeText(details.title || 'AI Engineer'),
          company: normalizeText(details.company || 'AI Startup'),
          location: normalizeText(details.location || 'Remote'),
          compensation: details.compensation || 'Competitive',
          postedAge: cleanAge,
          url,
          canonicalUrl: url,
          platform: 'Wellfound',
          description: details.description || '',
          dateCaptured: new Date().toISOString().split('T')[0],
        };

        const titleAndDesc = (rawRecord.title + ' ' + rawRecord.description).toLowerCase();

        // 1. Must be genuine AI / ML / FDE / Agentic
        const hasAiIntent = /\b(ai\b|genai|generative ai|llm|agentic|langgraph|fde|forward deployed|machine learning|ml\b|artificial intelligence|deep learning|nlp|vision|speech|voice|data science)\b/i.test(titleAndDesc);
        if (!hasAiIntent) {
          console.log(`   ⏭️ Non-AI role: ${rawRecord.title} (${rawRecord.company}) - Skipping.`);
          continue;
        }

        // 2. Reject Non-Engineering / Business Functions in Title
        const isNonTech = /\b(manager|director|head of|vp|account executive|account manager|sales|marketing|recruiter|product manager|operations|bdr|sdr|consultant|analyst|designer|writer|customer success|support engineer|technical support|systems engineer|devops|it support|qa engineer)\b/i.test(rawRecord.title);
        if (isNonTech) {
          console.log(`   ⏭️ Non-engineering/support title: ${rawRecord.title} - Skipping.`);
          continue;
        }

        // 3. Reject Seniority >= 2 YOE or Senior Titles across the FULL description (0-1 YOE allowed)
        const hasSeniorTitle = /\b(senior|sr\.?|principal|lead|staff|architect|sde[- ]?2|swe[- ]?2|engineer ii)\b/i.test(rawRecord.title);
        const hasSeniorExp = /\b([2-9]|\d{2,})\s*(?:\+|plus|\s*[\-to\s]+\s*\d+)?\s*(?:years?|yrs?|yoe)\b/i.test(rawRecord.description) ||
                             /\b(?:minimum|at least|min\.?)\s*([2-9]|\d{2,})\s*(?:years?|yrs?|yoe)\b/i.test(rawRecord.description) ||
                             /\b[2-9]\+?\s*(?:years?|yrs?)\s+of\s+(?:experience|exp)\b/i.test(rawRecord.description);

        if (hasSeniorTitle || hasSeniorExp) {
          console.log(`   ⏭️ Senior role (>= 2 YOE / Senior title): ${rawRecord.title} (${rawRecord.company}) - Skipping.`);
          continue;
        }

        // 4. Location Gate: India OR Global Remote (Anywhere / Worldwide) across FULL text
        const isIndia = /\b(india|bengaluru|bangalore|hyderabad|pune|delhi|mumbai|chennai|noida|gurgaon|telangana|karnataka)\b/i.test(rawRecord.location);
        const isRemote = /\b(remote|anywhere|worldwide|everywhere)\b/i.test(rawRecord.location);
        const isForeignRestricted = /\b(us only|u\.s\. only|united states only|canada only|uk only|europe only|latin america|must reside in the us|must be located in the us|eligible to work in the us)\b/i.test(rawRecord.description + ' ' + rawRecord.location);

        if (!isIndia && (!isRemote || isForeignRestricted)) {
          console.log(`   ⏭️ Ineligible Location (${rawRecord.location}): ${rawRecord.title} - Skipping.`);
          continue;
        }

        // 5. Recency Gate: Reject stale postings (> 14 days, months, or years old)
        const isMonthsOrYearsOld = /\b(?:month|year)s?\s*ago\b/i.test(rawRecord.postedAge);
        const isOldWeeks = /\b([3-9]|\d{2,})\s*weeks?\s*ago\b/i.test(rawRecord.postedAge);

        if (isMonthsOrYearsOld || isOldWeeks) {
          console.log(`   ⏭️ Stale posting (${rawRecord.postedAge}): ${rawRecord.title} (${rawRecord.company}) - Skipping.`);
          continue;
        }

        // 6. Regional state exclusions (e.g. "Assam based candidate only")
        const isRestrictedState = /\b(assam|kerala|gujarat|bhopal|indore|punjab|rajasthan)\s*(?:based|only)\b/i.test(rawRecord.title + ' ' + rawRecord.description);
        if (isRestrictedState) {
          console.log(`   ⏭️ Restricted local state: ${rawRecord.title} - Skipping.`);
          continue;
        }

        console.log(`   ✨ Captured Qualified AI Match #${rawJobsList.length + 1}: ${rawRecord.company} — ${rawRecord.title} [${rawRecord.location}]`);
        rawJobsList.push(rawRecord);

        if (rawJobsList.length >= limit) {
          console.log(`\n🎯 Successfully fetched target of ${limit} verified AI roles!`);
          break;
        }
      } catch (err) {
        console.warn(`   ⚠️ Failed to inspect ${url}: ${err.message}`);
      }
    }

    // Save all fetched raw jobs to data/wellfound-raw.json
    writeFileSync(RAW_FILE, JSON.stringify(rawJobsList, null, 2), 'utf-8');
    writeFileSync(MATCHES_FILE, JSON.stringify(rawJobsList, null, 2), 'utf-8');
    console.log(`\n💾 Saved ${rawJobsList.length} verified AI roles to data/wellfound-raw.json and data/wellfound-matches.json`);

    return rawJobsList;

  } finally {
    await context.close();
  }
}

// Direct Execution
if (process.argv[1] && process.argv[1].endsWith('wellfound-discover.mjs')) {
  discoverWellfound().catch(console.error);
}
