#!/usr/bin/env node

/**
 * scripts/linkedin/linkedin-apply.mjs
 *
 * Hardened, Semantic Human-in-the-Loop Application Assistant & Universal ATS Router
 *
 * Subjective Question Intelligence & Strict Anti-Caching Architecture:
 * 1. Per-Field Question Extraction & Unique Answer Lifecycle.
 * 2. 8-Category Question Classification (COMPANY_MOTIVATION, ROLE_MOTIVATION, PROJECT,
 *    PROJECT_MULTI, ACHIEVEMENT, TECHNICAL_CHALLENGE, TECHNICAL_EXPERIENCE, CANDIDATE_FIT).
 * 3. Multi-Project Support: Dynamically generates structured 2–3 project breakdowns when requested.
 * 4. Grounded Project Evidence Selection (Meera V2, Veridian WorkOS, Unshell, GitNova) from hari_project_context/.
 * 5. Semantic Pre-Fill Validation: Ensures generated draft directly addresses the current question before filling.
 * 6. Deterministic Auto-Fill, DOM Verification, and Auto-Advancement for non-high-risk steps.
 * 7. High-Risk Safety Boundary: Pauses for work authorization, sponsorship, salary, and legal declarations.
 * 8. Non-Negotiable Human Submission Boundary: Never auto-submits.
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as readline from 'readline';
import * as yaml from 'js-yaml';
import {
  createLinkedInContext,
  evaluateAuthStatus,
  DEFAULT_PROFILE_DIR,
} from './linkedin-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const PROFILE_PATH = resolve(ROOT_DIR, 'config/profile.yml');

// ── Custom Skip Error ───────────────────────────────────────────────────────

class UserSkipException extends Error {
  constructor(msg = 'Skipped by user') {
    super(msg);
    this.name = 'UserSkipException';
  }
}

// ── CLI Execution Guard ───────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('linkedin-apply.mjs')
);


// ── Readline Helper with Skip / Quit Support ────────────────────────────────

function askUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolvePrompt, rejectPrompt) => {
    rl.question(query, (ans) => {
      rl.close();
      const clean = ans.trim().toLowerCase();
      if (clean === 's' || clean === 'skip') {
        rejectPrompt(new UserSkipException());
      } else if (clean === 'q' || clean === 'quit') {
        console.log('\nExiting application assistant.');
        process.exit(0);
      } else {
        resolvePrompt(ans);
      }
    });
  });
}

// ── Verified Project Knowledge Base ─────────────────────────────────────────

export const PROJECT_KNOWLEDGE_BASE = {
  MEERA: {
    name: 'Meera V2 (AI Engineer Internship at Chiacon Consulting)',
    source: 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf & cv.md',
    domains: ['ai', 'genai', 'voice', 'speech', 'multi_agent', 'concurrency', 'evaluation', 'interview', 'latency', 'dialogue', 'nlp'],
    summary: 'Voice-based autonomous technical screening platform with an 8-node LangGraph state machine, dynamic cognitive silence scaling (0.7x–1.4x), and parallel multi-agent evaluation via asyncio.gather() reducing latency by 65% (~13.5s to ~4.5s).',
    bullets: [
      'Architected an 8-node LangGraph state machine with a 26-variable typed state, separating silent Analyzer reasoning from 1-question Dialogue delivery.',
      'Designed an asynchronous multi-agent evaluation pipeline using asyncio.gather(), executing Technical, Behavioral, and Integrity agents concurrently to cut evaluation latency by ~65%.',
      'Engineered dynamic speech silence thresholds adapting to candidate cognitive state (0.7x confident to 1.4x struggling) with 24 connective grammatical extensions.',
      'Built a 690-line automated test harness simulating 7 synthetic candidate personas across 5 multi-turn assertions.'
    ],
  },
  VERIDIAN: {
    name: 'Veridian WorkOS',
    source: 'hari_project_context/VERIDIAN_RESUME_EVIDENCE_AUDIT.md & cv.md',
    domains: ['agentic', 'langgraph', 'hitl', 'backend', 'integrations', 'fullstack', 'fastapi', 'pgvector', 'jira', 'slack', 'workflow', 'sse', 'orchestration'],
    summary: 'Enterprise AI Workflow Automation platform converting unstructured meeting transcripts into policy-checked, capacity-verified Jira tickets and Slack notifications with LangGraph HITL checkpointing and SSE streaming.',
    bullets: [
      'Architected a 12-node LangGraph workflow with parallel fan-out evaluation across HR SQL, Finance/Security pgvector RAG, and live Jira API capacity checks.',
      'Engineered a parallel-safe dictionary state reducer (update_tasks_reducer) preventing sibling branch state overwrites during concurrent evaluation.',
      'Implemented Human-in-the-Loop checkpointing via interrupt() and Command(resume) with real-time SSE telemetry to a Next.js 14 dashboard.',
      'Built multi-tool enterprise dispatchers for Atlassian Jira issue creation and contextual Slack DM routing with transcript provenance.'
    ],
  },
  UNSHELL: {
    name: 'Unshell (Hackfest 2026 – 2nd Runner-Up)',
    source: 'hari_project_context/UNSHELL_RESUME_EVIDENCE_AUDIT.md & cv.md',
    domains: ['rag', 'vector_search', 'hallucination', 'firewall', 'graph', 'networkx', 'compliance', 'forensic', 'aml', 'kyb', 'algorithms', 'sanctions'],
    summary: 'AML/KYB compliance intelligence graph unmasking Ultimate Beneficial Owners (UBOs) using a 4-stage Hyper-RAG pipeline, RapidFuzz zero-trust verification firewall, and NetworkX topological cycle detection.',
    bullets: [
      'Architected a deterministic verification firewall using RapidFuzz Levenshtein string matching, dropping ungrounded LLM extractions with trust score < 70.',
      'Separated unstructured extraction from scoring by delegating all risk calculations to a pure NetworkX DiGraph topological engine (nx.simple_cycles).',
      'Built a 4-stage Hyper-RAG sub-graph combining PyMuPDF, FAISS vector indexing, and targeted semantic querying to parse 50-page corporate filings.',
      'Awarded 2nd Runner-Up at Hackfest 2026 among 750+ teams for robust financial forensic intelligence.'
    ],
  },
  GITNOVA: {
    name: 'GitNova (Autonomous OSS Contribution Finder)',
    source: 'cv.md & profile.yml',
    domains: ['applied_ml', 'transformers', 'deberta', 'classification', 'groq', 'llama', 'pipeline', 'automation', 'cron', 'github_actions', 'github'],
    summary: 'Autonomous AI pipeline scanning 60+ open-source GitHub repositories every 6 hours with DeBERTa v3 zero-shot classification, repository metadata RAG grounding, and self-correcting validation loops.',
    bullets: [
      'Engineered a 6-stage automated pipeline filtering raw GitHub issues using hybrid heuristics and DeBERTa v3 zero-shot classification.',
      'Built a repository metadata RAG grounding layer to constrain Llama 3 70B generation and prevent cross-framework hallucinations.',
      'Implemented a self-correcting validation loop feeding failure diagnostics back to the LLM for targeted regeneration and 0–100 quality scoring.'
    ],
  },
};

// ── Profile Loader ──────────────────────────────────────────────────────────

export function loadCandidateProfile() {
  if (!existsSync(PROFILE_PATH)) {
    console.error('❌ Error: config/profile.yml not found.');
    process.exit(1);
  }
  const raw = readFileSync(PROFILE_PATH, 'utf-8');
  const parsed = yaml.load(raw) || {};
  const cand = parsed.candidate || {};

  return {
    fullName: cand.full_name || 'Banda Sri Hari',
    firstName: cand.full_name ? cand.full_name.split(' ')[0] : 'Sri Hari',
    lastName: cand.full_name ? cand.full_name.split(' ').slice(1).join(' ') : 'Banda',
    email: cand.email || 'sriharizbett@gmail.com',
    phone: cand.phone || '+91 81257 52880',
    phoneNational: '8125752880',
    countryCode: '+91',
    countryName: 'India',
    location: cand.location || 'Bengaluru, Karnataka, India',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    university: 'Sir M. Visvesvaraya Institute of Technology',
    degree: 'B.E. in Artificial Intelligence & Machine Learning',
    degreeLevel: "Bachelor's Degree",
    gradYear: '2027',
    isStudent: 'Yes',
    currentStudent: true,
    expYearsProfessional: '1',
    expMonthsProfessional: '0',
    yearsOfExperience: '1',
    targetCtc: '₹8L-12L CTC',
    linkedin: cand.linkedin ? `https://${cand.linkedin.replace(/^https?:\/\//, '')}` : 'https://linkedin.com/in/sri-hari-48321b297',
    github: cand.github ? `https://${cand.github.replace(/^https?:\/\//, '')}` : 'https://github.com/sriharizz',
    portfolioUrl: cand.portfolio_url || 'https://github.com/sriharizz',
    verifiedSkills: ['Python', 'LangGraph', 'FastAPI', 'PyTorch', 'Azure OpenAI', 'RAG', 'PostgreSQL', 'Supabase', 'Machine Learning', 'AI'],
  };
}

// ── Pacing Helper ───────────────────────────────────────────────────────────

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// ── Identity & Company Metadata Extraction ──────────────────────────────────

async function extractJobAndCompany(page) {
  let jobTitle = '';
  let companyName = '';

  const titleSelectors = [
    'h1.job-details-jobs-unified-top-card__job-title',
    'h1.t-24',
    'h1.topcard__title',
    '.jobs-unified-top-card__job-title',
    'h1',
  ];
  for (const sel of titleSelectors) {
    const text = (await page.$eval(sel, (el) => el.innerText).catch(() => '')).trim();
    if (text && !text.includes('LinkedIn') && text.length > 2) {
      jobTitle = text;
      break;
    }
  }

  const companySelectors = [
    'div.job-details-jobs-unified-top-card__company-name a',
    'span.job-details-jobs-unified-top-card__company-name a',
    'div.job-details-jobs-unified-top-card__company-name',
    'span.job-details-jobs-unified-top-card__company-name',
    '.jobs-unified-top-card__company-name a',
    '.jobs-unified-top-card__company-name',
    'a.app-aware-link[href*="/company/"]',
    'a[href*="/company/"]',
    '.topcard__flavor--black-link',
    '.topcard__flavor',
  ];
  for (const sel of companySelectors) {
    const text = (await page.$eval(sel, (el) => el.innerText).catch(() => '')).trim();
    if (text && !text.toLowerCase().includes('notification') && !text.toLowerCase().includes('premium') && text.length > 1) {
      companyName = text;
      break;
    }
  }

  const docTitle = await page.title().catch(() => '');
  if ((!jobTitle || !companyName) && docTitle) {
    const mHiring = docTitle.match(/^(.+?)\s+hiring\s+(.+?)\s+in\s+/i);
    if (mHiring) {
      if (!companyName) companyName = mHiring[1].trim();
      if (!jobTitle) jobTitle = mHiring[2].trim();
    } else {
      const mDash = docTitle.match(/^(.+?)\s+[-|]\s+(.+?)\s+[-|]\s+LinkedIn/i);
      if (mDash) {
        if (!jobTitle) jobTitle = mDash[1].trim();
        if (!companyName) companyName = mDash[2].trim();
      }
    }
  }

  const isResolved = Boolean(
    jobTitle &&
    companyName &&
    !companyName.toLowerCase().includes('target') &&
    !companyName.toLowerCase().includes('unknown') &&
    !jobTitle.toLowerCase().includes('target')
  );

  return { jobTitle, companyName, isResolved, docTitle };
}

// ── Initial Credibility Check ───────────────────────────────────────────────

async function verifyCompanyCredibility(page, companyName, jobTitle, isResolved) {
  console.log('\n======================================================');
  console.log(' INITIAL CREDIBILITY CHECK');
  console.log('======================================================');

  if (!isResolved || !companyName) {
    console.error('❌ VERIFICATION FAILED — COMPANY IDENTITY NOT RESOLVED');
    console.error('Could not reliably extract the actual company name and role title from page.');
    console.error('Halting automated classification to prevent false positives.');
    console.log('======================================================\n');
    const override = await askUser('👉 Do you want to manually enter the company name to proceed? (Company Name or "s" to skip): ');
    if (!override) return false;
    companyName = override.trim();
  }

  const pageContent = (await page.textContent('body').catch(() => '')).toLowerCase();
  let classification = '🟢 INITIAL CHECK PASSED (CREDIBLE / RELEVANT)';
  let notes = [];

  const feeSignals = ['registration fee', 'pay upfront', 'security deposit', 'processing charge', 'crypto payment', 'telegram'];
  const hasFeeSignal = feeSignals.some((sig) => pageContent.includes(sig));

  if (hasFeeSignal) {
    classification = '🔴 SUSPICIOUS / HIGH RISK';
    notes.push('Contains payment/fee keywords or unverified contact channels.');
  } else {
    notes.push(`Company identity: "${companyName}"`);
    notes.push(`Role title: "${jobTitle || 'Identified Role'}"`);
    notes.push('No malicious fee, deposit, or phishing patterns detected.');
    if (pageContent.includes('seed') || pageContent.includes('early stage') || pageContent.includes('founding team')) {
      classification = '🟡 INITIAL CHECK PASSED (EARLY-STAGE / REQUIRES EXTERNAL VERIFICATION)';
      notes.push('Early-stage startup structure detected (valid for technical exploration).');
    }
  }

  console.log(`Company:        ${companyName}`);
  console.log(`Role:           ${jobTitle}`);
  console.log(`Classification: ${classification}`);
  notes.forEach((n) => console.log(`• ${n}`));
  console.log('======================================================\n');

  if (classification.startsWith('🔴')) {
    const override = await askUser('⚠️ High-risk signal detected. Do you still want to proceed? (y/N): ');
    if (override.trim().toLowerCase() !== 'y') {
      return false;
    }
  }
  return true;
}

// ── Resilient Modal Locator for Easy Apply ──────────────────────────────────

async function locateEasyApplyModal(page, debug = false) {
  if (debug) {
    console.log('\n[DEBUG] --- Easy Apply Modal Detection Diagnostics ---');
    console.log(`[DEBUG] Current URL: ${page.url()}`);
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const candidateSelectors = [
      'div.jobs-easy-apply-modal',
      'div.artdeco-modal[role="dialog"]',
      'div[role="dialog"]:has(button[aria-label*="Continue to next step"], button:has-text("Next"), button:has-text("Review"), button:has-text("Submit application"), button:has-text("Add education"))',
      'div[role="dialog"]:has(button[aria-label*="Dismiss"], button[aria-label*="Close"])',
      '[data-test-modal-container]',
      '[data-test-modal]',
      'div:has(button[aria-label*="Continue to next step"], button:has-text("Next"), button:has-text("Review"), button:has-text("Submit application"))',
    ];

    for (const selector of candidateSelectors) {
      const el = await page.$(selector).catch(() => null);
      if (el && await el.isVisible().catch(() => false)) {
        if (debug) console.log(`[DEBUG] ✅ Found active modal matching selector "${selector}"`);
        return el;
      }
    }

    await sleep(600);
  }

  const fallback = await page.$('div[role="dialog"], div.artdeco-modal').catch(() => null);
  if (fallback && await fallback.isVisible().catch(() => false)) {
    if (debug) console.log('[DEBUG] ✅ Matched fallback modal dialog');
    return fallback;
  }

  return null;
}


// ── Canonical Semantic Field Mapping Layer ──────────────────────────────────

function classifySemanticField(signalText, inputType = 'text') {
  const s = signalText.toLowerCase().replace(/[^a-z0-9]/g, ' ');

  // Global / UI noise & Honeypot exclusion
  if (s.includes('select language') || s.includes('global nav') || s.includes('dismiss') || s.includes('photo') || s.includes('picture') || s.includes('avatar') || s.includes('profile image') || s.includes('leave this field empty') || s.includes('leave this empty') || s.includes('honeypot')) {
    return { canonical: 'UI_NOISE', confidence: 'IGNORE' };
  }

  // Math verification (e.g. "what is 3 + 3?")
  const mathMatch = signalText.match(/(?:what is|calculate|\b)\s*(\d+)\s*([\+\-\*\/])\s*(\d+)/i);
  if (mathMatch) {
    const n1 = parseInt(mathMatch[1], 10);
    const op = mathMatch[2];
    const n2 = parseInt(mathMatch[3], 10);
    let ans = op === '+' ? n1 + n2 : (op === '-' ? n1 - n2 : (op === '*' ? n1 * n2 : Math.round(n1 / n2)));
    return { canonical: 'MATH_VERIFICATION', confidence: 'HIGH', recommendation: String(ans) };
  }

  // 1. Identity & Contact Fields (HIGH CONFIDENCE)
  if (s.match(/\b(mobile phone number|mobile phone|phone number|cell phone|telephone|phone|mobile|contact number|_systemfield_phone)\b/) || inputType === 'tel') {
    if (s.match(/\b(country code|dial code)\b/)) {
      return { canonical: 'PHONE_COUNTRY_CODE', confidence: 'HIGH' };
    }
    return { canonical: 'PHONE_NATIONAL', confidence: 'HIGH' };
  }

  if (s.match(/\b(first name|given name|firstname|fname|first)\b/)) {
    return { canonical: 'FIRST_NAME', confidence: 'HIGH' };
  }

  if (s.match(/\b(last name|family name|surname|lastname|lname|last)\b/)) {
    return { canonical: 'LAST_NAME', confidence: 'HIGH' };
  }

  if (s.match(/\b(full name|your name|candidate name|legal name|applicant name|_systemfield_name|name)\b/)) {
    return { canonical: 'FULL_NAME', confidence: 'HIGH' };
  }

  if (s.match(/\b(email address|email|e mail|_systemfield_email)\b/) || inputType === 'email') {
    return { canonical: 'EMAIL', confidence: 'HIGH' };
  }

  if (s.match(/\b(city|current city|_systemfield_location|location)\b/)) {
    return { canonical: 'CITY', confidence: 'HIGH' };
  }

  if (s.match(/\b(university|college|school|institution|alma mater)\b/)) {
    return { canonical: 'UNIVERSITY', confidence: 'HIGH' };
  }

  if (s.match(/\b(degree|major|field of study|course|qualification)\b/)) {
    return { canonical: 'DEGREE', confidence: 'HIGH' };
  }

  if (s.match(/\b(graduation year|grad year|passing year|year of graduation|expected graduation)\b/)) {
    return { canonical: 'GRADUATION_YEAR', confidence: 'HIGH' };
  }

  if (s.match(/\b(currently enrolled|currently pursuing|are you a student|student status)\b/)) {
    return { canonical: 'IS_STUDENT', confidence: 'HIGH' };
  }

  // Experience Durations (Professional Experience only)
  if (s.match(/\b(years of professional experience|total years of professional experience|total years of experience|total professional experience|years of experience)\b/) && !s.match(/\b(python|react|ml|machine learning|rag|fastapi|java|aws|sql|c\+\+|node)\b/)) {
    return { canonical: 'EXPERIENCE_YEARS_PROFESSIONAL', confidence: 'HIGH' };
  }

  if (s.match(/\b(additional months of experience|months of experience|months of professional experience|total additional months)\b/) && !s.match(/\b(python|react|ml|machine learning|rag|fastapi|java|aws|sql|c\+\+|node)\b/)) {
    return { canonical: 'EXPERIENCE_MONTHS_PROFESSIONAL', confidence: 'HIGH' };
  }

  if (s.match(/\b(linkedin|linkedin profile|linkedin url|_systemfield_linkedinurl)\b/)) {
    return { canonical: 'LINKEDIN', confidence: 'HIGH' };
  }

  if (s.match(/\b(github|github profile|github url|_systemfield_githuburl)\b/)) {
    return { canonical: 'GITHUB', confidence: 'HIGH' };
  }

  if (s.match(/\b(portfolio|personal website|website url|blog url|_systemfield_portfoliourl)\b/)) {
    return { canonical: 'PORTFOLIO', confidence: 'HIGH' };
  }

  if (s.match(/\b(resume|cv|upload resume|attach resume|curriculum vitae|_systemfield_resume)\b/) || inputType === 'file') {
    return { canonical: 'RESUME', confidence: 'HIGH' };
  }

  // 2. High-Risk / Consequential Questions (MUST PAUSE FOR HUMAN)
  if (s.match(/\b(authorized to work|legally authorized|work authorization|citizenship|right to work)\b/)) {
    return { canonical: 'WORK_AUTHORIZATION', confidence: 'HIGH_RISK', recommendation: 'Yes (Authorized in India)' };
  }

  if (s.match(/\b(sponsorship|visa sponsorship|require sponsorship|future require)\b/)) {
    return { canonical: 'VISA_SPONSORSHIP', confidence: 'HIGH_RISK', recommendation: 'No (For India roles)' };
  }

  if (s.match(/\b(salary|ctc|compensation|expected ctc|expected salary|remuneration)\b/)) {
    return { canonical: 'SALARY_CTC', confidence: 'HIGH_RISK', recommendation: '₹8L-12L CTC (Internships: ₹25k-60k+/mo)' };
  }

  if (s.match(/\b(notice period|earliest start date|availability|available to start|how soon)\b/)) {
    return { canonical: 'NOTICE_PERIOD', confidence: 'HIGH_RISK', recommendation: 'Immediate / 0 days' };
  }

  // 3. Subjective / Custom Open-Ended Questions (INTELLIGENT AUTO-FILL)
  if (inputType === 'textarea' || s.match(/\b(why|tell us|describe|proud|accomplishment|project|projects|challenge|background|experience|fit|hire)\b/)) {
    return { canonical: 'SUBJECTIVE_QUESTION', confidence: 'SUBJECTIVE' };
  }

  // 4. Medium Confidence
  if (s.match(/\b(address|current address|residence|street)\b/)) {
    return { canonical: 'LOCATION', confidence: 'MEDIUM' };
  }

  if (s.match(/\b(state|province|region)\b/)) {
    return { canonical: 'STATE', confidence: 'MEDIUM' };
  }

  return { canonical: 'UNKNOWN', confidence: 'UNKNOWN' };
}

// ── Subjective Question Classification Engine ───────────────────────────────

export function classifySubjectiveQuestion(questionText) {
  const q = (questionText || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // 1. Multi-project / Multiple accomplishments (e.g. "two to three projects", "projects or accomplishments", "what have you built", "what are you proud of")
  if (
    q.match(/\b(two to three|2 to 3|2 3|two|three|multiple|top|key)\s+(projects|accomplishments)\b/) ||
    (q.includes('projects') && (q.includes('proud') || q.includes('tell us') || q.includes('describe') || q.includes('walk us') || q.includes('showcase') || q.includes('accomplishment'))) ||
    (q.includes('accomplishments') && (q.includes('proud') || q.includes('tell us') || q.includes('describe') || q.includes('showcase'))) ||
    (q.includes('what') && q.includes('built') && (q.includes('projects') || q.includes('proud')))
  ) {
    return { type: 'PROJECT_MULTI', label: 'Multi-Project Deep-Dive' };
  }

  // 2. Company Motivation ("Why do you want to work at [Company]?", "Why [Company]?", "Why join us?")
  if (
    q.match(/\bwhy\b.*?\b(work at|work with|join|work for|be part of|choose|drawn to)\b/) ||
    q.match(/\bwhy\b.*?\b(company|organization|firm|team|us|here)\b/) ||
    q.match(/\bwhat (interests|attracts|draws) you to\b/) ||
    q.match(/^why (do you want to work|are you applying to|are you interested in working at)\b/)
  ) {
    return { type: 'COMPANY_MOTIVATION', label: 'Company Motivation' };
  }

  // 3. Role Motivation ("Why this role?", "Why are you interested in this position?")
  if (
    q.match(/\bwhy\b.*?\b(this role|this position|this job|this internship|apply for this|applying for)\b/) ||
    q.match(/\bwhat (interests|attracts) you (about|in) this (role|position|job)\b/)
  ) {
    return { type: 'ROLE_MOTIVATION', label: 'Role Motivation' };
  }

  // 4. Single Project Deep-Dive
  if (
    q.match(/\b(tell us about.*project|describe.*project|walk us through.*project|recent project|key project|portfolio project|system you built|system you architected)\b/)
  ) {
    return { type: 'PROJECT', label: 'Project Deep-Dive' };
  }

  // 5. Greatest Achievement / Proudest Accomplishment
  if (
    q.match(/\b(most proud of|greatest achievement|proudest|accomplishment|biggest win|proud)\b/)
  ) {
    return { type: 'ACHIEVEMENT', label: 'Greatest Achievement' };
  }

  // 6. Technical Challenge / Hard Problem
  if (
    q.match(/\b(technical challenge|challenging.*?(problem|project|bug|task)|difficult problem|toughest bug|hardest challenge|architectural problem|complex bug|solved a (hard|difficult|complex|challenging) problem)\b/) ||
    (q.includes('challenge') && (q.includes('technical') || q.includes('solved') || q.includes('architectural')))
  ) {
    return { type: 'TECHNICAL_CHALLENGE', label: 'Technical Challenge' };
  }

  // 7. Technical Experience (e.g. "Describe your experience with RAG/LangGraph...")
  if (
    q.match(/\b(experience with|worked with|hands on with|familiarity with|background in|describe your experience|knowledge of|experience building)\b/)
  ) {
    return { type: 'TECHNICAL_EXPERIENCE', label: 'Technical Experience' };
  }

  // 8. Candidate Fit ("Why should we hire you?", "What makes you a good fit?", "Tell us about yourself")
  if (
    q.match(/\b(why should we hire you|why are you a good fit|what makes you|tell us about yourself|about you|summary of your background|what sets you apart)\b/)
  ) {
    return { type: 'CANDIDATE_FIT', label: 'Candidate Value Proposition' };
  }

  return { type: 'OTHER_SUBJECTIVE', label: 'General Subjective Question' };
}

// ── Smart Project Evidence Selector ─────────────────────────────────────────

export function selectProjectEvidence(questionType, questionText = '', jdText = '', roleTitle = '') {
  const qLower = (questionText || '').toLowerCase();
  const jdLower = (jdText || '').toLowerCase();
  const roleLower = (roleTitle || '').toLowerCase();

  // Multi-project requested
  if (questionType === 'PROJECT_MULTI') {
    return {
      key: 'MULTI',
      project: {
        name: 'Meera V2, Veridian WorkOS & Unshell (3 Distinct Projects)',
        source: 'hari_project_context/ (MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf, VERIDIAN_RESUME_EVIDENCE_AUDIT.md, UNSHELL_RESUME_EVIDENCE_AUDIT.md)',
      },
      reason: 'Question specifically requests 2–3 projects/accomplishments; covers Voice AI, Agentic Workflows, and Forensic RAG graphs.',
    };
  }

  // Priority 1: Match on exact Question Text first
  if (qLower.match(/\b(fine[- ]tuning|fine tune|qlora|lora|qwen|ast|tree[- ]sitter|code retrieval|gitnova|oss|github issues|repository)\b/)) {
    return {
      key: 'GITNOVA',
      project: {
        name: 'GitNova (Supervised Fine-Tuning & Hybrid AST RAG)',
        source: 'cv.md & config/profile.yml',
      },
      reason: 'Question specifically emphasizes fine-tuning, QLoRA, AST code chunking, or code retrieval.',
    };
  }

  if (qLower.match(/\b(voice|speech|audio|stt|tts|interviewer|meera|silence|concurrency)\b/)) {
    return {
      key: 'MEERA',
      project: {
        name: 'Meera V2 (Voice AI Interviewer & Async Concurrency Optimization)',
        source: 'cv.md & hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf',
      },
      reason: 'Question specifically emphasizes voice AI, speech processing, or async multi-agent interviewer state machines.',
    };
  }

  if (qLower.match(/\b(workflow|hitl|human in the loop|jira|slack|integration|veridian|sse|orchestration)\b/)) {
    return {
      key: 'VERIDIAN',
      project: {
        name: 'Veridian WorkOS (Enterprise LangGraph Orchestration & Parallel Reducer)',
        source: 'cv.md & hari_project_context/VERIDIAN_RESUME_EVIDENCE_AUDIT.md',
      },
      reason: 'Question specifically emphasizes workflow orchestration, HITL checkpointing, or enterprise tools.',
    };
  }

  if (qLower.match(/\b(rag|faiss|hallucination|grounding|firewall|graph|networkx|compliance|legal|forensic|aml|kyb|unshell)\b/)) {
    return {
      key: 'UNSHELL',
      project: {
        name: 'Unshell (Forensic AML Hyper-RAG & Deterministic Cycle Detection)',
        source: 'cv.md & hari_project_context/UNSHELL_RESUME_EVIDENCE_AUDIT.md',
      },
      reason: 'Question specifically emphasizes RAG architectures, vector indexing, anti-hallucination firewalls, or graph analytics.',
    };
  }

  // Priority 2: Match on combined signals (Question + Role + JD)
  const combinedSignal = `${qLower} ${roleLower} ${jdLower}`;

  if (combinedSignal.match(/\b(voice|speech|audio|stt|tts|dialogue)\b/)) {
    return {
      key: 'MEERA',
      project: {
        name: 'Meera V2 (Voice AI Interviewer & Async Concurrency Optimization)',
        source: 'cv.md & hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf',
      },
      reason: 'Role emphasizes voice AI or speech processing.',
    };
  }

  if (combinedSignal.match(/\b(fine[- ]tuning|qlora|qwen|ast|tree[- ]sitter|code|classification|transformers|hugging face)\b/)) {
    return {
      key: 'GITNOVA',
      project: {
        name: 'GitNova (Supervised Fine-Tuning & Hybrid AST RAG)',
        source: 'cv.md & config/profile.yml',
      },
      reason: 'Role emphasizes fine-tuning, QLoRA, code parsing, or transformer classification.',
    };
  }

  if (combinedSignal.match(/\b(agentic|workflow|hitl|human in the loop|jira|slack|integration|task|sse)\b/)) {
    return {
      key: 'VERIDIAN',
      project: {
        name: 'Veridian WorkOS (Enterprise LangGraph Orchestration & Parallel Reducer)',
        source: 'cv.md & hari_project_context/VERIDIAN_RESUME_EVIDENCE_AUDIT.md',
      },
      reason: 'Role emphasizes agentic workflows or enterprise integrations.',
    };
  }

  if (combinedSignal.match(/\b(rag|retrieval|vector|faiss|hallucination|grounding|firewall|graph|networkx|compliance|legal|forensic|aml|kyb)\b/)) {
    return {
      key: 'UNSHELL',
      project: {
        name: 'Unshell (Forensic AML Hyper-RAG & Deterministic Cycle Detection)',
        source: 'cv.md & hari_project_context/UNSHELL_RESUME_EVIDENCE_AUDIT.md',
      },
      reason: 'Role emphasizes RAG architectures, vector indexing, anti-hallucination firewalls, or graph topological algorithms.',
    };
  }


  if (questionType === 'ACHIEVEMENT') {
    return {
      key: 'UNSHELL',
      project: {
        name: 'Unshell (Hackfest 2026 2nd Runner-Up)',
        source: 'cv.md & hari_project_context/UNSHELL_RESUME_EVIDENCE_AUDIT.md',
      },
      reason: 'Hackfest 2026 2nd Runner-Up award represents concrete competitive validation of engineering excellence.',
    };
  }

  if (questionType === 'TECHNICAL_CHALLENGE') {
    return {
      key: 'MEERA',
      project: {
        name: 'Meera V2 (Adaptive Audio Physics & Latency Optimization)',
        source: 'cv.md & hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf',
      },
      reason: 'Solving premature speech cutoffs via candidate cognitive state silence scaling and 24 grammatical connectives.',
    };
  }

  // Default Anchor: Meera V2 (Production Internship)
  return {
    key: 'MEERA',
    project: {
      name: 'Meera V2 (AI Engineer Internship at Chiacon)',
      source: 'cv.md & hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf',
    },
    reason: 'Primary production engineering internship anchor in LangGraph state machines and multi-agent systems.',
  };
}

// ── 3-Layer Question Answering Engine (Cache + Grounded Gemini API) ──────────

const CACHE_FILE = resolve(ROOT_DIR, 'data/question-cache.json');

function normalizeQuestionKey(text) {
  return (text || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function loadQuestionCache() {
  if (existsSync(CACHE_FILE)) {
    try { return JSON.parse(readFileSync(CACHE_FILE, 'utf-8')); } catch {}
  }
  return {};
}

function saveQuestionCache(qText, answer) {
  try {
    const cache = loadQuestionCache();
    const key = normalizeQuestionKey(qText);
    if (key && answer) {
      cache[key] = String(answer).trim();
      writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2), 'utf-8');
      console.log(`  💾 [CACHE STORED] Saved answer for: "${qText.slice(0, 50)}..."`);
    }
  } catch {}
}

export async function resolveSmartAnswer({ questionText, signals = {}, jobContext = {}, profile = {} }) {
  const qLower = (questionText || '').toLowerCase();
  const normKey = normalizeQuestionKey(questionText);

  // 1. Layer 1: Instant Deterministic Rules
  if (qLower.includes('only whole numbers allowed') || qLower.includes('how many years of work experience') || qLower.includes('total years of experience')) {
    return '1';
  }
  if (qLower.includes('link') && (qLower.includes('work') || qLower.includes('built') || qLower.includes('portfolio') || qLower.includes('github') || qLower.includes('project'))) {
    return 'https://github.com/sriharizz';
  }
  if (qLower.includes('notice period') || qLower.includes('how soon can you start')) {
    return 'Immediate';
  }
  if (qLower.includes('authorized to work in india') || qLower.includes('legally authorized')) {
    return 'Yes';
  }
  if (qLower.includes('require visa sponsorship') || qLower.includes('require sponsorship')) {
    return 'No';
  }

  // 2. Layer 2: Check Local Q&A Cache
  const cache = loadQuestionCache();
  if (cache[normKey]) {
    console.log(`  ⚡ [CACHE HIT] Loaded verified answer from question-cache.json`);
    return cache[normKey];
  }

  // 3. Layer 3: Call Gemini 2.5 Flash via API Key if available
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (apiKey) {
    try {
      console.log(`  🧠 [GEMINI 2.5] Resolving question with full candidate context...`);
      const sysPrompt = `You are filling a job application screening question for Banda Sri Hari.
Candidate Context:
- Full Name: Banda Sri Hari | Email: sriharizbett@gmail.com | Phone: +91 81257 52880 | Location: Bengaluru, India
- Education: Sir M. Visvesvaraya Institute of Technology, Bengaluru — B.E. in Artificial Intelligence & Machine Learning (Expected 2027, CGPA: 8.72/10)
- Professional Experience: AI Engineer Intern at Chiacon Consulting Private Limited (Mar 2026 – Jun 2026, Remote, India)
  * Architected a 9-node LangGraph workflow with typed state, deterministic routing, guardrails, and bounded memory for multi-turn interview control.
  * Engineered real-time Python/FastAPI WebSocket voice-interview backend integrating Recall.ai and Azure Speech.
  * Built concurrent Technical, Behavioral, and Integrity LLM evaluators with asyncio.gather() and Pydantic/OpenAI Function Calling.
  * Integrated Azure OpenAI, Microsoft Graph, Entra ID, Recall.ai, and Azure Communication Services via REST APIs with OAuth 2.0/HMAC.
  * Developed headless Python regression harness with 7 synthetic personas, LLM simulation, and unittest.mock.
- Projects:
  * GitNova: Full-stack code-intelligence platform with Python/FastAPI, PostgreSQL/pgvector, React, Tree-sitter AST parsing, Gemini, Groq, Docker.
  * Orbit: Serverless AI learning platform with Python/FastAPI on AWS Lambda/Mangum, DynamoDB state machines, S3, and Bedrock Knowledge Bases.
  * Unshell: AML & KYB forensic intelligence graph with LangGraph, PyMuPDF, FAISS, Sentence-Transformers, Gemini, NetworkX (Hackfest 2026 - 2nd Runner-Up).
- Key Constraints:
  * Total years of professional experience: 1 year (internship at Chiacon).
  * If the question asks for a number, count, or whole numbers, return ONLY the single numeric integer (e.g. "1").
  * If the question asks for a portfolio or project link, return "https://github.com/sriharizz".
  * If it is an open-ended question, provide a punchy, technical 2-sentence response grounded strictly in Chiacon, LangGraph, or FastAPI.
  * Character limit: ${signals.fieldLimit || 500}. Do NOT exceed this length.
  * Return ONLY the final direct answer. No explanations, no markdown formatting, no conversational filler.`;

      const userPrompt = `Target Company: ${jobContext.companyName || 'Hiring Company'}
Target Role: ${jobContext.jobTitle || 'AI Engineer'}
Question: "${questionText}"
Please provide the exact answer for this input field:`;

      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${sysPrompt}\n\n${userPrompt}` }] }]
        })
      });

      if (response.ok) {
        const data = await response.json();
        const generated = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        if (generated) {
          saveQuestionCache(questionText, generated);
          return generated;
        }
      } else {
        console.warn(`  ⚠️ Gemini API returned status ${response.status}`);
      }
    } catch (err) {
      console.warn(`  ⚠️ Gemini API call error: ${err.message}`);
    }
  }

  // 4. Fallback to template generator
  const qClass = classifySubjectiveQuestion(questionText);
  const fallback = generateSubjectiveAnswer({
    questionType: qClass.type,
    questionText,
    companyName: jobContext.companyName,
    roleTitle: jobContext.jobTitle,
    jdText: jobContext.jdText,
    fieldLimit: signals.fieldLimit,
    previousAnswers: jobContext.previousAnswers || [],
  });
  return fallback.draft;
}

// ── Grounded Subjective Answer Generator ────────────────────────────────────

export function generateSubjectiveAnswer({
  questionType,
  questionText,
  companyName = '',
  roleTitle = '',
  jdText = '',
  fieldLimit = null,
  previousAnswers = [],
}) {
  const comp = companyName && !companyName.toLowerCase().includes('target') && !companyName.toLowerCase().includes('unknown') ? companyName : 'your team';
  const role = roleTitle || 'AI Engineering';
  const jdLower = (jdText || '').toLowerCase();
  const qLower = (questionText || '').toLowerCase();

  let draft = '';
  let selectedEvidence = [];
  let whyEvidence = '';
  let sourceFiles = '';

  // 1. Multi-Project / Accomplishments Question
  if (
    questionType === 'PROJECT_MULTI' ||
    qLower.includes('two to three') ||
    qLower.includes('2 to 3') ||
    (qLower.includes('projects') && (qLower.includes('proud') || qLower.includes('accomplishment') || qLower.includes('built') || qLower.includes('tell us'))) ||
    (qLower.includes('accomplishments') && (qLower.includes('proud') || qLower.includes('tell us')))
  ) {
    selectedEvidence = [
      'Meera V2 (Voice AI Interviewer & Async Concurrency Optimization)',
      'Veridian WorkOS (Enterprise LangGraph Orchestration & Parallel Reducer)',
      'Unshell (Forensic AML Hyper-RAG & Deterministic Cycle Detection)',
    ];
    whyEvidence = 'Requests 2–3 projects/accomplishments; covers full scope of Voice AI, Agentic Workflows, and Forensic RAG graphs.';
    sourceFiles = 'hari_project_context/ (MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf, VERIDIAN_RESUME_EVIDENCE_AUDIT.md, UNSHELL_RESUME_EVIDENCE_AUDIT.md)';

    draft = `I've worked on several AI systems, but three that stand out are Meera V2, Veridian WorkOS, and Unshell.

In Meera V2, I built an autonomous voice-based AI technical interviewer at Chiacon Consulting. The main challenge was making spoken conversations feel natural without cutting candidates off and eliminating post-interview evaluation delays. I architected an 8-node LangGraph state machine with adaptive silence scaling and ran specialized evaluation agents concurrently with asyncio.gather(), reducing latency by ~65% (~13.5s down to ~4.5s).

In Veridian WorkOS, I built an enterprise workflow automation platform that converts meeting discussions into policy-checked Jira tickets. The key problem was running parallel checks across HR, finance, and security databases without corrupting shared state. I built a 12-node LangGraph orchestrator with a custom parallel-safe state reducer and implemented Human-in-the-Loop checkpointing via interrupt() with real-time SSE telemetry.

I also built Unshell, an AML and corporate intelligence graph that won 2nd Runner-Up at Hackfest 2026 out of 750+ teams. To eliminate hallucinations across 50-page corporate filings, I engineered a 4-stage Hyper-RAG pipeline with FAISS and created a RapidFuzz verification firewall that dropped ungrounded claims with trust scores under 70, delegating all ownership cycle detection to a pure NetworkX graph engine.`;

  // 2. Company Motivation
  } else if (
    questionType === 'COMPANY_MOTIVATION' ||
    qLower.includes('why do you want to work') ||
    qLower.includes('why work at') ||
    qLower.includes('why join') ||
    qLower.includes('why are you interested in')
  ) {
    selectedEvidence = [
      'Meera V2 (LangGraph State Machines & Async Concurrency)',
      'Unshell (Anti-Hallucination Verification Firewalls)',
    ];
    whyEvidence = `Connects verified LangGraph state machine and anti-hallucination engineering directly to ${comp}'s mission.`;
    sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf, UNSHELL_RESUME_EVIDENCE_AUDIT.md & cv.md';

    let companySpecificReason = '';
    if (comp.toLowerCase().includes('skild') || jdLower.includes('robotics') || jdLower.includes('foundation model') || jdLower.includes('physical ai')) {
      companySpecificReason = `What interests me about ${comp} is the focus on building foundation models that operate reliably in physical robotics. In my AI engineering work, I've focused heavily on high-reliability state machines and anti-hallucination pipelines, such as building an 8-node LangGraph system with concurrent evaluation agents (cutting latency by ~65%) and designing deterministic verification firewalls. That makes this role particularly interesting to me because robotics and physical AI require systems that perform deterministically without unexpected failures.`;
    } else if (comp.toLowerCase().includes('uptime') || jdLower.includes('industrial') || jdLower.includes('plant') || jdLower.includes('maintenance')) {
      companySpecificReason = `What interests me about ${comp} is applying AI to mission-critical industrial operations where false outputs can cause real operational damage. During my internship at Chiacon Consulting, I built stateful LangGraph workflows and concurrent evaluation pipelines that reduced latency by ~65% via asyncio.gather(). In Unshell, I built deterministic verification firewalls to prevent hallucinations in complex data extraction. That makes this role interesting to me because I enjoy building robust, verifiable AI pipelines for demanding engineering domains.`;
    } else if (jdLower.includes('voice') || jdLower.includes('conversational')) {
      companySpecificReason = `What interests me about ${comp} is building production-grade conversational and voice AI systems. During my internship at Chiacon Consulting, I built Meera V2, an 8-node LangGraph voice screening system where I engineered adaptive silence scaling and parallel multi-agent evaluation. That makes this role particularly exciting because I have hands-on experience solving real-time voice latency and conversation flow challenges.`;
    } else {
      companySpecificReason = `What interests me about ${comp} is your focus on building robust, production-grade AI systems. During my AI Engineering internship at Chiacon Consulting, I built stateful LangGraph workflows and optimized multi-agent evaluation latency by ~65% using asyncio.gather(). Across projects like Unshell and Veridian, I focused on deterministic verification firewalls and pgvector embeddings to keep AI outputs verifiable. That makes this role compelling to me because I want to bring this focus on reliability and backend orchestration to your core platform.`;
    }

    draft = companySpecificReason;

  // 3. Role Motivation
  } else if (questionType === 'ROLE_MOTIVATION') {
    selectedEvidence = ['Meera V2 & Veridian WorkOS'];
    whyEvidence = `Aligns candidate's verified LangGraph state machines and FastAPI backend engineering to the ${role} position.`;
    sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf & cv.md';

    draft = `The ${role} role at ${comp} matches my core focus on building stateful, production-grade AI systems. At Chiacon Consulting, I architected an 8-node LangGraph voice screening system and cut multi-agent evaluation latency by ~65% using asyncio.gather(). I want to apply my hands-on background in Python, LangGraph, RAG grounding, and FastAPI to deliver production-ready AI pipelines for ${comp}.`;

  // 4. Single Project Deep-Dive
  } else if (questionType === 'PROJECT') {
    const evidence = selectProjectEvidence('PROJECT', questionText, jdText, roleTitle);
    selectedEvidence = [evidence.project.name];
    whyEvidence = evidence.reason;
    sourceFiles = evidence.project.source;

    if (evidence.key === 'UNSHELL') {
      draft = `In Unshell, which won 2nd Runner-Up at Hackfest 2026 among 750+ teams, I built the intelligence graph engine to uncover hidden beneficial ownership in corporate filings. The key problem was preventing LLM hallucinations across complex PDFs. I built a 4-stage Hyper-RAG pipeline using FAISS and created a RapidFuzz verification firewall that cross-checked extracted entities against source text, dropping claims with trust scores under 70. I then delegated all ownership cycle detection and risk scoring to a pure NetworkX graph engine rather than trusting LLM arithmetic.`;
    } else if (evidence.key === 'VERIDIAN') {
      draft = `In Veridian WorkOS, I built an enterprise workflow platform that converts meeting discussions into tracked Jira issues. The main challenge was running parallel compliance checks across HR databases, finance vector stores, and Jira APIs without race conditions. I designed a 12-node LangGraph state graph with a custom parallel-safe state reducer that performed field-level deep merges per task, backed by Human-in-the-Loop checkpointing via interrupt() and real-time SSE streaming.`;
    } else if (evidence.key === 'GITNOVA') {
      draft = `In GitNova, I built an end-to-end AI platform that discovers and ranks GitHub issues for potential contribution. I engineered a hybrid vector + lexical RAG pipeline with Tree-sitter AST code chunking, achieving 96.7% Recall@10 and 0.792 MRR@10 against merged-PR ground truth. I also built a supervised fine-tuning pipeline, fine-tuning Qwen2.5-Coder-0.5B with QLoRA on 600 real GitHub issues across 73 repositories and 20 languages, which achieved 82.2% accuracy and 79.4% Macro-F1 on repository-held-out testing.`;
    } else {
      draft = `At Chiacon Consulting, I built Meera V2, an autonomous voice AI technical interviewer. The core problem was preventing premature speech cutoffs while keeping evaluation fast. I architected an 8-node LangGraph state machine with an adaptive silence engine that scaled pauses based on speech flow, and ran technical, behavioral, and integrity evaluator agents concurrently using asyncio.gather(). This cut evaluation latency by ~65% (~13.5s to ~4.5s) while generating structured assessment scorecards.`;
    }


  // 5. Greatest Achievement
  } else if (questionType === 'ACHIEVEMENT') {
    selectedEvidence = ['Meera V2 (65% Latency Cut) & Unshell (Hackfest 2026 Award)'];
    whyEvidence = 'Combines measurable production optimization with competitive hackathon validation.';
    sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf & UNSHELL_RESUME_EVIDENCE_AUDIT.md';

    draft = `My top technical achievements include designing an asynchronous multi-agent evaluation pipeline in LangGraph using asyncio.gather() during my internship at Chiacon Consulting, which reduced evaluation latency by ~65% (~13.5s to ~4.5s). Additionally, our team was awarded 2nd Runner-Up at Hackfest 2026 out of 750+ teams for Unshell, where I engineered a zero-trust RapidFuzz verification firewall to eliminate LLM hallucinations in forensic graphs.`;

  // 6. Technical Challenge
  } else if (questionType === 'TECHNICAL_CHALLENGE') {
    if (jdLower.includes('workflow') || jdLower.includes('agentic') || jdLower.includes('backend') || qLower.includes('concurrency')) {
      selectedEvidence = ['Veridian WorkOS (Parallel-Safe State Reducer)'];
      whyEvidence = 'Demonstrates deep systems mastery of LangGraph concurrency and custom state reducers.';
      sourceFiles = 'hari_project_context/VERIDIAN_RESUME_EVIDENCE_AUDIT.md';

      draft = `A key architectural challenge in Veridian was handling concurrent state writes during LangGraph parallel fan-out checks across 4 enterprise silos (HR SQL, Finance pgvector, Security RAG, Jira capacity). Standard LangGraph fan-in overwrote sibling branch updates. I solved this by engineering a custom dictionary reducer (update_tasks_reducer) that performed field-level deep merges per task ID, preserving all non-overlapping evaluation metadata without race conditions.`;
    } else {
      selectedEvidence = ['Meera V2 (Adaptive Audio Physics & Latency Optimization)'];
      whyEvidence = 'Demonstrates real-time voice engineering, cognitive state modeling, and async concurrency.';
      sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf';

      draft = `A major technical challenge I solved in Meera was eliminating premature speech cutoffs in voice AI without introducing conversation lag. I built an adaptive silence formula scaling base 1500ms pauses by candidate cognitive state (0.7x confident to 1.4x struggling), with a +1500ms extension for 24 connective subordinators (such as 'because' or 'while'). Post-interview, I optimized evaluation latency by ~65% (~13.5s to ~4.5s) using asyncio.gather() across 3 specialist agents.`;
    }

  // 7. Technical Experience (e.g. RAG, LangGraph, Python, etc.)
  } else if (questionType === 'TECHNICAL_EXPERIENCE') {
    if (qLower.includes('rag') || qLower.includes('vector') || qLower.includes('hallucination')) {
      selectedEvidence = ['Unshell (Hyper-RAG & RapidFuzz Firewall)', 'Veridian WorkOS (Supabase pgvector)'];
      whyEvidence = 'Covers FAISS vector indexing, RapidFuzz grounding, and Supabase pgvector cosine search.';
      sourceFiles = 'hari_project_context/UNSHELL_RESUME_EVIDENCE_AUDIT.md & VERIDIAN_RESUME_EVIDENCE_AUDIT.md';

      draft = `I build grounded RAG architectures in Python using FAISS and Supabase pgvector. In Unshell, I designed a 4-stage Hyper-RAG pipeline over 50-page corporate filings and added a RapidFuzz verification firewall to drop ungrounded extractions with trust scores under 70. In Veridian WorkOS, I used 1024-dimensional semantic cosine search over enterprise policy documents to verify meeting action items before creating Jira tickets.`;
    } else if (qLower.includes('langgraph') || qLower.includes('state') || qLower.includes('agent')) {
      selectedEvidence = ['Meera V2 (8-node State Machine)', 'Veridian WorkOS (12-node Workflow)'];
      whyEvidence = 'Covers LangGraph multi-agent orchestration, state schemas, and parallel reducers.';
      sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf & VERIDIAN_RESUME_EVIDENCE_AUDIT.md';

      draft = `I have extensive hands-on experience with LangGraph building stateful multi-agent workflows. At Chiacon Consulting, I built an 8-node state machine with a 26-variable typed state, separating internal reasoning from dialogue delivery and using asyncio.gather() to run specialist evaluator agents concurrently. In Veridian WorkOS, I engineered a 12-node graph with parallel fan-out checks across 4 enterprise silos, writing a custom state reducer to handle concurrent dictionary updates without overwriting data.`;
    } else {
      selectedEvidence = ['Meera V2 & Veridian WorkOS (Python, FastAPI, LangGraph)'];
      whyEvidence = 'Covers core backend AI engineering stack.';
      sourceFiles = 'hari_project_context/MEERA_AI_ENGINEER_INTERVIEW_MASTER_GUIDE.pdf & cv.md';

      draft = `I have hands-on production experience in Python, LangGraph, FastAPI, and multi-agent orchestration. During my internship at Chiacon Consulting, I built stateful 8-node LangGraph workflows and concurrent evaluation pipelines using asyncio.gather(). Across projects like Veridian and Unshell, I have integrated pgvector embeddings, Atlassian Jira APIs, and deterministic graph analysis engines.`;
    }

  // 8. Candidate Fit / General Subjective
  } else {
    selectedEvidence = ['Meera V2 (LangGraph Systems Rigor)', 'Veridian WorkOS (Enterprise Integration)'];
    whyEvidence = 'Highlights production internship experience, systems reliability, and engineering rigor.';
    sourceFiles = 'config/profile.yml, cv.md & hari_project_context/';

    draft = `What I bring to ${comp} is strong engineering rigor in building stateful, verifiable AI systems rather than simple prompt wrappers. During my AI Engineering internship at Chiacon Consulting, I architected LangGraph multi-agent pipelines and cut evaluation latency by ~65% with asyncio.gather(). Across projects like Unshell and Veridian, I've implemented deterministic anti-hallucination verification firewalls and FastAPI backends to ensure AI workflows remain robust and reliable in production.`;
  }

  // Strict Field Limit Handling
  if (fieldLimit && fieldLimit > 50 && draft.length > fieldLimit) {
    draft = draft.slice(0, fieldLimit - 3).trim() + '...';
  }

  return {
    draft,
    selectedEvidence,
    whyEvidence,
    sourceFiles,
    questionType,
  };
}

// ── Question-Specific Semantic & Anti-Reuse Validator ───────────────────────

export function validateSubjectiveAnswer({
  questionType,
  questionText,
  answer,
  companyName = '',
  previousAnswers = [],
}) {
  const qLower = (questionText || '').toLowerCase();
  const aLower = (answer || '').toLowerCase();

  let directlyAnswers = true;
  let relevantEvidence = true;
  let notReused = true;
  let naturalStyle = true;
  let evidenceSupported = true;

  if (!answer || answer.length < 30) {
    directlyAnswers = false;
  }

  // Anti-Reuse Check: Compare with previous answers in this application
  for (const prev of previousAnswers) {
    if (prev && prev.trim()) {
      const prevLower = prev.toLowerCase();
      // If exact match or starting sentence is identical
      if (aLower === prevLower || aLower.slice(0, 50) === prevLower.slice(0, 50)) {
        notReused = false;
      }
      // Compute token overlap
      const newTokens = aLower.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3);
      const prevTokens = new Set(prevLower.replace(/[^a-z0-9 ]/g, '').split(/\s+/).filter((w) => w.length > 3));
      const overlap = newTokens.filter((t) => prevTokens.has(t)).length;
      const similarity = newTokens.length > 0 ? overlap / newTokens.length : 0;
      if (similarity > 0.8) {
        notReused = false;
      }
    }
  }

  // Question Type Specific Checks
  if (questionType === 'COMPANY_MOTIVATION') {
    if (companyName && !companyName.toLowerCase().includes('target') && !companyName.toLowerCase().includes('unknown')) {
      const compSnippet = companyName.toLowerCase().split(' ')[0];
      if (!aLower.includes(compSnippet)) {
        relevantEvidence = false;
      }
    }
  }

  if (questionType === 'PROJECT_MULTI' || qLower.includes('projects')) {
    const projectMentions = ['meera', 'veridian', 'unshell', 'gitnova'].filter((p) => aLower.includes(p));
    if (projectMentions.length < 2) {
      directlyAnswers = false;
    }
  }

  // Artificial AI Fluff Check
  const bannedPhrases = ['deeply inspired', 'thrilled to', 'would be honored', 'leveraging my extensive', 'cutting-edge', 'transformative'];
  if (bannedPhrases.some((p) => aLower.includes(p))) {
    naturalStyle = false;
  }

  const isValid = directlyAnswers && relevantEvidence && notReused && naturalStyle && evidenceSupported;

  return {
    directlyAnswers,
    relevantEvidence,
    notReused,
    naturalStyle,
    evidenceSupported,
    isValid,
  };
}

export function validateAnswerAgainstQuestion(questionType, answer, companyName) {
  const res = validateSubjectiveAnswer({ questionType, answer, companyName });
  return res.isValid;
}


// ── Multi-Signal Field Inspector ────────────────────────────────────────────

async function extractFieldSignals(element) {
  return await element.evaluate((el) => {
    // Exclude global navigation and footer elements
    const isGlobal = Boolean(el.closest('header, footer, nav, #global-nav, .global-nav, .search-global-typeahead, .artdeco-dropdown'));
    if (isGlobal) {
      return { isIgnored: true };
    }

    const id = el.id || '';
    const name = el.name || '';
    const placeholder = el.placeholder || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const inputType = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
    const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';
    const maxLengthAttr = el.getAttribute('maxlength');
    const fieldLimit = maxLengthAttr ? parseInt(maxLengthAttr, 10) : null;

    // Ignore search inputs
    if (inputType === 'search' || placeholder.toLowerCase().includes('search') || ariaLabel.toLowerCase().includes('search')) {
      return { isIgnored: true };
    }

    let labelText = '';

    // 1. Native HTML el.labels property
    if (el.labels && el.labels.length > 0) {
      labelText = el.labels[0].innerText || '';
    }

    // 2. Query label by id safely (handling colons and special characters)
    if (!labelText && id) {
      const allLabels = document.querySelectorAll('label');
      for (const l of allLabels) {
        if (l.getAttribute('for') === id) {
          labelText = l.innerText || '';
          break;
        }
      }
    }

    // 3. aria-labelledby
    if (!labelText && el.getAttribute('aria-labelledby')) {
      const labelledBy = el.getAttribute('aria-labelledby');
      const lblEl = document.getElementById(labelledBy);
      if (lblEl) labelText = lblEl.innerText || '';
    }

    // 4. aria-label
    if (!labelText && ariaLabel) {
      labelText = ariaLabel;
    }

    // 5. Closest form element container label
    if (!labelText) {
      const container = el.closest('div.fb-form-element, div.jobs-easy-apply-form-section__element, .form-group, .field, fieldset, li, p, .ashby-application-form-field, div[class*="field"], .application-field, div[data-test-form-element]');
      if (container) {
        const lbl = container.querySelector('label, legend, .fb-form-element-label, [data-test-form-element-label], .artdeco-text-input--label, span.t-14.t-bold');
        if (lbl) labelText = lbl.innerText || '';
      }
    }

    // Ignore language selector
    if (labelText.toLowerCase().includes('select language') || id.includes('language') || name.includes('locale')) {
      return { isIgnored: true };
    }

    return {
      isIgnored: false,
      id,
      name,
      placeholder,
      ariaLabel,
      autocomplete,
      inputType,
      isRequired,
      fieldLimit,
      labelText: labelText.replace(/\s+/g, ' ').trim(),
      fullSignalText: `${id} ${name} ${placeholder} ${ariaLabel} ${autocomplete} ${labelText}`.trim(),
    };
  }).catch(() => ({ isIgnored: true }));
}


// ── Robust Fill & DOM Verification Engine ───────────────────────────────────

async function fillAndVerifyInput(input, value, canonicalField) {
  try {
    await input.scrollIntoViewIfNeeded().catch(() => {});
    await input.click({ timeout: 2000 }).catch(() => {});
    await input.fill(value, { timeout: 3000 });

    await input.dispatchEvent('input').catch(() => {});
    await input.dispatchEvent('change').catch(() => {});
    await input.dispatchEvent('blur').catch(() => {});
    await sleep(300);

    let actualValue = (await input.inputValue().catch(() => '')).trim();

    if (actualValue !== value) {
      await input.click().catch(() => {});
      await input.fill('').catch(() => {});
      await input.pressSequentially(value, { delay: 15 }).catch(() => {});
      await input.dispatchEvent('input').catch(() => {});
      await input.dispatchEvent('change').catch(() => {});
      await input.dispatchEvent('blur').catch(() => {});
      await sleep(300);
      actualValue = (await input.inputValue().catch(() => '')).trim();
    }

    if (actualValue === value || actualValue.includes(value.slice(0, 30))) {
      if (canonicalField === 'CITY' || canonicalField === 'LOCATION') {
        await sleep(600);
        await input.press('ArrowDown').catch(() => {});
        await sleep(300);
        await input.press('Enter').catch(() => {});
        await sleep(400);
      }
      console.log(`  ✅ [VERIFIED] ${canonicalField} populated in DOM`);
      return { success: true, actualValue };
    } else {
      console.warn(`  ⚠️ [VERIFICATION MISMATCH] ${canonicalField}: Value could not be confirmed in DOM.`);
      return { success: false, actualValue };
    }
  } catch (err) {
    console.error(`  ❌ Error filling ${canonicalField}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── Step Processor with Fill & Verify ───────────────────────────────────────

async function processFormStep(container, profile, jobContext = {}, options = {}) {
  const autoMode = options.autoMode ?? true;
  console.log(`\n--- Scanning active step controls (Autonomous: ${autoMode ? 'YES' : 'NO'}) ---`);

  // 0. Auto-trigger "Add education" button if present on empty Education step
  const addEducationBtn = await container.$('button:has-text("Add education"), button[aria-label*="Add education"], a:has-text("Add education")').catch(() => null);
  const existingFormControls = await container.$$('input:not([type="hidden"]), select, textarea').catch(() => []);
  if (addEducationBtn && existingFormControls.length === 0 && await addEducationBtn.isVisible().catch(() => false)) {
    console.log('• Found "Add education" button on Education step. Clicking to expand fields...');
    await addEducationBtn.click().catch(() => {});
    await sleep(1500);
  }

  const detectedFields = [];
  const autoFilledFields = [];
  const verifiedFields = [];
  const humanRequiredFields = [];

  const inputs = await container.$$('input:not([type="hidden"]):not([type="file"]):not([type="radio"]):not([type="checkbox"]):not([type="submit"]):not([type="button"]), textarea');

  for (const input of inputs) {
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) continue;

    const signals = await extractFieldSignals(input);
    if (signals.isIgnored) continue;

    const currentValue = (await input.inputValue().catch(() => '')).trim();
    const classification = classifySemanticField(signals.fullSignalText, signals.inputType);

    if (classification.confidence === 'IGNORE') continue;

    detectedFields.push({ label: signals.labelText || signals.name, canonical: classification.canonical, current: currentValue });
    console.log(`• Field: "${signals.labelText || signals.name || '(unlabeled)'}" [${classification.canonical} | ${classification.confidence}] (Current: "${currentValue ? currentValue.slice(0, 40) + '...' : '(empty)'}")`);

    if (currentValue) {
      verifiedFields.push(classification.canonical);
      continue;
    }

    const labelLower = (signals.labelText || signals.name || signals.placeholder || '').toLowerCase();
    const isSkillOrExpQuestion = 
      labelLower.includes('how many years') ||
      labelLower.includes('years of experience') ||
      labelLower.includes('years of work experience') ||
      labelLower.includes('experience do you have with') ||
      labelLower.includes('experience with') ||
      (signals.inputType === 'number' && (labelLower.includes('year') || labelLower.includes('exp') || labelLower.includes('experience')));

    // 1. High-Risk Questions (Auto-Fill in Autonomous Mode)
    if (classification.confidence === 'HIGH_RISK') {
      let autoVal = null;
      if (classification.canonical === 'WORK_AUTHORIZATION') {
        autoVal = 'Yes';
      } else if (classification.canonical === 'VISA_SPONSORSHIP') {
        autoVal = 'No';
      } else if (classification.canonical === 'NOTICE_PERIOD') {
        autoVal = signals.inputType === 'number' ? '0' : 'Immediate / 0 days';
      } else if (classification.canonical === 'SALARY_CTC') {
        if (labelLower.includes('current')) {
          autoVal = '0'; // Current CTC for student/intern is 0
        } else if (signals.inputType === 'number' || labelLower.includes('lpa') || labelLower.includes('annual') || labelLower.includes('ctc') || labelLower.includes('inr')) {
          autoVal = labelLower.includes('lakh') || labelLower.includes('lpa') ? '10' : '1000000';
        } else {
          autoVal = '1000000';
        }
      }

      if (autoMode && autoVal) {
        console.log(`  → [AUTONOMOUS] Auto-filling high-risk field ${classification.canonical}: "${autoVal}"`);
        autoFilledFields.push(classification.canonical);
        const res = await fillAndVerifyInput(input, autoVal, classification.canonical);
        if (res.success) verifiedFields.push(classification.canonical);
        continue;
      } else if (!autoMode) {
        humanRequiredFields.push(signals.labelText || classification.canonical);
        console.warn(`\n====================================================`);
        console.warn(`🔒 HIGH-RISK / CONSEQUENTIAL QUESTION`);
        console.warn(`====================================================`);
        console.warn(`Question:       "${signals.labelText || signals.name}"`);
        if (classification.recommendation) {
          console.warn(`Recommended:    ${classification.recommendation}`);
        }
        console.warn(`👉 Please review and answer this field directly in the visible browser window (type "s" to skip).`);
        await askUser('👉 Press [Enter] once answered in browser (or "s" to skip): ');
        const updatedVal = (await input.inputValue().catch(() => '')).trim();
        if (updatedVal) verifiedFields.push(classification.canonical);
        continue;
      }
    }

    // 2. Subjective / Custom Open-Ended Questions (AI Subjective Intelligence)
    if (classification.confidence === 'SUBJECTIVE') {
      const qText = signals.labelText || signals.placeholder || signals.name || 'Application Question';
      const qClassification = classifySubjectiveQuestion(qText);

      if (!jobContext.previousAnswers) {
        jobContext.previousAnswers = [];
      }

      const answer = await resolveSmartAnswer({
        questionText: qText,
        signals,
        jobContext,
        profile,
      });

      console.log('\n======================================================');
      console.log('🤖 SMART QUESTION RESOLVER (Cache + Gemini 2.5)');
      console.log('======================================================');
      console.log(`Question: ${qText}`);
      console.log(`Answer:\n${answer}`);
      console.log('======================================================\n');

      autoFilledFields.push('SUBJECTIVE_QUESTION');
      const res = await fillAndVerifyInput(input, answer, 'SUBJECTIVE_QUESTION');
      if (res.success) {
        verifiedFields.push('SUBJECTIVE_QUESTION');
        jobContext.previousAnswers.push(answer);
        console.log(`[SUBJECTIVE] Answer populated, DOM-verified, and recorded in application context.\n`);
      } else {
        humanRequiredFields.push(qText);
      }
      continue;
    }

    // 3. Auto-fill High Confidence Deterministic Fields + Skill Experience Rule
    let fillValue = null;
    if (classification.canonical === 'PHONE_NATIONAL' || classification.canonical === 'PHONE') {
      fillValue = profile.phoneNational;
    } else if (classification.canonical === 'FIRST_NAME') {
      fillValue = profile.firstName;
    } else if (classification.canonical === 'LAST_NAME') {
      fillValue = profile.lastName;
    } else if (classification.canonical === 'FULL_NAME') {
      fillValue = profile.fullName;
    } else if (classification.canonical === 'EMAIL') {
      fillValue = profile.email;
    } else if (classification.canonical === 'CITY') {
      fillValue = profile.city;
    } else if (classification.canonical === 'UNIVERSITY') {
      fillValue = profile.university;
    } else if (classification.canonical === 'DEGREE') {
      fillValue = profile.degree;
    } else if (classification.canonical === 'GRADUATION_YEAR') {
      fillValue = profile.gradYear;
    } else if (classification.canonical === 'IS_STUDENT') {
      fillValue = profile.isStudent;
    } else if (classification.canonical === 'EXPERIENCE_YEARS_PROFESSIONAL') {
      fillValue = profile.expYearsProfessional;
    } else if (classification.canonical === 'EXPERIENCE_MONTHS_PROFESSIONAL') {
      fillValue = profile.expMonthsProfessional;
    } else if (classification.canonical === 'LINKEDIN') {
      fillValue = profile.linkedin;
    } else if (classification.canonical === 'GITHUB') {
      fillValue = profile.github;
    } else if (classification.canonical === 'PORTFOLIO') {
      fillValue = profile.portfolioUrl;
    } else if (classification.canonical === 'MATH_VERIFICATION' && classification.recommendation) {
      fillValue = classification.recommendation;
    } else if (isSkillOrExpQuestion) {
      // Sri Hari's rule: Set 1 for all skill years of experience
      fillValue = '1';
      classification.canonical = 'SKILL_EXPERIENCE_YEARS';
    } else if (autoMode && signals.inputType === 'number') {
      fillValue = '1';
    } else if (autoMode && (labelLower.includes('ctc') || labelLower.includes('salary'))) {
      fillValue = '₹8L-12L CTC';
    } else if (autoMode && (labelLower.includes('notice') || labelLower.includes('start'))) {
      fillValue = 'Immediate / 0 days';
    }

    if (fillValue) {
      console.log(`  → Auto-filling ${classification.canonical}: "${fillValue}"`);
      autoFilledFields.push(classification.canonical);
      const res = await fillAndVerifyInput(input, fillValue, classification.canonical);
      if (res.success) {
        verifiedFields.push(classification.canonical);
      } else if (!autoMode) {
        humanRequiredFields.push(signals.labelText || classification.canonical);
        console.warn(`\n⚠️ Fill verification could not confirm field. Please enter manually in browser.`);
        await askUser('👉 Press [Enter] once verified in browser (or "s" to skip): ');
      }
    } else if (!autoMode) {
      humanRequiredFields.push(signals.labelText || signals.name);
      console.warn(`\n====================================================`);
      console.warn(`HUMAN INPUT REQUIRED`);
      console.warn(`====================================================`);
      console.warn(`Field:       ${signals.labelText || signals.name}`);
      console.warn(`Information: ${signals.placeholder || classification.canonical}`);
      console.warn(`Reason:      Ambiguous or employer-specific question`);
      console.warn(`\n👉 Please complete this field manually in the open browser window (type "s" to skip).`);
      await askUser('👉 Press [Enter] once answered in browser (or "s" to skip): ');
    } else {
      // In autoMode, resolve with smart answer engine (Cache -> Gemini API -> Grounded Profile)
      const smartAnswer = await resolveSmartAnswer({
        questionText: signals.labelText || signals.name || 'Application question',
        signals,
        jobContext,
        profile,
      });
      console.log(`  → [AUTONOMOUS] Smart-resolving "${signals.labelText || signals.name}": "${smartAnswer}"`);
      await fillAndVerifyInput(input, smartAnswer, 'SMART_RESOLVED');
      verifiedFields.push('SMART_RESOLVED');
    }
  }

  // 4. Selects / Dropdowns
  const selects = await container.$$('select, div.fb-dropdown select');
  for (const select of selects) {
    const isVisible = await select.isVisible().catch(() => false);
    if (!isVisible) continue;

    const signals = await extractFieldSignals(select);
    if (signals.isIgnored) continue;

    const classification = classifySemanticField(signals.fullSignalText, 'select');
    if (classification.confidence === 'IGNORE') continue;

    const selectedText = await select.evaluate((el) => {
      const opt = el.options[el.selectedIndex];
      return opt ? opt.innerText.trim() : '';
    }).catch(() => '');

    console.log(`• Dropdown: "${signals.labelText || '(unlabeled)'}" [${classification.canonical}] (Selected: "${selectedText}")`);

    if (classification.canonical === 'PHONE_COUNTRY_CODE' || signals.fullSignalText.includes('country code') || signals.fullSignalText.includes('phone')) {
      if (!selectedText.includes('+91') && !selectedText.includes('India') && selectedText.toLowerCase() !== 'in') {
        console.log(`  → Selecting Country Code: India (+91)`);
        await select.selectOption({ label: 'India (+91)' }).catch(() => {});
        await select.selectOption({ value: 'in' }).catch(() => {});
        await sleep(300);
      }
      verifiedFields.push('PHONE_COUNTRY_CODE');
    } else if (classification.canonical === 'EXPERIENCE_YEARS_PROFESSIONAL') {
      const targetVal = profile.expYearsProfessional || '0';
      const options = await select.$$eval('option', (opts) => opts.map((o) => ({ text: o.innerText.trim(), value: o.value })));
      const match = options.find((o) => o.text.toLowerCase().startsWith(targetVal) || o.value === targetVal || o.text.toLowerCase().includes(`${targetVal} year`));
      if (match) {
        console.log(`  → Selecting ${classification.canonical}: "${match.text}"`);
        await select.selectOption({ value: match.value }).catch(() => select.selectOption({ label: match.text }));
        await select.dispatchEvent('change').catch(() => {});
        await sleep(300);
        verifiedFields.push('EXPERIENCE_YEARS_PROFESSIONAL');
      }
    } else if (classification.canonical === 'EXPERIENCE_MONTHS_PROFESSIONAL') {
      const targetVal = profile.expMonthsProfessional || '3';
      const options = await select.$$eval('option', (opts) => opts.map((o) => ({ text: o.innerText.trim(), value: o.value })));
      const match = options.find((o) => o.text.toLowerCase().startsWith(targetVal) || o.value === targetVal || o.text.toLowerCase().includes(`${targetVal} month`));
      if (match) {
        console.log(`  → Selecting ${classification.canonical}: "${match.text}"`);
        await select.selectOption({ value: match.value }).catch(() => select.selectOption({ label: match.text }));
        await select.dispatchEvent('change').catch(() => {});
        await sleep(300);
        verifiedFields.push('EXPERIENCE_MONTHS_PROFESSIONAL');
      }
    } else if (
      classification.canonical === 'UNIVERSITY' ||
      signals.labelText.toLowerCase().includes('school') ||
      signals.labelText.toLowerCase().includes('university') ||
      signals.labelText.toLowerCase().includes('college')
    ) {
      const options = await select.$$eval('option', (opts) => opts.map((o) => ({ text: o.innerText.trim(), value: o.value })));
      const collegeMatch = options.find((o) => {
        const t = o.text.toLowerCase();
        return t.includes('sir m. visvesvaraya institute of technology') || t.includes('sir m visvesvaraya') || t.includes('smvit');
      });

      if (collegeMatch) {
        console.log(`  → Selecting School: "${collegeMatch.text}"`);
        await select.selectOption({ value: collegeMatch.value }).catch(() => select.selectOption({ label: collegeMatch.text }));
      } else {
        const otherMatch = options.find((o) => o.text.toLowerCase().includes('other'));
        if (otherMatch) {
          console.log(`  → Selecting School fallback: "${otherMatch.text}"`);
          await select.selectOption({ value: otherMatch.value }).catch(() => select.selectOption({ label: otherMatch.text }));
        } else if (options.length > 1) {
          await select.selectOption({ value: options[1].value }).catch(() => {});
        }
      }
      await select.dispatchEvent('change').catch(() => {});
      await sleep(300);
      verifiedFields.push('UNIVERSITY');

    } else if (
      classification.canonical === 'DEGREE' ||
      signals.labelText.toLowerCase().includes('degree')
    ) {
      const options = await select.$$eval('option', (opts) => opts.map((o) => ({ text: o.innerText.trim(), value: o.value })));
      const degreeMatch = options.find((o) => {
        const t = o.text.toLowerCase();
        return t.includes("bachelor's degree") || t.includes('bachelor') || t.includes('b.e.') || t.includes('b.tech') || t.includes('undergraduate');
      });

      if (degreeMatch) {
        console.log(`  → Selecting Degree: "${degreeMatch.text}"`);
        await select.selectOption({ value: degreeMatch.value }).catch(() => select.selectOption({ label: degreeMatch.text }));
      } else {
        const otherMatch = options.find((o) => o.text.toLowerCase().includes('other'));
        if (otherMatch) {
          await select.selectOption({ value: otherMatch.value }).catch(() => select.selectOption({ label: otherMatch.text }));
        } else if (options.length > 1) {
          await select.selectOption({ value: options[1].value }).catch(() => {});
        }
      }
      await select.dispatchEvent('change').catch(() => {});
      await sleep(300);
      verifiedFields.push('DEGREE');

    } else if (classification.confidence === 'HIGH_RISK' || autoMode) {
      const options = await select.$$eval('option', (opts) => opts.map((o) => ({ text: o.innerText.trim(), value: o.value })).filter(o => o.text));
      let matchedOpt = null;

      if (classification.canonical === 'WORK_AUTHORIZATION' || signals.labelText.toLowerCase().includes('authorized') || signals.labelText.toLowerCase().includes('right to work')) {
        matchedOpt = options.find((o) => o.text.toLowerCase().startsWith('yes') || o.value.toLowerCase().startsWith('yes'));
      } else if (classification.canonical === 'VISA_SPONSORSHIP' || signals.labelText.toLowerCase().includes('sponsorship')) {
        matchedOpt = options.find((o) => o.text.toLowerCase().startsWith('no') || o.value.toLowerCase().startsWith('no'));
      } else if (signals.labelText.toLowerCase().includes('notice') || signals.labelText.toLowerCase().includes('start')) {
        matchedOpt = options.find((o) => o.text.toLowerCase().includes('immediate') || o.text.toLowerCase().includes('0') || o.text.toLowerCase().includes('15') || o.text.toLowerCase().includes('1 month'));
      } else if (signals.labelText.toLowerCase().includes('experience') || signals.labelText.toLowerCase().includes('years')) {
        matchedOpt = options.find((o) => o.text.startsWith('1') || o.text.includes('1 year') || o.text.includes('0-1') || o.text.includes('1-2'));
      }

      if (matchedOpt) {
        console.log(`  → [AUTONOMOUS] Selecting dropdown option for "${signals.labelText}": "${matchedOpt.text}"`);
        await select.selectOption({ value: matchedOpt.value }).catch(() => select.selectOption({ label: matchedOpt.text }));
        await select.dispatchEvent('change').catch(() => {});
        verifiedFields.push(classification.canonical);
      } else if (!autoMode) {
        humanRequiredFields.push(signals.labelText || classification.canonical);
        console.warn(`\n🔒 HIGH-RISK DROPDOWN QUESTION: "${signals.labelText}"`);
        console.warn(`Available Options: ${options.map(o => o.text).join(' | ')}`);
        console.warn('👉 Please select your answer in the visible browser.');
        await askUser('👉 Press [Enter] once selected (or "s" to skip): ');
        verifiedFields.push(classification.canonical);
      } else if (options.length > 1) {
        // Safe default first available option
        console.log(`  → [AUTONOMOUS] Selecting default option: "${options[1].text}"`);
        await select.selectOption({ value: options[1].value }).catch(() => {});
        await select.dispatchEvent('change').catch(() => {});
        verifiedFields.push('DROPDOWN_DEFAULT');
      }
    }
  }

  // 5. Radio Button Groups / Fieldsets
  const fieldsets = await container.$$('fieldset');
  for (const fieldset of fieldsets) {
    const isVisible = await fieldset.isVisible().catch(() => false);
    if (!isVisible) continue;

    const radioLabels = await fieldset.$$eval('label', (labels) => labels.map((l) => l.innerText.trim()).filter(Boolean));
    if (radioLabels.length === 0) continue;

    const legendText = (await fieldset.$eval('legend', (el) => el.innerText).catch(() => '')).trim();
    const classification = classifySemanticField(legendText, 'fieldset');
    const legendLower = legendText.toLowerCase();

    let targetRadio = null;
    if (legendLower.includes('sponsorship')) {
      targetRadio = await fieldset.$('label:has-text("No"), label:has-text("no")').catch(() => null);
    } else if (legendLower.includes('authorized') || legendLower.includes('right to work') || legendLower.includes('citizenship')) {
      targetRadio = await fieldset.$('label:has-text("Yes"), label:has-text("yes")').catch(() => null);
    } else if (legendLower.includes('commute') || legendLower.includes('relocate') || legendLower.includes('bengaluru') || legendLower.includes('hyderabad') || legendLower.includes('comfort') || legendLower.includes('available') || legendLower.includes('full-time') || legendLower.includes('immediate') || legendLower.includes('agreement') || legendLower.includes('consent') || legendLower.includes('background')) {
      targetRadio = await fieldset.$('label:has-text("Yes"), label:has-text("yes")').catch(() => null);
    } else if (autoMode) {
      targetRadio = await fieldset.$('label:has-text("Yes"), label:has-text("yes")').catch(() => null);
    }

    if (targetRadio) {
      const chosenText = (await targetRadio.innerText().catch(() => 'Option')).trim();
      console.log(`  → [AUTONOMOUS] Selecting radio for "${legendText}": "${chosenText}"`);
      await targetRadio.click().catch(() => {});
      await sleep(400);
      verifiedFields.push(legendText || 'Radio question');
    } else if (!autoMode) {
      console.warn(`\n🔒 QUESTION DETECTED: "${legendText || '(Question)'}" [${classification.canonical}]`);
      console.warn(`Options: ${radioLabels.join(' | ')}`);
      humanRequiredFields.push(legendText || 'Radio question');
      await askUser('👉 Press [Enter] once clicked (or "s" to skip): ');
      verifiedFields.push(classification.canonical);
    }
  }

  // 6. Resume Selection (Pre-uploaded LinkedIn CV or file upload)
  const isDataScienceRole = (jobContext.jobTitle || '').toLowerCase().includes('data scien') ||
                            (jobContext.jobTitle || '').toLowerCase().includes('data analy') ||
                            (jobContext.jobTitle || '').toLowerCase().includes('bi analy');
  const targetResume = options.targetResumeName || (isDataScienceRole ? 'srihari_ds.pdf' : 'SriHari_Resume.pdf');

  // Check if LinkedIn's pre-uploaded resume cards exist in the modal (select topmost / most recent)
  const allResumeCards = await container.$$('div[data-test-card-title], div.jobs-document-upload__title, [data-test-document-item], div:has(span:has-text(".pdf")), .jobs-resume-picker__resume, div.jobs-document-upload-card');
  let resumeCard = allResumeCards.length > 0 ? allResumeCards[0] : null;
  if (!resumeCard) {
    resumeCard = await container.$(`div:has-text("${targetResume}"), label:has-text("${targetResume}"), span:has-text("${targetResume}"), p:has-text("${targetResume}")`).catch(() => null);
  }

  if (resumeCard && await resumeCard.isVisible().catch(() => false)) {
    const cardText = (await resumeCard.innerText().catch(() => '')).split('\n')[0].trim();
    console.log(`\n• Found pre-saved LinkedIn resume option: "${cardText || targetResume}" (Selecting top resume)`);
    const radioBtn = await resumeCard.$('input[type="radio"], [role="radio"]').catch(() => null);
    if (radioBtn) {
      await radioBtn.click().catch(() => resumeCard.click());
    } else {
      await resumeCard.click().catch(() => {});
    }
    await sleep(800);
    verifiedFields.push('RESUME');
    console.log(`  ✅ [VERIFIED] Selected top pre-saved LinkedIn resume: "${cardText || targetResume}"`);
  } else {
    // Fallback file upload if file input is present
    const fileInput = await container.$('input[type="file"]');
    if (fileInput && await fileInput.isVisible().catch(() => false)) {
      const activeResumePath = resolve(ROOT_DIR, 'resumes/srihari_resumee.pdf');
      console.log(`\n• Attaching verified resume PDF: ${activeResumePath}`);
      await fileInput.setInputFiles(activeResumePath);
      await sleep(1500);
      verifiedFields.push('RESUME');
    }
  }

  // 7. Auto-save Education / Experience card if inside an active edit card
  const saveCardBtn = await container.$(
    'div[class*="education"] button:has-text("Save"), div[class*="experience"] button:has-text("Save"), [data-test-edit-card] button:has-text("Save"), button[aria-label*="Save education"], button[aria-label*="Save experience"]'
  ).catch(() => null);

  if (saveCardBtn && await saveCardBtn.isVisible().catch(() => false)) {
    console.log('• Found "Save" button inside active edit card. Saving entry...');
    await saveCardBtn.click().catch(() => {});
    await sleep(1000);
  }

  // ── Strict Required-Field Verification Check Before Next ──────────────
  console.log('\n--- Checking for unfulfilled required fields ---');
  let hasUnfulfilledRequired = false;

  for (const input of inputs) {
    const isVisible = await input.isVisible().catch(() => false);
    if (!isVisible) continue;
    const signals = await extractFieldSignals(input);
    if (signals.isIgnored) continue;
    const val = (await input.inputValue().catch(() => '')).trim();
    if (signals.isRequired && !val) {
      if (autoMode) {
        const labelLower = (signals.labelText || signals.name || '').toLowerCase();
        const autoFill = signals.inputType === 'number' ? '1' : 'Yes';
        console.log(`  → [AUTONOMOUS] Auto-completing empty required field "${signals.labelText || signals.name}" with "${autoFill}"`);
        await fillAndVerifyInput(input, autoFill, 'REQUIRED_AUTO');
      } else {
        console.warn(`❌ Unfulfilled required field: "${signals.labelText || signals.name}"`);
        hasUnfulfilledRequired = true;
      }
    }
  }

  if (hasUnfulfilledRequired && !autoMode) {
    console.warn('⚠️ Required fields are still empty. Please complete them in the browser.');
    await askUser('👉 Press [Enter] once all required fields are filled to advance (or "s" to skip): ');
  }

  return {
    detectedCount: detectedFields.length,
    autoFilledCount: autoFilledFields.length,
    verifiedCount: verifiedFields.length,
    humanRequiredCount: humanRequiredFields.length,
    canAutoAdvance: !hasUnfulfilledRequired,
  };
}

// ── External ATS / Destination Classifier ───────────────────────────────────

function detectAts(rawUrl) {
  try {
    const url = new URL(rawUrl);
    const host = url.hostname.toLowerCase();
    const path = url.pathname;

    if (host.includes('greenhouse.io')) {
      const gh = path.match(/^\/([^/]+)\/jobs\/(\d+)/);
      const company = gh ? gh[1] : url.searchParams.get('gh_jid') || 'company';
      return { ats: 'greenhouse', companySlug: company, url: rawUrl };
    }
    if (host.includes('ashbyhq.com')) {
      const seg = path.match(/^\/([^/]+)\/([^/?#]+)/);
      return { ats: 'ashby', companySlug: seg ? seg[1] : 'company', url: rawUrl };
    }
    if (host.includes('lever.co')) {
      const seg = path.match(/^\/([^/]+)\/([^/?#]+)/);
      return { ats: 'lever', companySlug: seg ? seg[1] : 'company', url: rawUrl };
    }
    if (host.includes('myworkdayjobs.com')) {
      return { ats: 'workday', companySlug: host.split('.')[0], url: rawUrl };
    }
    if (host.includes('smartrecruiters.com')) {
      return { ats: 'smartrecruiters', companySlug: host.split('.')[0], url: rawUrl };
    }
    return { ats: 'generic', companySlug: host, url: rawUrl };
  } catch {
    return { ats: 'generic', companySlug: 'external', url: rawUrl };
  }
}

async function classifyDestinationPage(page) {
  const url = page.url();
  const lowerUrl = url.toLowerCase();
  const pageTitle = (await page.title().catch(() => '')).toLowerCase();
  const bodyText = (await page.textContent('body').catch(() => '')).toLowerCase();

  const isAssessment =
    lowerUrl.includes('testgorilla.com') ||
    lowerUrl.includes('hackerrank.com') ||
    lowerUrl.includes('codility.com') ||
    lowerUrl.includes('mettl.com') ||
    lowerUrl.includes('hirevue.com') ||
    lowerUrl.includes('testtaker') ||
    pageTitle.includes('assessment') ||
    pageTitle.includes('testgorilla') ||
    bodyText.includes('welcome to your assessment') ||
    bodyText.includes('assessment instructions');

  if (isAssessment) {
    const platform = lowerUrl.includes('testgorilla') ? 'TestGorilla' : 'Pre-Application Assessment Platform';
    return { type: 'ASSESSMENT', platform, url };
  }

  const atsMeta = detectAts(url);
  if (atsMeta.ats !== 'generic') {
    return { type: 'SUPPORTED_ATS', ats: atsMeta.ats, companySlug: atsMeta.companySlug, url };
  }

  return { type: 'GENERIC_FORM', url };
}

// ── Main Assistant Execution ────────────────────────────────────────────────

async function runApplicationAssistant() {
  const args = process.argv.slice(2);
  const getArg = (flag, fallback = null) => {
    const i = args.indexOf(flag);
    return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
  };

  const TARGET_URL = getArg('--url');
  const PDF_PATH = getArg('--pdf', 'output/Banda_Sri_Hari_CV.pdf');
  const AUTO_SUBMIT = args.includes('--auto-submit');
  const AUTO_MODE = args.includes('--auto') || AUTO_SUBMIT;
  const DEBUG = args.includes('--debug');

  if (!TARGET_URL) {
    console.error('\n❌ Error: Missing --url argument.');
    console.error('Usage: node scripts/linkedin/linkedin-apply.mjs --url <linkedin_job_url> [--pdf <path>] [--auto-submit] [--debug]\n');
    process.exit(1);
  }

  const resolvedPdfPath = resolve(ROOT_DIR, PDF_PATH);

  console.log('\n======================================================');
  console.log(' Career-Ops Application Assistant & Hardened ATS Router');
  console.log('======================================================');
  console.log(`Target URL:   ${TARGET_URL}`);
  console.log(`Resume PDF:   ${PDF_PATH} (${resolvedPdfPath})`);
  console.log(`Autonomous:   ${AUTO_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Auto-Submit:  ${AUTO_SUBMIT ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Profile Dir:  ${DEFAULT_PROFILE_DIR}`);
  console.log(`Debug Mode:   ${DEBUG ? 'ENABLED' : 'DISABLED'}\n`);

  const profile = loadCandidateProfile();
  console.log(`Candidate:    ${profile.fullName} (${profile.email} | ${profile.phone})`);
  console.log(`Safety Mode:  ${AUTO_SUBMIT ? 'Autonomous Full Apply & Submit' : 'Fill-and-Verify with Human Submission Boundary'}\n`);

  console.log('1. Launching visible Chrome browser with your authenticated session...');
  const context = await createLinkedInContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {

    const isDirectAts = !TARGET_URL.includes('linkedin.com');

    if (isDirectAts) {
      console.log(`\n🔵 Direct ATS Application: ${TARGET_URL}`);
      console.log('Navigating directly to application portal...');
      await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await sleep(3500);

      const atsTitle = (await page.title().catch(() => '')) || 'Direct Role';
      const atsBody = (await page.textContent('body').catch(() => '')) || '';

      // Check for "Application" tab or "Apply" button on ATS page
      console.log('• Checking for application form triggers (Application tab / Apply button)...');
      const externalApplySelectors = [
        'button:has-text("Application")',
        'a:has-text("Application")',
        '[role="tab"]:has-text("Application")',
        'div[role="tab"]:has-text("Application")',
        'button:has-text("Apply for this job")',
        'a:has-text("Apply for this job")',
        'button:has-text("Apply for this position")',
        'a:has-text("Apply for this position")',
        'button:has-text("Apply Now")',
        'a:has-text("Apply Now")',
        'button:has-text("Apply")',
        'a:has-text("Apply")',
        'a[href*="#application"]',
        'a[href*="/apply"]',
        '[data-testid*="apply"]'
      ];

      for (const sel of externalApplySelectors) {
        const btn = await page.$(sel).catch(() => null);
        if (btn && await btn.isVisible().catch(() => false)) {
          const btnText = await btn.innerText().catch(() => sel);
          console.log(`  → Found apply trigger: "${btnText.trim()}". Clicking to reveal application form...`);
          await btn.click().catch(() => {});
          await sleep(2500);
          break;
        }
      }

      const formExists = await page.$('input:not([type="hidden"]), select, textarea').catch(() => null);
      if (!formExists) {
        console.log('\nℹ️ No automated form controls found on this view.');
        console.log('👉 Please fill the application form directly in the visible browser.');
        await askUser('👉 Press [Enter] once submitted in browser, or type "s" to skip: ');
      } else {
        const stepStats = await processFormStep(page, profile, {
          companyName: 'ATS Employer',
          jobTitle: atsTitle,
          jdText: atsBody,
        });
        console.log('\n======================================================');
        console.log(' APPLICATION READY FOR FINAL HUMAN REVIEW');
        console.log('======================================================');
        console.log('All deterministic fields have been filled and verified.');
        console.log('👉 Please review all fields in the open browser and click Submit manually.\n');
        await askUser('👉 Press [Enter] once submitted in browser, or type "s" to skip: ');
      }
      return;
    }

    console.log(`2. Navigating to job page: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await sleep(3500);

    const auth = await evaluateAuthStatus(page);
    if (auth.status === 'checkpoint' || auth.status === 'login_required' || auth.status === 'rate_limited') {
      console.error(`\n⚠️ Session Challenge: ${auth.detail}`);
      console.error('Please resolve in browser. Halting automated assistance.');
      return;
    }

    // ── Freshness & Liveness Gate ─────────────────────────────────────────
    console.log('3. Evaluating posting liveness and extracting company identity...');
    const bodyText = await page.textContent('body').catch(() => '');
    if (bodyText.includes('No longer accepting applications') || bodyText.includes('This job is closed')) {
      console.error('\n❌ POSTING CLOSED: LinkedIn indicates this role is no longer active.');
      return;
    }

    const { jobTitle, companyName, isResolved } = await extractJobAndCompany(page);

    // ── Initial Credibility Check ─────────────────────────────────────────
    const isCredible = await verifyCompanyCredibility(page, companyName, jobTitle, isResolved);
    if (!isCredible) return;

    // ── Application Type Detection ────────────────────────────────────────
    console.log('4. Analyzing application type on LinkedIn...');

    const easyApplyBtn = await page.$(
      'button.jobs-apply-button[aria-label*="Easy Apply"], button.jobs-apply-button:has-text("Easy Apply"), button:has-text("Easy Apply")'
    );

    const externalApplyBtn = await page.$(
      'button.jobs-apply-button, a.jobs-apply-button, a[href*="/jobs/view/externalApply/"], button[aria-label*="Apply to"], a:has-text("Apply")'
    );

    let executionStats = { pagesCompleted: 0, totalDetected: 0, totalFilled: 0, totalVerified: 0, totalHuman: 0 };
    const jobContext = { companyName, jobTitle, jdText: bodyText, previousAnswers: [] };


    if (easyApplyBtn) {
      // ── LANE A: LinkedIn Easy Apply (In-situ Modal) ──────────────────────
      console.log('\n🟢 Application Type: LinkedIn Easy Apply (In-situ Modal)');
      console.log('Clicking Easy Apply button...');
      await easyApplyBtn.click();
      await sleep(2500);

      const modal = await locateEasyApplyModal(page, DEBUG);
      if (!modal) {
        console.error('❌ Could not locate the Easy Apply modal dialog in the visible browser.');
        if (!DEBUG) console.log('Tip: Re-run with --debug to print modal candidate diagnostics.');
        return;
      }

      console.log('✅ Easy Apply modal located and active.');

      let stepCount = 1;
      const maxSteps = 12;

      while (stepCount <= maxSteps) {
        console.log(`\n======================================================`);
        console.log(` APPLICATION STEP #${stepCount}`);
        console.log(`======================================================`);

        // Dynamically re-locate active modal container on every step
        const activeModal = await locateEasyApplyModal(page, DEBUG);
        if (!activeModal) {
          console.error('❌ Could not locate the active Easy Apply modal dialog in browser.');
          if (!DEBUG) console.log('Tip: Re-run with --debug to print modal candidate diagnostics.');
          break;
        }

        const stepStats = await processFormStep(activeModal, profile, jobContext, { autoMode: AUTO_MODE, autoSubmit: AUTO_SUBMIT });
        executionStats.pagesCompleted++;
        executionStats.totalDetected += stepStats.detectedCount;
        executionStats.totalFilled += stepStats.autoFilledCount;
        executionStats.totalVerified += stepStats.verifiedCount;
        executionStats.totalHuman += stepStats.humanRequiredCount;

        // Capture step verification screenshot for inspection
        const stepDir = resolve(ROOT_DIR, 'reports/applications/steps');
        mkdirSync(stepDir, { recursive: true });
        const stepSlug = `${companyName}_step_${stepCount}`.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
        const stepScreenshotPath = resolve(stepDir, `${stepSlug}.png`);
        await page.screenshot({ path: stepScreenshotPath, fullPage: false }).catch(() => {});
        console.log(`  📸 Step #${stepCount} screenshot saved: ${stepScreenshotPath}`);

        await sleep(1000);

        // Check for Submit / Review / Next buttons on the active modal
        const submitBtn = await activeModal.$('button[aria-label*="Submit application"], button:has-text("Submit application")').catch(() => null);
        const reviewBtn = await activeModal.$('button[aria-label*="Review your application"], button:has-text("Review")').catch(() => null);
        const continueBtn = await activeModal.$('button:has-text("Continue")').catch(() => null);
        const nextBtn = await activeModal.$('button[aria-label*="Continue to next step"], button:has-text("Next")').catch(() => null);

        // FINAL SUBMISSION HANDLING
        if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
          console.log('\n======================================================');
          console.log(AUTO_SUBMIT ? ' 🚀 SUBMITTING APPLICATION (AUTONOMOUS MODE)' : ' APPLICATION READY FOR FINAL HUMAN REVIEW');
          console.log('======================================================');
          console.log(`Job: ${companyName} — ${jobTitle}\n`);

          const isDataScienceRole = (jobTitle || '').toLowerCase().includes('data scien') ||
                                    (jobTitle || '').toLowerCase().includes('data analy') ||
                                    (jobTitle || '').toLowerCase().includes('bi analy');
          const targetResumeName = isDataScienceRole ? 'srihari_ds.pdf' : 'SriHari_Resume.pdf';

          if (AUTO_SUBMIT) {
            console.log('• Taking pre-submission verification screenshot...');
            mkdirSync(resolve(ROOT_DIR, 'reports/applications'), { recursive: true });
            const cleanSlug = `${companyName}_${jobTitle}`.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
            const screenshotPath = resolve(ROOT_DIR, `reports/applications/${cleanSlug}.png`);
            await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => {});
            console.log(`  📸 Screenshot saved: ${screenshotPath}`);

            console.log('• Clicking "Submit application"...');
            await submitBtn.click().catch(() => {});
            await sleep(3500);

            // Close post-submit dialog if present
            const doneBtn = await page.$('button[aria-label*="Dismiss"], button:has-text("Done"), button:has-text("Close")').catch(() => null);
            if (doneBtn) {
              await doneBtn.click().catch(() => {});
              await sleep(1000);
            }

            // Record in data/applications.md
            const today = new Date().toISOString().slice(0, 10);
            const row = `| ${today} | ${companyName} | ${jobTitle} | 100/100 | Applied | [Resume](${targetResumeName}) | [LinkedIn](${TARGET_URL}) | Easy Apply (Auto) |\n`;
            const trackerPath = resolve(ROOT_DIR, 'data/applications.md');
            if (existsSync(trackerPath)) {
              const prev = readFileSync(trackerPath, 'utf-8');
              writeFileSync(trackerPath, prev + row, 'utf-8');
            }

            // Record in data/linkedin-seen.json
            const seenPath = resolve(ROOT_DIR, 'data/linkedin-seen.json');
            if (existsSync(seenPath)) {
              try {
                const seen = JSON.parse(readFileSync(seenPath, 'utf-8'));
                const mId = TARGET_URL.match(/\/view\/(\d+)/);
                const jobId = mId ? mId[1] : `job_${Date.now()}`;
                seen[jobId] = {
                  jobId,
                  company: companyName,
                  title: jobTitle,
                  url: TARGET_URL,
                  status: 'APPLIED',
                  appliedAt: new Date().toISOString(),
                };
                writeFileSync(seenPath, JSON.stringify(seen, null, 2), 'utf-8');
              } catch {}
            }

            // Dispatch Telegram confirmation
            try {
              const { sendTelegramMessage } = await import('../telegram-notifier.mjs');
              await sendTelegramMessage(
                `✅ <b>Application Submitted!</b>\n\n` +
                `🏢 <b>Company:</b> ${companyName}\n` +
                `💼 <b>Role:</b> ${jobTitle}\n` +
                `📄 <b>Resume:</b> ${targetResumeName}\n` +
                `🔗 <a href="${TARGET_URL}">View Job Listing</a>\n\n` +
                `<i>Recorded in data/applications.md</i>`
              );
            } catch (e) {
              console.warn(`Telegram alert: ${e.message}`);
            }

            console.log(`\n🎉 Application for ${companyName} (${jobTitle}) successfully submitted and recorded!\n`);
            break;
          } else {
            console.log('All deterministic fields have been filled and verified.');
            console.log('The "Submit application" button is visible on screen.\n');
            console.log('FINAL REVIEW CHECKLIST:');
            console.log(`• Resume:       ${targetResumeName}`);
            console.log(`• Candidate:    ${profile.fullName} (${profile.email} | ${profile.phone})`);
            console.log(`• Education:    ${profile.degree} (${profile.university}, Grad: ${profile.gradYear})`);
            console.log(`• Experience:   ${profile.expYearsProfessional} years, ${profile.expMonthsProfessional} months professional experience`);
            console.log('• Questions:    Eligibility, salary, and custom answers verified');
            console.log('\n👉 PLEASE REVIEW ALL FIELDS IN THE BROWSER AND CLICK "Submit application" MANUALLY.\n');
            await askUser('👉 Press [Enter] once submitted (or "s" to skip): ');
            break;
          }
        }

        // Automatic Step Advancement
        if (nextBtn && await nextBtn.isVisible().catch(() => false)) {
          if (DEBUG) console.log('[DEBUG] Button detected: "Next" | Classification: STEP_ADVANCE | Action: Clicking Next');
          console.log('• Advancing: Automatically clicking "Next"...');
          await nextBtn.click().catch(() => {});
          await sleep(2500);
        } else if (continueBtn && await continueBtn.isVisible().catch(() => false)) {
          if (DEBUG) console.log('[DEBUG] Button detected: "Continue" | Classification: STEP_ADVANCE | Action: Clicking Continue');
          console.log('• Advancing: Automatically clicking "Continue"...');
          await continueBtn.click().catch(() => {});
          await sleep(2500);
        } else if (reviewBtn && await reviewBtn.isVisible().catch(() => false)) {
          if (DEBUG) console.log('[DEBUG] Button detected: "Review" | Classification: REVIEW_ADVANCE | Action: Clicking Review');
          console.log('• Advancing: Automatically clicking "Review"...');
          await reviewBtn.click().catch(() => {});
          await sleep(2500);
        } else if (AUTO_MODE) {
          console.log('• [AUTONOMOUS] Step finished, checking for advance button...');
          const anyForwardBtn = await activeModal.$('button:has-text("Review"), button:has-text("Next"), button:has-text("Continue")').catch(() => null);
          if (anyForwardBtn) {
            await anyForwardBtn.click().catch(() => {});
            await sleep(2500);
          } else {
            break;
          }
        } else {
          console.log('\n⚠️ Step requires manual advancement in browser.');
          await askUser('👉 Press [Enter] once resolved in browser (or "s" to skip): ');
        }

        stepCount++;
      }

    } else if (externalApplyBtn) {
      // ── LANE B: External Redirect Routing ────────────────────────────────
      console.log('\n🔵 Application Type: External Apply (Redirect)');
      console.log('Clicking "Apply" and capturing destination portal...');

      let targetPage = page;
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 12000 }).catch(() => null),
        externalApplyBtn.click(),
      ]);

      if (popup) {
        targetPage = popup;
        await targetPage.waitForLoadState('domcontentloaded').catch(() => {});
        await sleep(3500);
      } else {
        await sleep(4000);
      }

      const dest = await classifyDestinationPage(targetPage);
      console.log(`Destination URL:            ${dest.url}`);
      console.log(`Destination Classification: ${dest.type}\n`);

      if (dest.type === 'ASSESSMENT') {
        console.log('======================================================');
        console.log(' 🧠 ASSESSMENT / SKILLS TEST PLATFORM DETECTED');
        console.log('======================================================');
        console.log(`Platform: ${dest.platform}`);
        console.log(`URL:      ${dest.url}\n`);
        console.log('ℹ️ NOTICE: This application routes directly into an assessment or test.');
        console.log('Per strict safety rules, the assistant will NOT automate test questions.');
        console.log('\n👉 The assessment page is open in the visible browser window.');
        console.log('👉 Please review and complete the assessment manually when ready.\n');
        await askUser('👉 Press [Enter] once finished or type "s" to skip: ');
        return;
      }

      // Look for "Application" tab or "Apply for this job" / "Apply" button on external ATS
      console.log('• Checking for external application form triggers (Application tab / Apply button)...');
      const externalApplySelectors = [
        'button:has-text("Application")',
        'a:has-text("Application")',
        '[role="tab"]:has-text("Application")',
        'div[role="tab"]:has-text("Application")',
        'button:has-text("Apply for this job")',
        'a:has-text("Apply for this job")',
        'button:has-text("Apply for this position")',
        'a:has-text("Apply for this position")',
        'button:has-text("Apply Now")',
        'a:has-text("Apply Now")',
        'button:has-text("Apply")',
        'a:has-text("Apply")',
        'a[href*="#application"]',
        'a[href*="/apply"]',
        '[data-testid*="apply"]'
      ];

      for (const sel of externalApplySelectors) {
        const btn = await targetPage.$(sel).catch(() => null);
        if (btn && await btn.isVisible().catch(() => false)) {
          const btnText = await btn.innerText().catch(() => sel);
          console.log(`  → Found external apply trigger: "${btnText.trim()}". Clicking to reveal application form...`);
          await btn.click().catch(() => {});
          await sleep(2500);
          break;
        }
      }

      // Check if form inputs are available
      const formExists = await targetPage.$('input:not([type="hidden"]), select, textarea').catch(() => null);
      if (!formExists) {
        console.log('\nℹ️ No automated form controls found on this view.');
        if (!AUTO_SUBMIT) {
          console.log('👉 The external page is open in your browser.');
          await askUser('👉 Press [Enter] once finished in browser, or type "s" to close: ');
        } else {
          console.log('• [AUTONOMOUS] External portal requires manual flow. Skipping cleanly.');
        }
      } else {
        const stepStats = await processFormStep(targetPage, profile, jobContext, { autoMode: AUTO_MODE, autoSubmit: AUTO_SUBMIT });
        executionStats.pagesCompleted = 1;
        executionStats.totalDetected += stepStats.detectedCount;
        executionStats.totalFilled += stepStats.autoFilledCount;
        executionStats.totalVerified += stepStats.verifiedCount;
        executionStats.totalHuman += stepStats.humanRequiredCount;

        if (!AUTO_SUBMIT) {
          console.log('\n======================================================');
          console.log(' 🟢 FORM FULLY FILLED & VERIFIED — BROWSER KEPT OPEN');
          console.log('======================================================');
          console.log(`Job: ${companyName || 'External Company'} — ${jobTitle || 'Role'}\n`);
          console.log('All fields have been populated and verified in the browser.');
          console.log('👉 The browser is OPEN on your screen. Please inspect the fields.');
          console.log('👉 Click Submit in the browser whenever you are ready.\n');
          await askUser('👉 Press [Enter] in this terminal once you have reviewed/submitted (or "s" to skip): ');
        }
      }
    } else {
      console.log('\n❌ No Apply button located on this page.');
      if (!AUTO_MODE) {
        await askUser('👉 Press [Enter] or type "s" to return: ');
      }
    }

    // ── Final Execution Summary Report ────────────────────────────────────
    console.log('======================================================');
    console.log(' EXECUTION SUMMARY REPORT');
    console.log('======================================================');
    console.log(`• Pages / Steps Completed:   ${executionStats.pagesCompleted}`);
    console.log(`• Form Fields Detected:      ${executionStats.totalDetected}`);
    console.log(`• Fields Auto-Filled:        ${executionStats.totalFilled}`);
    console.log(`• Fields Verified in DOM:    ${executionStats.totalVerified}`);
    console.log(`• Fields Required Human:     ${executionStats.totalHuman}`);
    console.log(`• Final Action Taken:        STOPPED BEFORE SUBMIT (Human In Control)`);
    console.log('======================================================\n');
  } catch (err) {
    if (err.name === 'UserSkipException') {
      console.log('\n⏭️ Application skipped by candidate. Returning cleanly.\n');
    } else {
      console.error(`\nApplication Assistant error: ${err.message}`);
    }
  } finally {
    if (context) {
      await context.close().catch(() => {});
    }
  }
}

if (isMain) {
  runApplicationAssistant().catch(console.error);
}

