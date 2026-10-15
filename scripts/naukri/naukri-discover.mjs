#!/usr/bin/env node

/**
 * scripts/naukri/naukri-discover.mjs
 *
 * Targeted Naukri Job Discovery, Local Triage, Deep Scoring & Daily Queue Generator
 *
 * Capabilities:
 * 1. Target Presets: Bengaluru (Tier 1), Hyderabad (Tier 2), Remote India (Tier 3), or All.
 * 2. Conservative Sequential Queries with human-like pacing.
 * 3. 2-Stage Discovery Pipeline:
 *    - Stage 1: Fast card-level triage (filters out senior, non-AI, incompatible locations).
 *    - Stage 2: Deep sequential inspection on top candidate JDs (extracts stack, freshness, credibility).
 * 4. Transparent Candidate Fit Scoring (0-100) based on verified profile (LangGraph, FastAPI, RAG, etc.).
 * 5. Initial Credibility & Consultancy/Spam Check.
 * 6. Generates Daily Application Queue in data/naukri-queue.json.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  createNaukriContext,
  evaluateNaukriAuthStatus,
  DEFAULT_NAUKRI_PROFILE_DIR,
} from './naukri-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/naukri-seen.json');
const QUEUE_FILE = resolve(ROOT_DIR, 'data/naukri-queue.json');

// ── CLI Arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const PRESET = (getArg('--preset', 'preferred')).toLowerCase();
const LIMIT = parseInt(getArg('--limit', '25'), 10);
const HEADLESS = args.includes('--headless');


// ── Search Lanes (Preferred: Bengaluru Tier 1, Hyderabad Tier 2, Remote India Tier 3) ──

function buildNaukriQueries(preset) {
  const queries = [];

  // Bengaluru (Tier 1 — Top Home Base Priority)
  if (preset === 'bengaluru' || preset === 'blr' || preset === 'tier1' || preset === 'preferred' || preset === 'all') {
    queries.push({
      lane: 'Bengaluru — AI Engineer',
      url: 'https://www.naukri.com/ai-engineer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Bengaluru — Machine Learning Engineer',
      url: 'https://www.naukri.com/machine-learning-engineer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Bengaluru — Generative AI / LLM',
      url: 'https://www.naukri.com/genai-engineer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Bengaluru — AI/ML Engineer',
      url: 'https://www.naukri.com/aiml-engineer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Bengaluru — Python AI Developer',
      url: 'https://www.naukri.com/python-ai-developer-jobs-in-bangalore-bengaluru?experience=0&jobAge=7',
    });
  }

  // Hyderabad (Tier 2 — Secondary Priority)
  if (preset === 'hyderabad' || preset === 'hyd' || preset === 'tier2' || preset === 'preferred' || preset === 'all') {
    queries.push({
      lane: 'Hyderabad — AI/ML Engineer',
      url: 'https://www.naukri.com/ai-engineer-jobs-in-hyderabad-secunderabad?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Hyderabad — Machine Learning Engineer',
      url: 'https://www.naukri.com/machine-learning-engineer-jobs-in-hyderabad-secunderabad?experience=0&jobAge=7',
    });
  }

  // Remote India (Tier 3 — Remote Flexibility)
  if (preset === 'remote' || preset === 'tier3' || preset === 'preferred' || preset === 'all') {
    queries.push({
      lane: 'Remote India — AI Engineer / Python',
      url: 'https://www.naukri.com/remote-ai-engineer-jobs?experience=0&jobAge=7',
    });
    queries.push({
      lane: 'Remote India — Machine Learning Engineer',
      url: 'https://www.naukri.com/remote-machine-learning-engineer-jobs?experience=0&jobAge=7',
    });
  }

  return queries;
}


const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

async function naturalScroll(page) {
  try {
    const scrollCount = Math.floor(Math.random() * 3) + 2;
    for (let s = 0; s < scrollCount; s++) {
      const scrollY = Math.floor(Math.random() * 300) + 150;
      await page.mouse.wheel(0, scrollY).catch(() => {});
      await randomSleep(400, 900);
    }
  } catch {
    // fallback
  }
}


function loadSeenCache() {
  if (existsSync(CACHE_FILE)) {
    try {
      return JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    } catch {
      return {};
    }
  }
  return {};
}

function saveSeenCache(cache) {
  try {
    writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch {
    // ignore
  }
}

// ── Stage 1: Fast Listing Triage ────────────────────────────────────────────

function triageNaukriCard(card) {
  const title = (card.title || '').toLowerCase();
  const location = (card.location || '').toLowerCase();

  // Hard Seniority Exclusions
  if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief|expert)\b/i.test(title)) {
    return { pass: false, reason: 'Senior / Leadership role' };
  }

  // Hard Non-Technical / Non-AI Exclusions
  if (/\b(sales|marketing|recruiter|hr|talent|business development|bde|sdr|social media|video|editing|creative|graphic|content|writer|accountant|lawyer|bpo|telecaller|operations|support|executive)\b/i.test(title)) {
    return { pass: false, reason: 'Non-technical role' };
  }
  if (/\b(java developer|dotnet|\.net|php|wordpress|manual qa|frontend developer|angular|sap|abap|android|ios|web developer)\b/i.test(title) && !title.includes('ai') && !title.includes('ml') && !title.includes('agent')) {
    return { pass: false, reason: 'Unrelated legacy tech stack' };
  }

  // MUST be AI, ML, GenAI, Agentic, LLM, FDE, Computer Vision, NLP, Data Science, or Python AI
  const isTargetAiTech = /\b(ai|artificial intelligence|machine learning|ml|genai|generative|llm|agent|agentic|langgraph|fde|forward deployed|data science|computer vision|nlp|robotics|rag|deep learning)\b/i.test(title);
  if (!isTargetAiTech) {
    return { pass: false, reason: 'Title lacks AI/ML/GenAI/FDE focus' };
  }

  // Location Verification
  const isBengaluru = location.includes('bengaluru') || location.includes('bangalore') || location.includes('karnataka');
  const isHyderabad = location.includes('hyderabad') || location.includes('telangana');
  const isRemoteIndia = location.includes('remote') || location.includes('work from home');
  const isIndianHub = location.includes('pune') || location.includes('gurgaon') || location.includes('noida') || location.includes('mumbai') || location.includes('delhi') || location.includes('india');

  if (!isBengaluru && !isHyderabad && !isRemoteIndia && !isIndianHub && location.length > 2) {
    return { pass: false, reason: 'Incompatible location' };
  }

  return { pass: true, reason: 'Passed Stage 1 Triage' };
}

// ── Stage 2: Deep Candidate Fit Scoring ─────────────────────────────────────

function evaluateNaukriJobFit(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase().replace(/[–—−]/g, '-');
  const loc = (job.location || '').toLowerCase();
  const comp = (job.company || '').toLowerCase();

  let fitScore = 50; // Base score
  const keyMatches = [];
  const blockers = [];

  // 1. Role Title Precision
  if (title.includes('ai engineer') || title.includes('applied ai') || title.includes('genai') || title.includes('agentic')) {
    fitScore += 20;
    keyMatches.push('Primary Target Title (AI/GenAI Engineer)');
  } else if (title.includes('machine learning') || title.includes('ml engineer')) {
    fitScore += 15;
    keyMatches.push('Target Title (ML Engineer)');
  } else if (title.includes('python') || title.includes('backend')) {
    fitScore += 10;
    keyMatches.push('Backend + AI Alignment');
  }

  // 2. Comprehensive Numerical Experience Level Alignment & Hard Seniority Gate
  const expMatches = [];
  const addMatch = (num1, num2, raw, isTotal = false) => {
    if (!isNaN(num1) && num1 >= 0 && num1 <= 35) {
      const maxVal = (!isNaN(num2) && num2 >= num1) ? num2 : num1;
      expMatches.push({ min: num1, max: maxVal, raw, isTotal });
    }
  };

  // Pattern 1: Total / Overall / Industry experience explicitly
  const pTotal = /(?:total|overall|industry|software(?:\s*engineering)?|professional|work)?\s*(?:experience|exp)[:\s]+(?:of\s*)?(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)?\b/gi;
  let m;
  while ((m = pTotal.exec(desc)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  // Pattern 2: "around X years of total...", "with X+ years of total..."
  const pTotal2 = /(?:with|around|approx(?:imately)?|about|have|has|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\s*(?:of\s*)?(?:total|overall|industry|software|engineering|professional|work)\s*experience/gi;
  while ((m = pTotal2.exec(desc)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  // Pattern 3: General "X+ years", "X-Y years", "X to Y years", "X years of experience"
  const pGeneral = /\b(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b(?:\s*(?:of\s*)?(?:relevant|hands-on|overall|industry|professional|work)?\s*experience)?/gi;
  while ((m = pGeneral.exec(desc)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  // Pattern 4: "minimum X years", "at least X years"
  const pMin = /\b(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b/gi;
  while ((m = pMin.exec(desc)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  // Senior keyword tags in body or title
  const hasSeniorTag = /\b(positions?:\s*\d*\s*senior|budget:.*senior|\(senior\)|senior-level|senior\s*(?:professional|practitioner|engineer|developer|consultant|analyst|data scientist|ai|ml|talent|individual|member|specialist|resource|candidate|profile)|lead\s*(?:ai|ml|engineer|developer)|principal\s*(?:ai|ml|engineer|developer)|sr\.\s*(?:ai|ml|engineer|developer))\b/i.test(desc) || /\b(senior|sr\.?|lead|principal|staff|architect|director|head of|leader|manager)\b/i.test(title);

  // Check total/overall experience and minimum required YOE
  const seniorExpMatch = expMatches.find(e => e.min >= 4);
  const hasEntryContext = /\b(intern|internship|fresher|0-1|0-2|0-3|entry-level|trainee|graduate)\b/i.test(desc) || /\b(intern|internship|fresher|trainee|graduate|junior)\b/i.test(title);
  const minRequiredYOE = expMatches.length > 0 ? Math.min(...expMatches.map(e => e.min)) : 0;
  const isMidLevelNoEntry = minRequiredYOE >= 3 && !hasEntryContext;

  const isSeniorRequirement = seniorExpMatch || hasSeniorTag || isMidLevelNoEntry;
  const rejectReason = seniorExpMatch ? `Experience (${seniorExpMatch.raw}) >= 4 yrs` : hasSeniorTag ? 'Senior Title/Tag in JD' : isMidLevelNoEntry ? `${minRequiredYOE}+ YOE required` : 'Senior requirement';

  if (isSeniorRequirement) {
    return {
      fitScore: 0,
      locationTier: 'Tier 4 (Major Indian Hub)',
      credibility: `🔴 Excluded (${rejectReason})`,
      keyMatches: [],
      blockers: [`Seniority requirement in JD (${rejectReason})`],
      isEasyApply: Boolean(job.easyApply),
    };
  }

  const isIntern = title.includes('intern') || (job.employmentType || '').toLowerCase().includes('intern');
  const isFresher = title.includes('graduate') || title.includes('entry') || title.includes('junior') || title.includes('trainee') || desc.includes('0-1') || desc.includes('0-2');

  if (isIntern) {
    fitScore += 15;
    keyMatches.push('Internship (PPO/FTE potential)');
  } else if (isFresher) {
    fitScore += 12;
    keyMatches.push('0-2 YOE / Entry-level role');
  }

  // 3. Technical Core Stack Overlap
  const stackTerms = [
    { term: 'python', pts: 6, label: 'Python' },
    { term: 'langgraph', pts: 8, label: 'LangGraph' },
    { term: 'rag', pts: 6, label: 'RAG Architecture' },
    { term: 'fastapi', pts: 5, label: 'FastAPI' },
    { term: 'pytorch', pts: 5, label: 'PyTorch' },
    { term: 'transformers', pts: 4, label: 'Transformers' },
    { term: 'fine-tuning', pts: 5, label: 'Fine-Tuning / QLoRA' },
    { term: 'qlora', pts: 5, label: 'QLoRA' },
    { term: 'pgvector', pts: 4, label: 'Vector Search / pgvector' },
    { term: 'sql', pts: 3, label: 'SQL / Postgres' },
  ];

  for (const s of stackTerms) {
    if (desc.includes(s.term) || title.includes(s.term)) {
      fitScore += s.pts;
      keyMatches.push(s.label);
    }
  }

  // 4. Location Priority
  if (loc.includes('bengaluru') || loc.includes('bangalore')) {
    fitScore += 5;
    keyMatches.push('Tier 1 Hub (Bengaluru)');
  } else if (loc.includes('hyderabad')) {
    fitScore += 3;
    keyMatches.push('Tier 2 Hub (Hyderabad)');
  } else if (loc.includes('remote')) {
    fitScore += 4;
    keyMatches.push('Remote India');
  }

  // 5. Hard Blockers / Penalties
  if (desc.includes('placement fee') || desc.includes('deposit required') || desc.includes('registration fee')) {
    fitScore = 0;
    blockers.push('Suspected fee / deposit scam');
  }

  fitScore = Math.min(100, Math.max(0, fitScore));

  return {
    fitScore,
    keyMatches: [...new Set(keyMatches)],
    blockers,
  };
}

// ── Credibility & Scam Checker ──────────────────────────────────────────────

function checkNaukriCredibility(job) {
  const desc = (job.description || '').toLowerCase();
  const comp = (job.company || '').toLowerCase();

  const scamIndicators = [
    'registration fee',
    'security deposit',
    'training fee',
    'pay upfront',
    'processing fee',
    'laptop deposit',
  ];

  for (const ind of scamIndicators) {
    if (desc.includes(ind)) {
      return { status: 'SUSPICIOUS', score: 0, reason: `Suspicious payment language: "${ind}"` };
    }
  }

  if (comp.includes('consultancy') || comp.includes('staffing') || comp.includes('placement')) {
    return { status: 'VERIFY', score: 60, reason: 'Third-party recruitment / staffing firm' };
  }

  return { status: 'CREDIBLE', score: 90, reason: 'Legitimate direct employer signals' };
}

// ── Main Discovery Engine ───────────────────────────────────────────────────

export async function runNaukriDiscovery() {
  console.log('\n======================================================');
  console.log(' Career-Ops Targeted Naukri Job Discovery Engine');
  console.log('======================================================');
  console.log(`Target Preset: ${PRESET.toUpperCase()}`);
  console.log(`Job Limit:     ${LIMIT}`);
  console.log(`Headless:      ${HEADLESS}\n`);

  const seenCache = loadSeenCache();
  const searchLanes = buildNaukriQueries(PRESET);
  const discoveredCandidates = [];

  console.log('1. Launching persistent browser context...');
  const context = await createNaukriContext({ headless: HEADLESS });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    for (const lane of searchLanes) {
      console.log(`\n------------------------------------------------------`);
      console.log(`🔍 Searching Lane: ${lane.lane}`);
      console.log(`URL: ${lane.url}`);
      console.log(`------------------------------------------------------`);

      await page.goto(lane.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await randomSleep(3500, 5500);


      const auth = await evaluateNaukriAuthStatus(page);
      if (auth.status === 'checkpoint') {
        console.warn(`\n⚠️ Bot checkpoint encountered on Naukri: ${auth.detail}`);
        console.warn('Halting automated discovery safely.');
        break;
      }

      // Extract Listing Cards
      const rawCards = await page.$$eval(
        'div.srp-jobtuple-wrapper, article.jobTuple, div.cust-job-tuple',
        (elements) => {
          return elements.map((el) => {
            const titleEl = el.querySelector('a.title, a.job-title, [class*="title"]');
            const compEl = el.querySelector('a.comp-name, span.comp-name, a.company-name, [class*="comp-name"]');
            const locEl = el.querySelector('span.loc-wrap, span.locWdth, span[class*="location"], [class*="loc"]');
            const expEl = el.querySelector('span.exp-wrap, span.expwdth, span[class*="experience"], [class*="exp"]');
            const salEl = el.querySelector('span.sal-wrap, span.sal, span[class*="salary"]');
            const descEl = el.querySelector('span.job-desc, div.job-description, [class*="desc"]');
            const tags = Array.from(el.querySelectorAll('ul.tags-gt li, li.dot-gt, ul.tags li')).map((t) => t.innerText.trim());

            return {
              title: titleEl?.innerText?.trim() || '',
              url: titleEl?.href || '',
              company: compEl?.innerText?.trim() || 'Direct Employer',
              location: locEl?.innerText?.trim() || 'Bengaluru, Karnataka',
              experience: expEl?.innerText?.trim() || '0-2 Yrs',
              salary: salEl?.innerText?.trim() || 'Not Disclosed',
              snippet: descEl?.innerText?.trim() || '',
              tags,
            };
          });
        }
      ).catch(() => []);

      console.log(`• Found ${rawCards.length} job cards in this lane.`);

      for (const card of rawCards) {
        if (!card.url || !card.title) continue;

        // Clean URL
        const cleanUrl = card.url.split('?')[0];

        // Deduplication Check
        if (seenCache[cleanUrl] || discoveredCandidates.some((d) => d.url === cleanUrl)) {
          continue;
        }


        // Stage 1 Triage
        const triage = triageNaukriCard(card);
        if (!triage.pass) {
          continue;
        }

        discoveredCandidates.push({
          ...card,
          url: cleanUrl,
          lane: lane.lane,
        });

        if (discoveredCandidates.length >= LIMIT * 1.5) break;
      }

      await randomSleep(3500, 5500);
    }


    console.log(`\n2. Stage 1 Complete: ${discoveredCandidates.length} potential jobs passed triage.`);
    console.log('3. Performing Stage 2 deep inspection on top roles...');

    const rankedQueue = [];

    for (let i = 0; i < Math.min(discoveredCandidates.length, LIMIT); i++) {
      const candidate = discoveredCandidates[i];
      console.log(`→ [${i + 1}/${Math.min(discoveredCandidates.length, LIMIT)}] Inspecting: ${candidate.company} — ${candidate.title}`);

      try {
        await page.goto(candidate.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await randomSleep(2000, 3500);
        await naturalScroll(page);

        await page.waitForSelector('div.job-desc, section.job-desc, div.dang-inner-html, .styles_JDC__dang-inner-html__h0K4t, .styles_job-desc-container, main', { timeout: 8000 }).catch(() => {});

        const pageData = await page.evaluate(() => {
          const jdEl = document.querySelector('div.job-desc, section.job-desc, div.dang-inner-html, .styles_JDC__dang-inner-html__h0K4t, .styles_job-desc-container, main');
          const description = jdEl ? jdEl.innerText : document.body.innerText;

          // Check application button type
          const applySiteBtn = Boolean(document.querySelector('button:has-text("Apply on company site"), a:has-text("Apply on company site")'));
          const directApplyBtn = Boolean(document.querySelector('button:has-text("Apply"), button#apply-button, .apply-button'));

          const appType = applySiteBtn ? 'EXTERNAL_ATS' : directApplyBtn ? 'NAUKRI_APPLY' : 'DIRECT';

          return {
            description: description || '',
            applicationType: appType,
          };
        }).catch(() => ({ description: candidate.snippet, applicationType: 'NAUKRI_APPLY' }));

        const fullJob = {
          ...candidate,
          description: pageData.description,
          applicationType: pageData.applicationType,
        };

        const fit = evaluateNaukriJobFit(fullJob);
        const cred = checkNaukriCredibility(fullJob);

        if (fit.fitScore >= 60 && cred.status !== 'SUSPICIOUS') {
          rankedQueue.push({
            id: `naukri-${Date.now()}-${i}`,
            platform: 'naukri',
            company: candidate.company,
            title: candidate.title,
            location: candidate.location,
            salary: candidate.salary,
            experience: candidate.experience,
            url: candidate.url,
            applicationType: pageData.applicationType,
            fitScore: fit.fitScore,
            keyMatches: fit.keyMatches,
            blockers: fit.blockers,
            credibility: cred.status,
            discoveredAt: new Date().toISOString(),
          });

          seenCache[candidate.url] = {
            title: candidate.title,
            company: candidate.company,
            fitScore: fit.fitScore,
            seenAt: new Date().toISOString(),
          };
        }
      } catch (err) {
        console.warn(`  ⚠️ Could not deeply inspect ${candidate.url}: ${err.message}`);
      }

      await randomSleep(3500, 6000);
    }


    // Sort by Fit Score descending
    rankedQueue.sort((a, b) => b.fitScore - a.fitScore);

    // Save outputs
    saveSeenCache(seenCache);
    writeFileSync(QUEUE_FILE, JSON.stringify(rankedQueue, null, 2), 'utf-8');

    console.log(`\n✅ Saved ${rankedQueue.length} ranked candidate jobs to ${QUEUE_FILE}`);

    // Print Summary Table
    console.log('\n======================================================');
    console.log(' TOP NAUKRI APPLICATION QUEUE');
    console.log('======================================================');

    for (let j = 0; j < rankedQueue.length; j++) {
      const q = rankedQueue[j];
      const appIcon = q.applicationType === 'NAUKRI_APPLY' ? '🟢 Naukri Fast Apply' : '🔵 External Company ATS';
      console.log(`\n[#${j + 1}] ${q.company} — ${q.title} (Fit Score: ${q.fitScore}/100)`);
      console.log(`• Location:      ${q.location}`);
      console.log(`• Experience:    ${q.experience}`);
      console.log(`• Type:          ${appIcon}`);
      console.log(`• Key Matches:   ${q.keyMatches.slice(0, 3).join(' | ')}`);
      console.log(`• URL:           ${q.url}`);
    }

    console.log('\n======================================================');
    console.log(' DISCOVERY SUMMARY');
    console.log('======================================================');
    console.log(`• Discovered Roles:   ${rankedQueue.length} opportunities`);
    console.log(`• Next Action:        Run application assistant with:`);
    console.log(`  node scripts/naukri/naukri-apply-queue.mjs\n`);

  } finally {
    await context.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runNaukriDiscovery().catch((err) => {
    console.error('Fatal Discovery Error:', err);
    process.exit(1);
  });
}
