#!/usr/bin/env node

/**
 * scripts/linkedin/linkedin-discover.mjs
 *
 * Targeted LinkedIn Job Discovery, Local Triage, Deep Scoring & Daily Queue Generator
 *
 * Capabilities:
 * 1. Target Presets: Bengaluru (Tier 1), Hyderabad (Tier 2), Remote India (Tier 3), or All.
 * 2. Conservative Sequential Queries (3-5 highly targeted searches).
 * 3. 2-Stage Pipeline:
 *    - Stage 1: Local listing-level triage (filters out senior, non-AI, incompatible locations).
 *    - Stage 2: Deep sequential inspection on top candidate JDs (extracts stack, freshness, credibility).
 * 4. Candidate Fit Scoring (0-100) based on verified profile (LangGraph, FastAPI, RAG, PyTorch, etc.).
 * 5. Initial Credibility Check (🟢 Strong signals, 🟡 Needs verification, 🔴 Suspicious).
 * 6. Generates Daily Application Queue in `data/linkedin-queue.json` & formatted summary table.
 * 7. State-based waits (avoids blind long delays).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as yaml from 'js-yaml';
import {
  createLinkedInContext,
  evaluateAuthStatus,
  DEFAULT_PROFILE_DIR,
} from './linkedin-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');
const QUEUE_FILE = resolve(ROOT_DIR, 'data/linkedin-queue.json');
const PIPELINE_FILE = resolve(ROOT_DIR, 'data/pipeline.md');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomJitter = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

function extractJdFromDom() {
  const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, span, strong'));
  const aboutJobHeader = headings.find(el => (el.innerText || '').trim().toLowerCase().includes('about the job'));
  if (aboutJobHeader) {
    let node = aboutJobHeader;
    while (node && node.parentElement && node.parentElement.tagName !== 'BODY') {
      node = node.parentElement;
      if (node.innerText && node.innerText.length > 300) {
        return node.innerText.trim();
      }
    }
  }
  const fullText = document.body.innerText || '';
  const idx = fullText.toLowerCase().indexOf('about the job');
  if (idx !== -1) {
    return fullText.slice(idx).trim();
  }
  return '';
}

// ── CLI Arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const PRESET = (getArg('--preset', 'all')).toLowerCase();
const LIMIT_ARG = getArg('--limit', null);
const LIMIT = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : 300; // Expanded safety cap for comprehensive coverage
const HEADLESS = args.includes('--headless');
const SAVE_PIPELINE = args.includes('--save-pipeline');

const TIME_PARAM = (getArg('--time', 'dual')).toLowerCase();

// ── Preset Search Lanes ─────────────────────────────────────────────────────

function buildSearchQueries(preset, timeParam = TIME_PARAM) {
  const timeFilters = [];
  if (timeParam === 'dual') {
    timeFilters.push({ label: 'Pass 1: Past 24 Hours (Fresh Requisitions)', filter: 'f_TPR=r86400&sortBy=DD', tag: '[24H]' });
    timeFilters.push({ label: 'Pass 2: Past Full Week (Active Backlog)', filter: 'f_TPR=r604800&sortBy=DD', tag: '[WEEK]' });
  } else if (timeParam === '7d') {
    timeFilters.push({ label: 'Past 7 Days Sweep', filter: 'f_TPR=r604800&sortBy=DD', tag: '[WEEK]' });
  } else {
    timeFilters.push({ label: 'Past 24 Hours Sweep', filter: 'f_TPR=r86400&sortBy=DD', tag: '[24H]' });
  }

  const queries = [];
  for (const tf of timeFilters) {
    const bf = tf.filter;
    const tag = tf.tag;

    if (preset === 'intern' || preset === 'internship' || preset === 'internships') {
      queries.push({
        lane: `${tag} Bengaluru — AI Engineer Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Artificial%20Intelligence%20Intern&geoId=105214831&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Bengaluru — Generative AI & LLM Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=Generative%20AI%20Intern%20OR%20LLM%20Intern&geoId=105214831&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Bengaluru — Machine Learning Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20Intern%20OR%20ML%20Intern&geoId=105214831&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Bengaluru — Forward Deployed AI / FDE Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=Forward%20Deployed%20Intern%20OR%20FDE%20Intern&geoId=105214831&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Bengaluru — Data Science & NLP Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=Data%20Science%20Intern%20OR%20NLP%20Intern&geoId=105214831&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Hyderabad — AI / ML Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern&geoId=105556991&f_JT=I&${bf}`,
      });
      queries.push({
        lane: `${tag} Remote India — AI / GenAI / LLM Internships`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Generative%20AI%20Intern&geoId=102713980&f_WT=2&f_JT=I&${bf}`,
      });
      continue;
    }

    if (preset === 'hyderabad' || preset === 'tier2') {
      queries.push({
        lane: `${tag} Hyderabad — AI & Machine Learning Engineer`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20OR%20Generative%20AI&geoId=105556991&${bf}`,
      });
      queries.push({
        lane: `${tag} Hyderabad — Python AI / FDE Developer`,
        url: `https://www.linkedin.com/jobs/search/?keywords=Python%20AI%20OR%20Forward%20Deployed&geoId=105556991&${bf}`,
      });
      continue;
    }

    if (preset === 'remote' || preset === 'tier3') {
      queries.push({
        lane: `${tag} Remote India — AI / GenAI / FDE Engineer`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20OR%20Generative%20AI&geoId=102713980&f_WT=2&${bf}`,
      });
      queries.push({
        lane: `${tag} Remote India — AI / LLM Internships (0-1 YOE)`,
        url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20ML%20Intern&geoId=102713980&f_WT=2&${bf}`,
      });
      continue;
    }

    // High-Priority: Personalized "Jobs Recommended for You" Collection Feed
    queries.push({
      lane: `Personalized Recommended Jobs Feed ("Recommended for You")`,
      url: `https://www.linkedin.com/jobs/collections/recommended/`,
      isRecommendedFeed: true,
    });

    // Default 'all' preset: Bengaluru Hub + Hyderabad Hub + Remote India
    queries.push({
      lane: `${tag} Bengaluru — Applied AI, Agentic & AI Startups`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Applied%20AI%20OR%20Agentic%20AI%20OR%20AI%20Startup&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Bengaluru — Broad AI & Artificial Intelligence`,
      url: `https://www.linkedin.com/jobs/search/?keywords=AI%20OR%20Artificial%20Intelligence&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Bengaluru — Generative AI, LLM & AI Engineering`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Generative%20AI%20OR%20GenAI%20OR%20LLM%20OR%20AI%20Engineering&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Bengaluru — Forward Deployed AI & Agentic Systems`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Forward%20Deployed%20OR%20FDE%20OR%20Agentic%20AI%20OR%20AI%20Agent%20OR%20LangGraph&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Bengaluru — Machine Learning & Applied AI`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20OR%20Applied%20AI%20OR%20AI%20Developer&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Bengaluru — AI, ML & Data Science Internships`,
      url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern%20OR%20GenAI%20Intern%20OR%20Data%20Science%20Intern&geoId=105214831&${bf}`,
    });
    queries.push({
      lane: `${tag} Hyderabad — Applied AI & Broad Machine Learning`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Applied%20AI%20OR%20Artificial%20Intelligence%20OR%20Machine%20Learning&geoId=105556991&${bf}`,
    });
    queries.push({
      lane: `${tag} Hyderabad — Generative AI, LLM & AI Engineer`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Generative%20AI%20OR%20GenAI%20OR%20LLM%20OR%20AI%20Engineer%20OR%20AI%20Engineering&geoId=105556991&${bf}`,
    });
    queries.push({
      lane: `${tag} Hyderabad — AI Internships & Data Science`,
      url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Intern%20OR%20Machine%20Learning%20Intern%20OR%20Data%20Scientist&geoId=105556991&${bf}`,
    });
    queries.push({
      lane: `${tag} Remote India — AI, GenAI & Machine Learning`,
      url: `https://www.linkedin.com/jobs/search/?keywords=AI%20OR%20Generative%20AI%20OR%20Machine%20Learning&geoId=102713980&f_WT=2&${bf}`,
    });
    queries.push({
      lane: `${tag} Remote India — Forward Deployed, Internships & Data Science`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Forward%20Deployed%20OR%20AI%20Intern%20OR%20Data%20Scientist&geoId=102713980&f_WT=2&${bf}`,
    });
    queries.push({
      lane: `${tag} India (Hybrid) — AI, GenAI & Agentic Systems`,
      url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Engineer%20OR%20Generative%20AI%20OR%20Agentic&geoId=102713980&f_WT=3&${bf}`,
    });
    queries.push({
      lane: `${tag} India (Hybrid) — Machine Learning & Python AI`,
      url: `https://www.linkedin.com/jobs/search/?keywords=Machine%20Learning%20OR%20Python%20AI%20OR%20AI%20Intern&geoId=102713980&f_WT=3&${bf}`,
    });
  }

  return queries;
}



// ── Seen URLs Cache ─────────────────────────────────────────────────────────

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
  } catch (e) {
    // ignore
  }
}

// ── Stage 1: Listing-Level Fast Triage ──────────────────────────────────────

function triageListingCard(card) {
  const title = (card.title || '').toLowerCase();
  const location = (card.location || '').toLowerCase();

  // Hard Seniority & Mid-Level Exclusions (Sri Hari is early-career 0-1 YOE):
  // Reject Senior, Sr, Lead, Tech Lead, Staff, Principal, Architect, VP, Director, Head of, Manager
  if (/\b(senior|sr\.?|lead|tech lead|principal|staff|architect|director|head of|group manager|manager|vp|chief|partner|distinguished)\b/i.test(title)) {
    return { pass: false, reason: 'Senior / Lead / Leadership title' };
  }
  // Reject Level II / Level III / SDE 2 / SWE 2 / Software Engineer II
  if (/\b(sde[- ]?(?:2|ii|3|iii)|swe[- ]?(?:2|ii|3|iii)|engineer[- ]?(?:2|ii|3|iii)|developer[- ]?(?:2|ii|3|iii)|level[- ]?(?:2|ii|3|iii))\b/i.test(title) || /software engineer ii\b/i.test(title)) {
    return { pass: false, reason: 'Mid/Senior Level II+ title' };
  }

  // Hard Role Non-AI / Non-Technical Exclusions
  if (/\b(sales|marketing|recruiter|hr|talent|business development|bde|sdr|social media|video|editing|filmmaking|creative|graphic|content|writer|accountant|lawyer|operations|support|executive|psychology|air ticketing|private equity|investment analyst|branding|growth|educator)\b/i.test(title)) {
    return { pass: false, reason: 'Non-technical role' };
  }
  if (/\b(java developer|dotnet|\.net|php|wordpress|manual qa|frontend developer|angular|android|ios|web developer|pilot)\b/i.test(title) && !title.includes('ai') && !title.includes('ml') && !title.includes('agent')) {
    return { pass: false, reason: 'Unrelated legacy tech stack' };
  }

  // MUST be AI, ML, GenAI, Agentic, LLM, FDE, Computer Vision, NLP, Data Science, or Python AI
  const isTargetAiTech = /\b(ai\b|artificial intelligence|machine learning|ml\b|genai|generative|llm|agentic|ai agent|langgraph|fde|forward deployed|data science|computer vision|nlp|robotics|rag|deep learning|intelligence data|data and ai|data & ai)\b/i.test(title);
  if (!isTargetAiTech) {
    return { pass: false, reason: 'Title lacks AI/ML/GenAI/FDE focus' };
  }

  // Location Verification - Bengaluru (Tier 1), Hyderabad (Tier 2), Remote / Hybrid Pan-India (Tier 3)
  if (location.length > 2) {
    const isBengaluru = location.includes('bengaluru') || location.includes('bangalore') || location.includes('karnataka');
    const isHyderabad = location.includes('hyderabad') || location.includes('telangana');
    const isForeign = /\b(united states|us\b|uk\b|europe|germany|canada|singapore|australia|dubai|uae)\b/i.test(location);
    const isRemoteOrHybrid = location.includes('remote') || location.includes('hybrid') || title.includes('remote') || title.includes('hybrid');
    const isIndia = location.includes('india') || isBengaluru || isHyderabad || /\b(pune|mumbai|delhi|noida|gurgaon|gurugram|chennai|kolkata|ahmedabad)\b/i.test(location);

    if (isForeign) {
      return { pass: false, reason: 'Location is foreign' };
    }

    // If outside Bengaluru / Hyderabad, ONLY permit if Remote or Hybrid
    if (!isBengaluru && !isHyderabad) {
      if (isIndia && !isRemoteOrHybrid) {
        return { pass: false, reason: 'Location outside Bengaluru/Hyderabad and not marked Remote/Hybrid' };
      }
    }
  }

  return { pass: true, reason: 'Passed Stage 1 Triage' };
}

// ── Stage 2: Deep Candidate Fit Scoring ─────────────────────────────────────

function evaluateJobFit(job) {
  const title = (job.title || '').toLowerCase();
  
  // Normalization: Unify dashes and collapse spaces around numbers, pluses, and hyphens
  let rawDesc = (job.description || '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/(\d+)\s*\+\s*(?:years?|yrs?|yoe)/gi, '$1+ years')
    .replace(/(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?|yoe)/gi, '$1-$2 years')
    .replace(/(\d+)\s*to\s*(\d+)\s*(?:years?|yrs?|yoe)/gi, '$1-$2 years');
  const desc = rawDesc.toLowerCase();
  const loc = (job.location || '').toLowerCase();
  const comp = (job.company || '').toLowerCase();

  let fitScore = 50; // Base score for relevant title in search lane
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
  } else if (title.includes('data scientist') || title.includes('data science')) {
    fitScore += 8;
    keyMatches.push('Tier 4 Target (Data Science)');
  }

  // 2. Comprehensive Numerical Experience Level Alignment & Hard Seniority Gate
  const expMatches = [];
  const addMatch = (num1, num2, raw, isTotal = false) => {
    if (!isNaN(num1) && num1 >= 0 && num1 <= 35) {
      const maxVal = (!isNaN(num2) && num2 >= num1) ? num2 : (raw.includes('+') ? num1 + 2 : num1);
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

  // Senior keyword tags in title OR inside the JD body
  const hasSeniorLeadershipTitle = /\b(senior|sr\.?|lead\b|principal\b|staff\b|architect\b|director\b|head of\b|leader\b|manager\b|vp\b|vice president\b|chief\b)/i.test(title) ||
    /\b(sde[- ]?(?:2|ii|3|iii)|swe[- ]?(?:2|ii|3|iii)|engineer[- ]?(?:2|ii|3|iii)|developer[- ]?(?:2|ii|3|iii)|level[- ]?(?:2|ii|3|iii))\b/i.test(title) ||
    /software engineer ii\b/i.test(title) ||
    /(?:job\s*title|position|role)[:\s-]+[^\n\r]*(?:lead|principal|staff|architect|technical lead|tech lead|senior engineer)/i.test(desc);

  // HARD REJECT if:
  // - Minimum required is 3 or more (e.g. 3+, 3-5, 4+, 5-8)
  // - Or range where max >= 5 and min >= 3 (e.g. 3-5, 3-6)
  // - Or explicit mention of "3+ years", "3+ yrs", "3+ yoe", "4+ years", "minimum 3", "at least 3"
  // Note: 0-2 YOE, 1-2 YOE, 1-3 YOE, and 2+ YOE in startups are accepted!
  const seniorExpMatch = expMatches.find(e => 
    e.min >= 4 || 
    (!isNaN(e.max) && e.max >= 5 && e.min >= 3) ||
    /\b(?:3\s*\+|3\s*plus|[4-9]\s*\+|\d{2,}\s*\+)\s*(?:years?|yrs?|yoe)\b/i.test(e.raw) ||
    /\b(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?[3-9]\s*(?:years?|yrs?|yoe)\b/i.test(e.raw)
  );

  if (seniorExpMatch || hasSeniorLeadershipTitle) {
    const rejectReason = seniorExpMatch ? `Experience (${seniorExpMatch.raw}) exceeds 0-2 YOE early-career profile` : 'Senior / Level II+ Leadership Title';
    return {
      fitScore: 0,
      locationTier: 'Tier 4 (Major Indian Hub)',
      credibility: `🔴 Excluded (${rejectReason})`,
      keyMatches: [],
      blockers: [`Seniority requirement in JD (${rejectReason})`],
      isEasyApply: Boolean(job.easyApply),
    };
  }

  // Tier 1 vs Tier 2 Experience Classification
  const minRequiredYOE = expMatches.length > 0 ? Math.min(...expMatches.map(e => e.min)) : 0;
  const isIntern = title.includes('intern') || (job.employmentType || '').toLowerCase().includes('intern') || desc.includes('internship');
  const isFresher = title.includes('graduate') || title.includes('entry') || title.includes('junior') || title.includes('associate') || desc.includes('0-1') || desc.includes('0-2') || minRequiredYOE <= 2;

  if (isIntern) {
    fitScore += 30;
    keyMatches.push('🎓 Tier 1: Internship (PPO/FTE potential)');
  } else if (isFresher) {
    fitScore += 30;
    keyMatches.push('🎯 Tier 1: 0-2 YOE / Entry-level role');
  }

  // Freshness Scoring (Past 7 Days with <24h as Top Preference)
  const ageStr = (job.ageText || job.postedTime || '').toLowerCase();
  if (/\b(hour|minute|just now|today|0 days|1 day)\b/i.test(ageStr)) {
    fitScore += 25;
    keyMatches.push('⚡ Freshly Posted (< 24h / Early Applicant)');
  } else if (/\b([2-7]\s*days?)\b/i.test(ageStr)) {
    fitScore += 10;
    keyMatches.push('📅 Recent Posting (Past 7 Days)');
  }

  // 3. Verified Stack Overlap (Profile Match)
  if (/langgraph|multi[- ]agent|agentic|state machine|workflow/i.test(desc)) {
    fitScore += 15;
    keyMatches.push('LangGraph / Multi-Agent Systems');
  }
  if (/fastapi|python|asyncio|pydantic/i.test(desc)) {
    fitScore += 10;
    keyMatches.push('Python / FastAPI / Asyncio');
  }
  if (/rag|pgvector|vector|faiss|retrieval|embeddings/i.test(desc)) {
    fitScore += 10;
    keyMatches.push('RAG / Vector Databases');
  }
  if (/azure openai|openai|groq|llama|llm|generative ai/i.test(desc)) {
    fitScore += 8;
    keyMatches.push('LLMOps / GenAI Architectures');
  }
  if (/evaluation|eval|testing|benchmarking|langsmith/i.test(desc)) {
    fitScore += 8;
    keyMatches.push('AI Evaluation & Testing');
  }
  if (/pytorch|transformers|deberta|nlp/i.test(desc)) {
    fitScore += 6;
    keyMatches.push('PyTorch / Transformers / NLP');
  }
  if (/react|typescript|frontend/i.test(desc)) {
    keyMatches.push('React / TypeScript full-stack exposure');
  }

  // 4. Missing / Blocker Tech
  if (/c\+\+|cuda|low[- ]level gpu|triton/i.test(desc)) {
    blockers.push('Low-level CUDA/GPU requirement');
  }
  if (/java enterprise|spring boot/i.test(desc) && !desc.includes('python')) {
    blockers.push('Pure Java/Spring enterprise stack');
  }

  // 5. Location Tiering Bonus
  let locationTier = 'Tier 4 (Other Indian Hub - Remote/Hybrid)';
  if (loc.includes('bengaluru') || loc.includes('bangalore') || loc.includes('karnataka')) {
    locationTier = 'Tier 1 (Bengaluru)';
    fitScore += 10;
  } else if (loc.includes('hyderabad') || loc.includes('telangana')) {
    locationTier = 'Tier 2 (Hyderabad)';
    fitScore += 6;
  } else if (loc.includes('remote') || title.includes('remote')) {
    locationTier = 'Tier 3 (Remote India)';
    fitScore += 4;
  } else if (loc.includes('hybrid') || title.includes('hybrid')) {
    locationTier = 'Tier 3 (Hybrid India)';
    fitScore += 3;
  } else {
    locationTier = 'Tier 4 (Other Hub - Remote/Hybrid)';
    fitScore += 2;
  }

  // 6. Application Type
  const isEasyApply = Boolean(job.easyApply);
  if (isEasyApply) {
    fitScore += 5;
  }

  // 7. Initial Credibility Check
  let credibility = '🟢 Strong signals';
  if (desc.includes('registration fee') || desc.includes('pay deposit') || desc.includes('telegram')) {
    credibility = '🔴 Suspicious / exclude';
    fitScore = 0;
  } else if (desc.includes('early stage') || desc.includes('founding') || desc.includes('stealth')) {
    credibility = '🟡 Needs verification (Early-stage startup)';
  } else if (comp.length > 2) {
    credibility = '🟢 Strong signals';
  }

  // Normalize score between 0 and 100
  fitScore = Math.max(0, Math.min(100, fitScore));

  return {
    fitScore,
    locationTier,
    credibility,
    keyMatches: Array.from(new Set(keyMatches)),
    blockers: Array.from(new Set(blockers)),
    isEasyApply,
  };
}

// ── Safe Page Navigation with Network Retry ──────────────────────────────────

async function safeGoto(page, url, options = { waitUntil: 'domcontentloaded', timeout: 35000 }, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await page.goto(url, options);
      return true;
    } catch (err) {
      const isNetError = /ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_CONNECTION_RESET|ERR_CONNECTION_TIMED_OUT|timeout/i.test(err.message);
      if (isNetError && attempt < maxRetries) {
        console.warn(`  ⚠️ Temporary network flicker (${err.message.split('\n')[0]}). Retrying navigation (${attempt}/${maxRetries}) in 5s...`);
        await sleep(5000 * attempt);
      } else if (attempt === maxRetries) {
        throw err;
      } else {
        throw err;
      }
    }
  }
}

// ── Main Discovery Execution ────────────────────────────────────────────────

async function runDiscovery() {
  console.log('\n======================================================');
  console.log(' LinkedIn Discovery & Daily Application Queue Generator');
  console.log('======================================================');
  console.log(`Preset:      ${PRESET.toUpperCase()}`);
  console.log(`Target Limit: Up to ${LIMIT} deep-inspected candidate roles`);
  console.log(`Profile Dir:  ${DEFAULT_PROFILE_DIR}\n`);

  const seenCache = loadSeenCache();
  const searchQueries = buildSearchQueries(PRESET);

  // Load applied companies from tracker to strictly avoid duplicates
  const trackerFile = resolve(ROOT_DIR, 'data/applications.md');
  const appliedCompaniesSet = new Set();
  if (existsSync(trackerFile)) {
    const trackerText = readFileSync(trackerFile, 'utf-8');
    trackerText.split('\n').forEach((l) => {
      const cols = l.split('|').map((s) => s.trim());
      if (cols.length >= 4 && cols[2] && !cols[2].includes('Company') && !cols[2].includes('---')) {
        const clean = cols[2].toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').replace(/[^a-z0-9]/g, '').trim();
        if (clean.length >= 2) {
          appliedCompaniesSet.add(clean);
        }
      }
    });
  }

  // Load blacklisted companies from data/blacklist.md
  const blacklistFile = resolve(ROOT_DIR, 'data/blacklist.md');
  const blacklistedCompaniesSet = new Set();
  if (existsSync(blacklistFile)) {
    const blText = readFileSync(blacklistFile, 'utf-8');
    blText.split('\n').forEach((l) => {
      const cols = l.split('|').map((s) => s.trim());
      if (cols.length >= 2 && cols[1] && !cols[1].includes('Company') && !cols[1].includes('---') && !cols[1].startsWith('#')) {
        const clean = cols[1].toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').replace(/[^a-z0-9]/g, '').trim();
        if (clean.length >= 2) {
          blacklistedCompaniesSet.add(clean);
        }
      }
    });
  }

  console.log(`• Loaded ${appliedCompaniesSet.size} distinct applied companies for deduplication.`);
  console.log(`• Loaded ${blacklistedCompaniesSet.size} blacklisted companies to skip.`);

  console.log(`1. Launching authenticated LinkedIn browser session (${HEADLESS ? 'headless' : 'visible'})...`);
  const context = await createLinkedInContext({ headless: HEADLESS });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  let totalListingsFound = 0;
  let stage1Passed = 0;
  let stage1Filtered = 0;
  let duplicatesSkipped = 0;
  let blacklistedSkipped = 0;
  const rawCandidateCards = [];

  const PAGES = parseInt(getArg('--pages', '3'), 10);

  try {
    // ── STAGE 1: Deep Sequential Listing Collection & Triage (Pages 1 to 3) ───
    for (const query of searchQueries) {
      for (let p = 0; p < PAGES; p++) {
        if (query.isRecommendedFeed && p > 0) {
          break; // Recommended collection loads dynamically via infinite scroll
        }
        const pageStart = p * 25;
        const pageUrl = p === 0 ? query.url : `${query.url}&start=${pageStart}`;
        console.log(`\n• Querying Lane: "${query.lane}" (Page ${p + 1}/${query.isRecommendedFeed ? 1 : PAGES}, start=${pageStart})...`);
        await safeGoto(page, pageUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
        await sleep(randomJitter(2500, 3800));

        const auth = await evaluateAuthStatus(page);
        if (auth.status === 'checkpoint' || auth.status === 'login_required') {
          console.error(`⚠️ Session issue in search lane: ${auth.detail}`);
          break;
        }

        // Scroll search results container sequentially to trigger virtualized list loading
        const scrollCount = query.isRecommendedFeed ? 16 : 8;
        for (let s = 0; s < scrollCount; s++) {
          await page.evaluate(() => {
            const items = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div[data-job-id], div.base-card');
            if (items.length > 0) {
              items[items.length - 1].scrollIntoView({ behavior: 'auto', block: 'end' });
            }
            const scrollers = document.querySelectorAll('.jobs-search-results-list, .scaffold-layout__list-detail-inner, main');
            scrollers.forEach((sc) => { sc.scrollTop += 1500; });
          });
          await sleep(350);
        }
        await sleep(randomJitter(800, 1500));

        // Extract cards on page
        const cards = await page.evaluate(() => {
          const items = document.querySelectorAll(
            'li.jobs-search-results__list-item, div.job-card-container, div.base-card, div[data-job-id]'
          );
          const results = [];

          items.forEach((item) => {
            const titleEl = item.querySelector(
              '.job-card-list__title, a.job-card-container__link, h3, a.base-card__full-link'
            );
            const companyEl = item.querySelector(
              '.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4, span.job-card-container__company-name'
            );
            const locEl = item.querySelector(
              '.job-card-container__metadata-item, .job-search-card__location, span.job-card-container__metadata-wrapper'
            );
            const linkEl = item.querySelector('a[href*="/jobs/view/"]');
            const cardText = item.innerText || '';
            let locText = locEl ? locEl.innerText.trim() : '';
            if (!locText) {
              const lines = cardText.split('\n').map(s => s.trim()).filter(Boolean);
              const foundLoc = lines.find(l => /bengaluru|bangalore|hyderabad|telangana|karnataka|remote|hybrid|pune|mumbai|noida|gurgaon|chennai|delhi|india/i.test(l));
              if (foundLoc) locText = foundLoc;
            }
            const isEasyApply = Boolean(item.querySelector('.job-card-container__easy-apply-text, svg[data-test-icon*="easy-apply"]')) || cardText.includes('Easy Apply');

            const timeEl = item.querySelector('time, .job-search-card__listdate, .job-card-container__listed-time, .base-search-card__metadata');
            const postedTime = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText.trim()) : '';

            const href = linkEl ? linkEl.href : '';
            const m = href.match(/\/jobs\/view\/(\d+)/);
            const jobId = m ? m[1] : '';

            if (jobId && titleEl) {
              results.push({
                jobId,
                title: titleEl.innerText.trim(),
                company: companyEl ? companyEl.innerText.trim() : '',
                location: locText,
                url: `https://www.linkedin.com/jobs/view/${jobId}/`,
                easyApply: isEasyApply,
                postedTime,
              });
            }
          });
          return results;
        });

        console.log(`  Discovered ${cards.length} listing cards on Page ${p + 1}.`);
        totalListingsFound += cards.length;

        for (const card of cards) {
          const normComp = (card.company || '').toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').replace(/[^a-z0-9]/g, '').trim();
          
          // Blacklist check
          const isBlacklisted = normComp.length >= 2 && blacklistedCompaniesSet.has(normComp);
          if (isBlacklisted) {
            blacklistedSkipped++;
            continue;
          }

          const isAppliedCompany = normComp.length >= 2 && appliedCompaniesSet.has(normComp);
          const cleanCardUrl = (card.url || '').split('?')[0].replace(/\/+$/, '');
          const isAppliedUrl = Boolean(
            (cleanCardUrl && seenCache[cleanCardUrl] && seenCache[cleanCardUrl].status === 'APPLIED') ||
            (cleanCardUrl && seenCache[cleanCardUrl + '/'] && seenCache[cleanCardUrl + '/'].status === 'APPLIED')
          );
          const isAppliedJobId = Boolean(card.jobId && seenCache[card.jobId] && seenCache[card.jobId].status === 'APPLIED');

          if (isAppliedCompany || isAppliedJobId || isAppliedUrl) {
            duplicatesSkipped++;
            continue;
          }

          const triage = triageListingCard(card);
          if (triage.pass) {
            stage1Passed++;
            if (!rawCandidateCards.some((c) => c.jobId === card.jobId)) {
              rawCandidateCards.push(card);
            }
          } else {
            stage1Filtered++;
          }
        }

        // If page had very few cards, no need to go deeper into next page for this query
        if (cards.length < 5) {
          break;
        }

        // Natural human jitter pause between pagination requests
        await sleep(randomJitter(2500, 4000));
      }
    }

    console.log(`\n======================================================`);
    console.log(` STAGE 1 TRIAGE SUMMARY`);
    console.log(`======================================================`);
    console.log(`• Total Listings Retrieved:   ${totalListingsFound}`);
    console.log(`• Removed by Stage 1 Filter:  ${stage1Filtered} (Seniority/Non-AI/Location)`);
    console.log(`• Already Applied (Skipped):  ${duplicatesSkipped}`);
    console.log(`• Qualified for Deep Review:  ${rawCandidateCards.length}`);
    console.log(`======================================================\n`);

    // ── STAGE 2: Deep Sequential Inspection on Qualified Candidate JDs ───
    const candidatePool = rawCandidateCards.slice(0, LIMIT);
    console.log(`2. Sequentially inspecting up to ${candidatePool.length} qualified candidate postings (Safety Cap: ${LIMIT})...\n`);

    const evaluatedQueue = [];

    for (let i = 0; i < candidatePool.length; i++) {
      const card = candidatePool[i];
      console.log(`→ [${i + 1}/${candidatePool.length}] Inspecting: ${card.company || 'Company'} — ${card.title} (${card.url})`);

      try {
        await safeGoto(page, card.url, { waitUntil: 'domcontentloaded', timeout: 25000 });
        await sleep(2200);

        // Scroll and expand the full description
        await page.evaluate(() => {
          const scroller = document.querySelector('.jobs-description, .jobs-description__content, main') || window;
          if (scroller.scrollBy) scroller.scrollBy(0, 1500);
          else window.scrollBy(0, 1500);

          const buttons = Array.from(document.querySelectorAll('button, .artdeco-button, button.jobs-description__footer-button'));
          buttons.forEach((btn) => {
            const txt = (btn.innerText || '').toLowerCase();
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (txt.includes('see more') || txt.includes('show more') || aria.includes('see more') || aria.includes('show more')) {
              btn.click();
            }
          });
        });
        await sleep(1600);

        const details = await page.evaluate(() => {
          function extractJdFromDom() {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, h4, span, strong'));
            const aboutJobHeader = headings.find(el => (el.innerText || '').trim().toLowerCase().includes('about the job'));
            if (aboutJobHeader) {
              let node = aboutJobHeader;
              while (node && node.parentElement && node.parentElement.tagName !== 'BODY') {
                node = node.parentElement;
                if (node.innerText && node.innerText.length > 300) {
                  return node.innerText.trim();
                }
              }
            }
            const fullText = document.body.innerText || '';
            const idx = fullText.toLowerCase().indexOf('about the job');
            if (idx !== -1) {
              return fullText.slice(idx).trim();
            }
            return '';
          }

          const descEl = document.querySelector(
            '.jobs-description__content, #job-details, .jobs-box__html-content, .description__text'
          );
          const fullDescText = extractJdFromDom() || (descEl ? descEl.innerText : document.body.innerText);
          const topCardEl = document.querySelector(
            '.jobs-unified-top-card, .job-details-jobs-unified-top-card__primary-description, main'
          );
          const companyEl = document.querySelector(
            'div.job-details-jobs-unified-top-card__company-name a, span.job-details-jobs-unified-top-card__company-name a, div.job-details-jobs-unified-top-card__company-name, span.job-details-jobs-unified-top-card__company-name, a.app-aware-link[href*="/company/"], .topcard__flavor--black-link, .topcard__flavor'
          );
          const companyLinkEl = document.querySelector(
            'a.app-aware-link[href*="/company/"], div.job-details-jobs-unified-top-card__company-name a, span.job-details-jobs-unified-top-card__company-name a, a[href*="/company/"]'
          );
          const titleEl = document.querySelector(
            'h1.job-details-jobs-unified-top-card__job-title, h1.t-24, h1.topcard__title, h1'
          );
          const locEl = document.querySelector(
            'div.job-details-jobs-unified-top-card__primary-description-container span, span.job-details-jobs-unified-top-card__bullet + span, .jobs-unified-top-card__bullet + span, .topcard__flavor--bullet'
          );

          let hasEasyApply = false;
          // Target strictly the primary top-card apply container (avoiding sidebar recommendations)
          const applyContainer = document.querySelector(
            '.jobs-apply-button--top-card, .jobs-s-apply, .job-details-jobs-unified-top-card__primary-description-container ~ div, .jobs-box__actions'
          );
          const candidateButtons = applyContainer 
            ? Array.from(applyContainer.querySelectorAll('button, a')) 
            : Array.from(document.querySelectorAll('.jobs-apply-button, button.jobs-apply-button, .jobs-s-apply button'));

          for (const btn of candidateButtons) {
            const txt = (btn.innerText || '').toLowerCase();
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (txt.includes('easy apply') || aria.includes('easy apply')) {
              hasEasyApply = true;
              break;
            }
          }

          let companyText = companyEl ? companyEl.innerText.trim() : '';
          let companyUrl = companyLinkEl ? companyLinkEl.href : '';
          let titleText = titleEl ? titleEl.innerText.trim() : '';
          let locText = locEl ? locEl.innerText.trim() : '';

          // Clean repeated title text or badges
          if (titleText.includes('\n')) {
            titleText = titleText.split('\n')[0].trim();
          }
          titleText = titleText.replace(/\s+with\s+verification$/i, '').trim();

          const docTitle = document.title || '';
          if ((!companyText || !titleText) && docTitle) {
            const mHiring = docTitle.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+(.+?)\s+[-|]/i);
            if (mHiring) {
              if (!companyText) companyText = mHiring[1].trim();
              if (!titleText) titleText = mHiring[2].trim();
              if (!locText) locText = mHiring[3].trim();
            } else {
              const mDash = docTitle.match(/^(.+?)\s+[-|]\s+(.+?)\s+[-|]\s+LinkedIn/i);
              if (mDash) {
                if (!titleText) titleText = mDash[1].trim();
                if (!companyText) companyText = mDash[2].trim();
              }
            }
          }

          const pageAllText = document.body.innerText.toLowerCase();
          let followersCount = null;
          const followersMatch = pageAllText.match(/([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?\s*followers/i);
          if (followersMatch) {
            let rawNum = parseFloat(followersMatch[1].replace(/,/g, ''));
            const unit = (followersMatch[2] || '').toLowerCase();
            if (unit.startsWith('k') || unit.startsWith('thous')) rawNum *= 1000;
            else if (unit.startsWith('m')) rawNum *= 1000000;
            followersCount = rawNum;
          }

          let employeeCount = null;
          const empMatch = pageAllText.match(/([\d,]+(?:\+)?(?:\s*-\s*[\d,]+)?)\s+employees/i);
          if (empMatch) {
            employeeCount = empMatch[0];
          }

          return {
            description: fullDescText || (descEl ? descEl.innerText : '') || '',
            topCardText: topCardEl ? topCardEl.innerText : '',
            extractedCompany: companyText,
            companyUrl,
            extractedTitle: titleText,
            extractedLocation: locText,
            hasEasyApply,
            followersCount,
            employeeCount,
          };
        });

        const finalCompany = details.extractedCompany || card.company || 'Identified Company';
        const finalTitle = details.extractedTitle || card.title;
        const finalLocation = details.extractedLocation || card.location || 'Bengaluru, Karnataka, India';

        const normFinalComp = finalCompany.toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').replace(/[^a-z0-9]/g, '').trim();
        if (normFinalComp.length >= 2 && blacklistedCompaniesSet.has(normFinalComp)) {
          console.log(`  🚫 REJECTED: "${finalCompany}" is on candidate blacklist.`);
          continue;
        }

        let verifiedFollowers = details.followersCount;

        // If followers count not found directly on job page, inspect company page
        if (verifiedFollowers === null && details.companyUrl && details.companyUrl.includes('/company/')) {
          try {
            const compPage = await context.newPage();
            const cleanCompUrl = details.companyUrl.split('?')[0];
            await compPage.goto(cleanCompUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
            await sleep(1200);

            verifiedFollowers = await compPage.evaluate(() => {
              const compText = document.body.innerText.toLowerCase();
              const m = compText.match(/([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?\s*followers/i);
              if (m) {
                let n = parseFloat(m[1].replace(/,/g, ''));
                const u = (m[2] || '').toLowerCase();
                if (u.startsWith('k') || u.startsWith('thous')) n *= 1000;
                else if (u.startsWith('m')) n *= 1000000;
                return n;
              }
              return null;
            });

            await compPage.close();
          } catch {
            // fallback
          }
        }

        // ── MANDATORY FILTER: Minimum 500 Followers strictly enforced ─────────
        if (verifiedFollowers === null || verifiedFollowers < 500) {
          console.log(`  ❌ REJECTED: "${finalCompany}" has only ${verifiedFollowers !== null ? Math.round(verifiedFollowers) : 'unknown/unverified'} followers (< 500 threshold).`);
          continue;
        }

        const credDisplay = verifiedFollowers ? `${Math.round(verifiedFollowers).toLocaleString()} followers` : (details.employeeCount || 'Verified company');
        console.log(`  ✅ Credible Employer: "${finalCompany}" verified (${credDisplay}).`);

        // Extract posting age
        const pageText = details.topCardText + ' ' + details.description + ' ' + (card.postedTime || '');
        let ageText = card.postedTime || 'Recent (0-7 days)';
        if (/posted\s+(?:today|just now|\d+\s*hours?|\d+\s*minutes?)|(?:today|just now|\d+\s*hours?\s*ago|\d+\s*minutes?\s*ago)/i.test(pageText)) {
          ageText = '0 days (< 24h)';
        } else if (/posted\s+yesterday|1\s*day\s*ago/i.test(pageText)) {
          ageText = '1 day ago';
        } else if (/(?:posted\s+)?(\d+)\s+days?\s+ago/i.test(pageText)) {
          const d = pageText.match(/(?:posted\s+)?(\d+)\s+days?\s+ago/i);
          ageText = `${d[1]} days ago`;
        }

        const fullJob = {
          ...card,
          company: finalCompany,
          title: finalTitle,
          location: finalLocation,
          description: details.description,
          easyApply: details.hasEasyApply,
          ageText,
        };

        const fit = evaluateJobFit(fullJob);

        if (fit.fitScore >= 45 && !fit.credibility.includes('Suspicious')) {
          evaluatedQueue.push({
            jobId: card.jobId,
            company: finalCompany,
            title: finalTitle,
            location: finalLocation,
            locationTier: fit.locationTier,
            url: card.url,
            applicationType: fullJob.easyApply ? 'Easy Apply' : 'External ATS',
            ageText,
            fitScore: fit.fitScore,
            credibility: `🟢 ${credDisplay}`,
            keyMatches: fit.keyMatches,
            blockers: fit.blockers,
            description: details.description,
          });
        } else if (fit.fitScore === 0 && fit.blockers.length > 0) {
          console.log(`  ❌ REJECTED: ${fit.blockers.join(', ')}`);
        }

        // Natural human jitter pause between inspecting individual job postings
        await sleep(randomJitter(2500, 4200));

      } catch (err) {
        console.warn(`  ⚠️ Could not load job details for ${card.jobId}: ${err.message}`);
      }
    }

    // Sort queue by Fit Score (Descending) and prioritize Easy Apply
    evaluatedQueue.sort((a, b) => b.fitScore - a.fitScore);

    // Save Daily Queue to JSON
    writeFileSync(QUEUE_FILE, JSON.stringify(evaluatedQueue, null, 2), 'utf-8');
    console.log(`\n✅ Saved ${evaluatedQueue.length} ranked candidate jobs to ${QUEUE_FILE}`);

    // ── Output Formatted Daily Queue ─────────────────────────────────────
    console.log('\n======================================================');
    console.log(' TOP APPLICATION QUEUE (Ready for Sequential Review)');
    console.log('======================================================');
    console.log(`Recommended Daily Batch: ${Math.min(10, evaluatedQueue.length)} - ${Math.min(40, evaluatedQueue.length)} applications\n`);

    evaluatedQueue.slice(0, 50).forEach((job, idx) => {
      console.log(`[#${idx + 1}] ${job.company} — ${job.title} (Fit Score: ${job.fitScore}/100)`);
      console.log(`• Location:      ${job.location} [${job.locationTier}]`);
      console.log(`• Age:           ${job.ageText}`);
      console.log(`• Type:          ${job.applicationType === 'Easy Apply' ? '🟢 Easy Apply' : '🔵 External ATS'}`);
      console.log(`• Credibility:   ${job.credibility}`);
      console.log(`• Key Matches:   ${job.keyMatches.join(' | ') || 'Relevant baseline'}`);
      if (job.blockers.length > 0) console.log(`• Notes:         ${job.blockers.join(' | ')}`);
      console.log(`• URL:           ${job.url}\n`);
    });

    console.log('======================================================');
    console.log(' EXECUTION SUMMARY');
    console.log('======================================================');
    console.log(`• Total Listings Scanned:   ${totalListingsFound}`);
    console.log(`• Listings Filtered Out:    ${stage1Filtered}`);
    console.log(`• Duplicates Avoided:       ${duplicatesSkipped}`);
    console.log(`• Deep-Inspected Roles:     ${candidatePool.length}`);
    console.log(`• Final Ranked Queue:       ${evaluatedQueue.length} roles ready`);
    console.log(`• Next Action: Run queue sequentially with:`);
    console.log(`  node scripts/linkedin/linkedin-apply-queue.mjs\n`);
  } finally {
    await context.close().catch(() => {});
  }
}

runDiscovery().catch(console.error);
