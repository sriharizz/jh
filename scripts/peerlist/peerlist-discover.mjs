#!/usr/bin/env node

/**
 * scripts/peerlist/peerlist-discover.mjs
 *
 * Targeted Peerlist Job Discovery & Strict 0-3 YOE AI Role Matching
 *
 * Capabilities:
 * 1. Connects to persistent session in data/peerlist-profile.
 * 2. Navigates to Peerlist AI/Tech Jobs feed (Bengaluru, Remote, India).
 * 3. Extracts verified startup & modern AI postings.
 * 4. Filters with strict 0-3 YOE ceiling & stack matching.
 * 5. Generates Daily Application Queue in data/peerlist-queue.json.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createPeerlistContext,
  evaluatePeerlistAuthStatus,
  DEFAULT_PEERLIST_PROFILE_DIR,
} from './peerlist-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/peerlist-seen.json');
const QUEUE_FILE = resolve(ROOT_DIR, 'data/peerlist-queue.json');
const SEARCH_URLS = [
  'https://peerlist.io/jobs?q=AI',
  'https://peerlist.io/jobs?q=Machine+Learning',
  'https://peerlist.io/jobs?q=Python',
  'https://peerlist.io/jobs?q=Agent',
];

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

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

function evaluatePeerlistFit(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase();
  const loc = (job.location || '').toLowerCase();

  // 1. Hard Seniority Gate (3+ to 10+ YOE, Lead, Principal, Architect, Senior)
  const isSenior =
    /\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect)\b/i.test(title) ||
    /\b(3\+|4\+|5\+|6\+|7\+|8\+|10\+)\s*(years|yrs|yoe)\b/i.test(desc) ||
    /\b(minimum|at least)\s*(3|4|5|6|7|8|10)\s*(years|yrs)\b/i.test(desc);

  if (isSenior) {
    return { fitScore: 0, reason: 'Senior / 3+ YOE role', pass: false };
  }

  let fitScore = 55;
  const keyMatches = [];

  if (title.includes('ai') || title.includes('genai') || title.includes('agentic') || title.includes('agent')) {
    fitScore += 25;
    keyMatches.push('Primary Target Title (AI/Agentic)');
  } else if (title.includes('machine learning') || title.includes('ml')) {
    fitScore += 20;
    keyMatches.push('Target Title (ML Engineer)');
  } else if (title.includes('python') || title.includes('backend') || title.includes('forward deployed') || title.includes('fde')) {
    fitScore += 15;
    keyMatches.push('Python / Backend / FDE Alignment');
  }

  if (title.includes('intern') || desc.includes('intern') || desc.includes('0-1') || desc.includes('0-2')) {
    fitScore += 15;
    keyMatches.push('0-2 YOE / Intern Experience Match');
  }

  // Stack matches
  if (/langgraph|rag|fastapi|pytorch|llm/i.test(desc)) {
    fitScore += 10;
    keyMatches.push('Core AI Stack Match');
  }

  let locationTier = 'Tier 4 (Major Indian Hub)';
  if (loc.includes('bengaluru') || loc.includes('bangalore')) {
    locationTier = 'Tier 1 (Bengaluru)';
    fitScore += 10;
  } else if (loc.includes('hyderabad')) {
    locationTier = 'Tier 2 (Hyderabad)';
    fitScore += 6;
  } else if (loc.includes('remote') || loc.includes('india')) {
    locationTier = 'Tier 3 (Remote India)';
    fitScore += 5;
  }

  return {
    fitScore: Math.min(100, fitScore),
    locationTier,
    keyMatches,
    pass: fitScore >= 60,
  };
}

async function runDiscovery() {
  console.log('\n======================================================');
  console.log(' Peerlist Discovery & AI Job Queue Generator');
  console.log('======================================================');
  console.log(`Limit: Up to ${LIMIT} candidate roles\n`);

  const seenCache = loadJson(CACHE_FILE, {});
  const context = await createPeerlistContext({ headless: HEADLESS });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    const rawCards = [];
    const seenUrls = new Set();

    for (const searchUrl of SEARCH_URLS) {
      console.log(`1. Navigating to: ${searchUrl}...`);
      try {
        await page.goto(searchUrl, { waitUntil: 'commit', timeout: 35000 }).catch(() => {});
        await sleep(7000); // Allow Cloudflare challenge to complete naturally

        // Scroll to load job cards
        await page.evaluate(async () => {
          for (let i = 0; i < 4; i++) {
            window.scrollBy(0, 900);
            await new Promise((r) => setTimeout(r, 500));
          }
        });
        await sleep(1500);

        const items = await page.evaluate(() => {
          const anchors = Array.from(document.querySelectorAll('a[href*="/careers/"], a[href*="/jobs/"]'));
          const results = [];
          const seen = new Set();

          anchors.forEach((a) => {
            const href = a.href || '';
            if (!href || seen.has(href) || href.endsWith('/jobs') || href.endsWith('/jobs/')) return;
            seen.add(href);

            const text = a.innerText || '';
            const lines = text.split('\n').map((s) => s.trim()).filter(Boolean);
            if (lines.length < 2) return;

            let title = lines[0];
            let company = lines[1];

            if (lines[0].includes(' at ')) {
              const parts = lines[0].split(' at ');
              title = parts[0].trim();
              company = parts.slice(1).join(' at ').trim();
            }

            const location = lines.find((l) => /remote|bengaluru|bangalore|hyderabad|india|in-office|hybrid/i.test(l)) || 'Bengaluru / Remote';

            results.push({
              title,
              company,
              location,
              url: href,
              rawText: text,
            });
          });

          return results;
        });

        for (const item of items) {
          if (!seenUrls.has(item.url)) {
            seenUrls.add(item.url);
            rawCards.push(item);
          }
        }
      } catch (laneErr) {
        console.warn(`  ⚠️ Navigation issue on ${searchUrl}: ${laneErr.message}`);
      }
    }

    console.log(`\nDiscovered ${rawCards.length} potential listings across all Peerlist lanes.`);
    console.log(`Deep-inspecting top listings for location eligibility and seniority...\n`);

    // Load applied companies to deduplicate
    const trackerPath = resolve(ROOT_DIR, 'data/applications.md');
    const appliedSet = new Set();
    if (existsSync(trackerPath)) {
      const trackerContent = readFileSync(trackerPath, 'utf-8');
      trackerContent.split('\n').forEach((line) => {
        const cols = line.split('|').map((s) => s.trim());
        if (cols.length >= 4 && cols[2] && !cols[2].includes('Company')) {
          appliedSet.add(cols[2].toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, ''));
        }
      });
    }

    const queue = [];
    for (const card of rawCards) {
      if (queue.length >= LIMIT) break;

      const normComp = card.company.toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '');
      if (appliedSet.has(normComp)) {
        console.log(`  ⏭️ SKIPPING "${card.company}": Already tracked as Applied in data/applications.md.`);
        continue;
      }

      try {
        console.log(`→ Inspecting: ${card.company} — ${card.title} (${card.url})`);
        await page.goto(card.url, { waitUntil: 'commit', timeout: 25000 }).catch(() => {});
        await sleep(3500);

        const pageDetails = await page.evaluate(() => {
          const text = document.body.innerText;
          let location = '';
          let duration = '';

          // Look for Location header
          const locMatch = text.match(/Location\s*\n+([^\n]+)/i);
          if (locMatch) location = locMatch[1].trim();

          const durMatch = text.match(/Duration\s*\n+([^\n]+)/i);
          if (durMatch) duration = durMatch[1].trim();

          return { location, duration, text };
        });

        const verifiedLoc = pageDetails.location || card.location;
        const locLower = verifiedLoc.toLowerCase();

        // Hard Location Exclusion: In-Office / Hybrid in US, UK, Europe, Australia, etc.
        const isForeignInOffice = /\b(in-office|hybrid|onsite|on-site)\b/i.test(verifiedLoc) &&
                                  /\b(united states|los angeles|durham|san francisco|chicago|seattle|new york|california|texas|boston|london|uk|europe|germany|canada|australia)\b/i.test(locLower);
        const isIndiaOrRemote = /bengaluru|bangalore|hyderabad|pune|delhi|mumbai|gurgaon|noida|chennai|india|remote/i.test(locLower);

        if (isForeignInOffice || (!isIndiaOrRemote && !locLower.includes('remote'))) {
          console.log(`  ❌ REJECTED: Location "${verifiedLoc}" is outside India / not Global Remote.`);
          continue;
        }

        const fit = evaluatePeerlistFit({
          ...card,
          location: verifiedLoc,
          description: pageDetails.text,
        });

        if (fit.pass) {
          queue.push({
            company: card.company,
            title: card.title,
            location: verifiedLoc,
            locationTier: fit.locationTier,
            fitScore: fit.fitScore,
            keyMatches: fit.keyMatches,
            url: card.url,
          });
          console.log(`  ✅ QUALIFIED: ${card.company} (${verifiedLoc}) — Score: ${fit.fitScore}/100`);
        } else {
          console.log(`  ⚪ FILTERED: Score ${fit.fitScore} (Blocker / Seniority)`);
        }
      } catch (err) {
        console.warn(`  ⚠️ Error inspecting ${card.url}: ${err.message}`);
      }
    }

    saveJson(QUEUE_FILE, queue);

    console.log(`\n======================================================`);
    console.log(` PEERLIST APPLICATION QUEUE (${queue.length} Verified Roles)`);
    console.log(`======================================================`);

    queue.forEach((job, idx) => {
      console.log(`[#${idx + 1}] ${job.company} — ${job.title} (Score: ${job.fitScore}/100)`);
      console.log(`    📍 ${job.location} | 🎯 ${job.keyMatches.join(', ')}`);
      console.log(`    🔗 ${job.url}\n`);
    });

  } catch (err) {
    console.error(`❌ Peerlist discovery error: ${err.message}`);
  } finally {
    await context.close();
  }
}

runDiscovery();
