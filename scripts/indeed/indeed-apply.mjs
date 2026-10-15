#!/usr/bin/env node

/**
 * scripts/indeed/indeed-apply.mjs
 *
 * Career-Ops Indeed Application Assistant & ATS Router
 *
 * Capabilities:
 * 1. Safe Navigation: Launches persistent Chrome context (data/indeed-profile).
 * 2. Liveness & Initial Credibility Gate.
 * 3. Multi-Lane Routing:
 *    - Lane A: Indeed Easily Apply (Modal / Multi-step Form / iframe)
 *    - Lane B: External ATS Redirection (Workday, Greenhouse, Taleo, etc.)
 * 4. Multi-Signal Semantic DOM Engine: Fills and verifies deterministic candidate fields.
 * 5. Grounded Subjective Question Intelligence: Answers custom employer questions in Sri Hari's authentic voice.
 * 6. Hard Final Review Safety Gate: STRICT STOP before clicking Submit — leaves browser visible for manual review.
 */

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import readline from 'readline';
import * as yaml from 'js-yaml';
import {
  createIndeedContext,
  evaluateIndeedAuthStatus,
  DEFAULT_INDEED_PROFILE_DIR,
} from './indeed-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

// ── CLI Arguments ───────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const TARGET_URL = getArg('--url', args.find((a) => a.startsWith('http')) || null);
const PDF_PATH = getArg('--pdf', 'output/Banda_Sri_Hari_CV.pdf');
const DEBUG = args.includes('--debug');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomSleep = (min, max) => sleep(Math.floor(Math.random() * (max - min + 1)) + min);

async function naturalScroll(page) {
  try {
    const scrollCount = Math.floor(Math.random() * 2) + 1;
    for (let s = 0; s < scrollCount; s++) {
      const scrollY = Math.floor(Math.random() * 250) + 100;
      await page.mouse.wheel(0, scrollY).catch(() => {});
      await randomSleep(300, 700);
    }
  } catch {
    // fallback
  }
}

function askUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(query, (ans) => {
      rl.close();
      res(ans.trim());
    });
  });
}

// ── Candidate Profile Loader ────────────────────────────────────────────────

function loadCandidateProfile() {
  const profileYmlPath = resolve(ROOT_DIR, 'config/profile.yml');

  let profileData = {};
  if (existsSync(profileYmlPath)) {
    try {
      profileData = yaml.load(readFileSync(profileYmlPath, 'utf-8')) || {};
    } catch {
      // fallback
    }
  }

  const cand = profileData.candidate || {};
  return {
    fullName: cand.full_name || 'Banda Sri Hari',
    firstName: 'Sri',
    lastName: 'Hari',
    email: cand.email || 'sriharizbett@gmail.com',
    phone: cand.phone || '+91 81257 52880',
    phoneNational: '8125752880',
    phoneCountryCode: '+91',
    city: 'Bengaluru',
    state: 'Karnataka',
    country: 'India',
    university: 'Sir M. Visvesvaraya Institute of Technology',
    universityShort: 'SMVIT',
    degree: "Bachelor's Degree (B.E. AIML)",
    discipline: 'Artificial Intelligence and Machine Learning',
    gradYear: '2027',
    gpa: '8.72',
    expYearsProfessional: '0',
    expMonthsProfessional: '3',
    targetCtc: '₹8L-12L CTC',
    noticePeriod: 'Immediate / 0 days',
    linkedinUrl: 'https://linkedin.com/in/sri-hari-48321b297',
    githubUrl: 'https://github.com/sriharizz',
    portfolioUrl: 'https://srihari-dev.vercel.app/',
  };
}

// ── Semantic Field Classifier ───────────────────────────────────────────────

function classifySemanticField(signalText, inputType = 'text') {
  const s = signalText.toLowerCase();

  // 1. High Confidence Deterministic
  if (s.match(/\b(first[- ]?name|given[- ]?name|fname)\b/)) return { canonical: 'FIRST_NAME', confidence: 'HIGH' };
  if (s.match(/\b(last[- ]?name|family[- ]?name|surname|lname)\b/)) return { canonical: 'LAST_NAME', confidence: 'HIGH' };
  if (s.match(/\b(full[- ]?name|candidate[- ]?name|your name)\b/)) return { canonical: 'FULL_NAME', confidence: 'HIGH' };
  if (s.match(/\b(email|e-mail)\b/)) return { canonical: 'EMAIL', confidence: 'HIGH' };
  if (s.match(/\b(phone|mobile|contact number|cell phone)\b/)) return { canonical: 'PHONE_NATIONAL', confidence: 'HIGH' };
  if (s.match(/\b(linkedin|linkedin profile|linkedin url)\b/)) return { canonical: 'LINKEDIN_URL', confidence: 'HIGH' };
  if (s.match(/\b(github|github profile|github url)\b/)) return { canonical: 'GITHUB_URL', confidence: 'HIGH' };
  if (s.match(/\b(portfolio|website|personal site)\b/)) return { canonical: 'PORTFOLIO_URL', confidence: 'HIGH' };
  if (s.match(/\b(city|current city|current location)\b/)) return { canonical: 'CITY', confidence: 'HIGH' };
  if (s.match(/\b(years of experience|total experience|overall experience)\b/)) return { canonical: 'EXPERIENCE_YEARS', confidence: 'HIGH' };

  // 2. Consequential / High Risk
  if (s.match(/\b(notice period|how soon|availability to join|earliest start date)\b/)) {
    return { canonical: 'NOTICE_PERIOD', confidence: 'HIGH_RISK', recommendation: 'Immediate / 0 days' };
  }
  if (s.match(/\b(expected ctc|expected salary|salary expectation|desired salary)\b/)) {
    return { canonical: 'SALARY_CTC', confidence: 'HIGH_RISK', recommendation: '₹8L-12L CTC' };
  }
  if (s.match(/\b(authorized to work|legally authorized|work permit|work authorization)\b/)) {
    return { canonical: 'WORK_AUTHORIZATION', confidence: 'HIGH_RISK', recommendation: 'Yes (Authorized in India)' };
  }

  // 3. Subjective Questions
  if (inputType === 'textarea' || s.match(/\b(why|tell us|describe|proud|accomplishment|project|projects|challenge|background|experience|fit|hire|explain)\b/)) {
    return { canonical: 'SUBJECTIVE_QUESTION', confidence: 'SUBJECTIVE' };
  }

  return { canonical: 'UNKNOWN', confidence: 'UNKNOWN' };
}

// ── Subjective Question Classification & Answer Engine ──────────────────────

export function classifySubjectiveQuestion(questionText) {
  const q = (questionText || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

  // Multi-Project Breakdown
  if (
    q.match(/\b(two to three|2 to 3|2 3|multiple projects|two projects|three projects)\b/) ||
    ((q.includes('2 3') || q.includes('two') || q.includes('three') || q.includes('multiple')) &&
      (q.includes('project') || q.includes('system') || q.includes('accomplish') || q.includes('built') || q.includes('engineered'))) ||
    (q.includes('projects') && (q.includes('proud') || q.includes('accomplishments') || q.includes('built') || q.includes('showcase')))
  ) {
    return { type: 'PROJECT_MULTI', label: 'Multi-Project Deep-Dive' };
  }


  // Company Motivation
  if (
    q.match(/\bwhy\b.*?\b(work at|join|work with|interested in|work for)\b/) ||
    q.match(/\bwhat (attracts|interests) you (about|in)\b/)
  ) {
    return { type: 'COMPANY_MOTIVATION', label: 'Company Motivation' };
  }

  // Role Motivation
  if (
    q.match(/\bwhy\b.*?\b(this role|this position|this job|this internship)\b/) ||
    q.match(/\bwhat interests you about this (role|position)\b/)
  ) {
    return { type: 'ROLE_MOTIVATION', label: 'Role Motivation' };
  }

  // Single Project Deep-Dive
  if (q.match(/\b(tell us about.*project|describe.*project|walk us through.*project|recent project|key project|system you built)\b/)) {
    return { type: 'PROJECT', label: 'Project Deep-Dive' };
  }

  // Technical Experience
  if (q.match(/\b(experience with|worked with|hands on with|familiarity with|background in|describe your experience)\b/)) {
    return { type: 'TECHNICAL_EXPERIENCE', label: 'Technical Experience' };
  }

  return { type: 'OTHER_SUBJECTIVE', label: 'General Subjective Question' };
}

export function generateSubjectiveAnswer({
  questionType,
  questionText = '',
  companyName = '',
  roleTitle = '',
  jdText = '',
  fieldLimit = null,
  previousAnswers = [],
}) {
  const comp = companyName && !companyName.toLowerCase().includes('unknown') ? companyName : 'your team';
  const role = roleTitle || 'AI Engineering';
  const qLower = questionText.toLowerCase();

  let draft = '';
  let selectedEvidence = [];

  if (questionType === 'PROJECT_MULTI' || qLower.includes('projects')) {
    selectedEvidence = [
      'Meera V2 (Voice AI Interviewer & Async Concurrency Optimization)',
      'Veridian WorkOS (Enterprise LangGraph Orchestration & Parallel Reducer)',
      'Unshell (Forensic AML Hyper-RAG & Deterministic Cycle Detection)',
    ];

    draft = `I've worked on several AI systems, but three that stand out are Meera V2, Veridian WorkOS, and Unshell.

In Meera V2, I built an autonomous voice-based AI technical interviewer at Chiacon Consulting. The main challenge was making spoken conversations feel natural without cutting candidates off and eliminating post-interview evaluation delays. I architected an 8-node LangGraph state machine with adaptive silence scaling and ran specialized evaluation agents concurrently with asyncio.gather(), reducing latency by ~65% (~13.5s down to ~4.5s).

In Veridian WorkOS, I built an enterprise workflow automation platform that converts meeting discussions into policy-checked Jira tickets. The key problem was running parallel checks across HR, finance, and security databases without corrupting shared state. I built a 12-node LangGraph orchestrator with a custom parallel-safe state reducer and implemented Human-in-the-Loop checkpointing via interrupt() with real-time SSE telemetry.

I also built Unshell, an AML and corporate intelligence graph that won 2nd Runner-Up at Hackfest 2026 out of 750+ teams. To eliminate hallucinations across 50-page corporate filings, I engineered a 4-stage Hyper-RAG pipeline with FAISS and created a RapidFuzz verification firewall that dropped ungrounded claims with trust scores under 70, delegating all ownership cycle detection to a pure NetworkX graph engine.`;

  } else if (questionType === 'COMPANY_MOTIVATION') {
    selectedEvidence = [
      'Meera V2 (LangGraph State Machines & Async Concurrency)',
      'Unshell (Anti-Hallucination Verification Firewalls)',
    ];

    draft = `What interests me about ${comp} is your focus on building robust, production-grade AI systems. During my AI Engineering internship at Chiacon Consulting, I built stateful LangGraph workflows and optimized multi-agent evaluation latency by ~65% using asyncio.gather(). Across projects like Unshell and Veridian, I focused on deterministic verification firewalls and pgvector embeddings to keep AI outputs verifiable. That makes this role compelling to me because I want to bring this focus on reliability and backend orchestration to your core platform.`;

  } else if (questionType === 'ROLE_MOTIVATION') {
    selectedEvidence = ['Meera V2 & Veridian WorkOS'];
    draft = `The ${role} role at ${comp} matches my core focus on building stateful, production-grade AI systems. At Chiacon Consulting, I architected an 8-node LangGraph voice screening system and cut multi-agent evaluation latency by ~65% using asyncio.gather(). I want to apply my hands-on background in Python, LangGraph, RAG grounding, and FastAPI to deliver production-ready AI pipelines for ${comp}.`;

  } else if (questionType === 'PROJECT') {
    if (qLower.includes('fine-tuning') || qLower.includes('ast') || qLower.includes('code') || qLower.includes('gitnova')) {
      selectedEvidence = ['GitNova (Supervised Fine-Tuning & Hybrid AST RAG)'];
      draft = `In GitNova, I built an end-to-end AI platform that discovers and ranks GitHub issues for potential contribution. I engineered a hybrid vector + lexical RAG pipeline with Tree-sitter AST code chunking, achieving 96.7% Recall@10 and 0.792 MRR@10 against merged-PR ground truth. I also built a supervised fine-tuning pipeline, fine-tuning Qwen2.5-Coder-0.5B with QLoRA on 600 real GitHub issues across 73 repositories and 20 languages, which achieved 82.2% accuracy and 79.4% Macro-F1 on repository-held-out testing.`;
    } else if (qLower.includes('rag') || qLower.includes('graph') || qLower.includes('compliance')) {
      selectedEvidence = ['Unshell (Hackfest 2026 2nd Runner-Up)'];
      draft = `In Unshell, which won 2nd Runner-Up at Hackfest 2026 among 750+ teams, I built the intelligence graph engine to uncover hidden beneficial ownership in corporate filings. The key problem was preventing LLM hallucinations across complex PDFs. I built a 4-stage Hyper-RAG pipeline using FAISS and created a RapidFuzz verification firewall that cross-checked extracted entities against source text, dropping claims with trust scores under 70. I then delegated all ownership cycle detection and risk scoring to a pure NetworkX graph engine rather than trusting LLM arithmetic.`;
    } else {
      selectedEvidence = ['Meera V2 (AI Engineer Internship at Chiacon)'];
      draft = `At Chiacon Consulting, I built Meera V2, an autonomous voice AI technical interviewer. The core problem was preventing premature speech cutoffs while keeping evaluation fast. I architected an 8-node LangGraph state machine with an adaptive silence engine that scaled pauses based on speech flow, and ran technical, behavioral, and integrity evaluator agents concurrently using asyncio.gather(). This cut evaluation latency by ~65% (~13.5s to ~4.5s) while generating structured assessment scorecards.`;
    }

  } else if (questionType === 'TECHNICAL_EXPERIENCE') {
    selectedEvidence = ['Meera V2 (8-node State Machine)', 'Veridian WorkOS (12-node Workflow)'];
    draft = `I have extensive hands-on experience with LangGraph building stateful multi-agent workflows. At Chiacon Consulting, I built an 8-node state machine with a 26-variable typed state, separating internal reasoning from dialogue delivery and using asyncio.gather() to run specialist evaluator agents concurrently. In Veridian WorkOS, I engineered a 12-node graph with parallel fan-out checks across 4 enterprise silos, writing a custom state reducer to handle concurrent dictionary updates without overwriting data.`;

  } else {
    selectedEvidence = ['Meera V2 & Veridian WorkOS'];
    draft = `What I bring to ${comp} is strong engineering rigor in building stateful, verifiable AI systems rather than simple prompt wrappers. During my AI Engineering internship at Chiacon Consulting, I architected LangGraph multi-agent pipelines and cut evaluation latency by ~65% with asyncio.gather(). Across projects like Unshell and Veridian, I've implemented deterministic anti-hallucination verification firewalls and FastAPI backends to ensure AI workflows remain robust and reliable in production.`;
  }

  if (fieldLimit && fieldLimit > 50 && draft.length > fieldLimit) {
    draft = draft.slice(0, fieldLimit - 3).trim() + '...';
  }

  return {
    draft,
    selectedEvidence,
    questionType,
  };
}

// ── DOM Multi-Signal Field Inspector ────────────────────────────────────────

async function extractIndeedFieldSignals(element) {
  return await element.evaluate((el) => {
    const isGlobal = Boolean(el.closest('header, footer, nav, [data-gnav-element-name]'));
    if (isGlobal) return { isIgnored: true };

    const id = el.id || '';
    const name = el.name || '';
    const placeholder = el.placeholder || '';
    const ariaLabel = el.getAttribute('aria-label') || '';
    const autocomplete = el.getAttribute('autocomplete') || '';
    const inputType = (el.getAttribute('type') || el.tagName.toLowerCase()).toLowerCase();
    const isRequired = el.hasAttribute('required') || el.getAttribute('aria-required') === 'true';

    let labelText = '';
    if (el.labels && el.labels.length > 0) {
      labelText = el.labels[0].innerText || '';
    }

    if (!labelText && id) {
      const allLabels = document.querySelectorAll('label');
      for (const l of allLabels) {
        if (l.getAttribute('for') === id) {
          labelText = l.innerText || '';
          break;
        }
      }
    }

    if (!labelText && ariaLabel) {
      labelText = ariaLabel;
    }

    if (!labelText) {
      const container = el.closest('div.ia-FormRow, div.ia-Question, div.ia-BasePage-field, fieldset, div[class*="field"]');
      if (container) {
        const lbl = container.querySelector('label, legend, span.ia-Question-text, span.css-1f95z14');
        if (lbl) labelText = lbl.innerText || '';
      }
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
      labelText: labelText.replace(/\s+/g, ' ').trim(),
      fullSignalText: `${id} ${name} ${placeholder} ${ariaLabel} ${autocomplete} ${labelText}`.trim(),
    };
  }).catch(() => ({ isIgnored: true }));
}

async function fillAndVerifyIndeedInput(input, value, canonicalField) {
  try {
    await input.focus();
    await input.fill(String(value));
    await randomSleep(300, 600);

    const actualValue = await input.inputValue().catch(() => '');
    if (actualValue && (actualValue.includes(String(value).slice(0, 10)) || actualValue === String(value))) {
      console.log(`  ✅ [VERIFIED] ${canonicalField} populated in DOM`);
      return { success: true, actualValue };
    }

    // Keyboard Fallback
    await input.click();
    await input.press('Control+A');
    await input.press('Backspace');
    await input.type(String(value), { delay: 25 });
    await randomSleep(300, 600);

    const fallbackVal = await input.inputValue().catch(() => '');
    if (fallbackVal) {
      console.log(`  ✅ [VERIFIED VIA KEYBOARD] ${canonicalField} populated in DOM`);
      return { success: true, actualValue: fallbackVal };
    }

    return { success: false, actualValue };
  } catch (err) {
    console.error(`  ❌ Error filling ${canonicalField}: ${err.message}`);
    return { success: false, error: err.message };
  }
}

// ── Application Assistant Runner ────────────────────────────────────────────

export async function runIndeedApplicationAssistant() {
  if (!TARGET_URL) {
    console.error('❌ Error: No target Indeed URL provided.');
    console.log('Usage: node scripts/indeed/indeed-apply.mjs --url "https://in.indeed.com/viewjob?jk=..."');
    process.exit(1);
  }

  const resolvedPdfPath = resolve(ROOT_DIR, PDF_PATH);
  const profile = loadCandidateProfile();

  console.log('\n======================================================');
  console.log(' Career-Ops Indeed Application Assistant & ATS Router');
  console.log('======================================================');
  console.log(`Target URL:   ${TARGET_URL}`);
  console.log(`Resume PDF:   ${PDF_PATH} (${existsSync(resolvedPdfPath) ? 'Found' : 'MISSING'})`);
  console.log(`Candidate:    ${profile.fullName} (${profile.email} | ${profile.phone})`);
  console.log('Safety Mode:  Fill-and-Verify. NO AUTO-SUBMIT.\n');

  console.log('1. Launching persistent browser context...');
  const context = await createIndeedContext({ headless: false });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  try {
    console.log(`2. Navigating to job page: ${TARGET_URL}...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded', timeout: 35000 });
    await randomSleep(3000, 5000);

    const auth = await evaluateIndeedAuthStatus(page);
    if (auth.status === 'checkpoint') {
      console.warn(`\n⚠️ Security challenge encountered: ${auth.detail}`);
      console.warn('Please complete verification in browser.');
      return;
    }

    // Extract Title & Company
    const jobTitle = (await page.$eval('h1[data-testid="jobsearch-JobInfoHeader-title"], h1.jobsearch-JobInfoHeader-title, h1', (el) => el.innerText.trim()).catch(() => '')) || 'AI Engineer';
    const companyName = (await page.$eval('div[data-testid="inlineHeader-companyName"] a, span.css-1x7z1yo, [data-company-name="true"]', (el) => el.innerText.trim()).catch(() => '')) || 'Employer';

    console.log(`\n======================================================`);
    console.log(` JOB DETECTED: ${companyName} — ${jobTitle}`);
    console.log(`======================================================\n`);

    // ── Detect Application Trigger ────────────────────────────────────────
    const applyOnCompanySiteBtn = await page.$(
      'button:has-text("Apply on company site"), a:has-text("Apply on company site"), a[id*="applyButton"]'
    ).catch(() => null);

    const easilyApplyBtn = await page.$(
      'button[id*="indeedApplyButton"], button:has-text("Apply now"), button:has-text("Easily apply"), .indeed-apply-button'
    ).catch(() => null);

    if (applyOnCompanySiteBtn && await applyOnCompanySiteBtn.isVisible().catch(() => false)) {
      console.log('🔵 Application Type: External Company ATS Redirect');
      console.log('Clicking "Apply on company site"...');

      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 12000 }).catch(() => null),
        applyOnCompanySiteBtn.click().catch(() => {}),
      ]);

      const targetPage = popup || page;
      await targetPage.waitForLoadState('domcontentloaded').catch(() => {});
      await randomSleep(3000, 5000);

      console.log(`Destination Portal: ${targetPage.url()}`);
      console.log('\n======================================================');
      console.log(' EXTERNAL ATS DESTINATION READY');
      console.log('======================================================');
      console.log('👉 Please review and complete the external application in the browser.');
      await askUser('👉 Press [Enter] once submitted in browser (or "s" to skip): ');
      return;
    }

    if (easilyApplyBtn && await easilyApplyBtn.isVisible().catch(() => false)) {
      console.log('🟢 Application Type: Indeed Easily Apply');
      console.log('Clicking "Apply now" to open application flow...');
      await easilyApplyBtn.click().catch(() => {});
      await randomSleep(3000, 5000);

      let stepCount = 1;
      const maxSteps = 8;

      while (stepCount <= maxSteps) {
        console.log(`\n------------------------------------------------------`);
        console.log(` APPLICATION STEP #${stepCount}`);
        console.log(`------------------------------------------------------`);

        // Check for iframe or modal container
        const modalContainer = await page.$(
          'div.ia-BasePage, div#indeedApplyModal, div[role="dialog"], div.ia-container'
        ).catch(() => null);

        const activeContainer = modalContainer || page;

        // Check if we reached the final Review screen
        const isReviewScreen = await activeContainer.evaluate(() => {
          const body = document.body.innerText;
          return body.includes('Review your application') || body.includes('Please review your information') || Boolean(document.querySelector('button:has-text("Submit your application"), button:has-text("Submit application")'));
        }).catch(() => false);

        if (isReviewScreen) {
          console.log('\n======================================================');
          console.log(' ✅ FINAL REVIEW SCREEN REACHED');
          console.log('======================================================');
          console.log(`Company:       ${companyName}`);
          console.log(`Role:          ${jobTitle}`);
          console.log(`Candidate:     ${profile.fullName} (${profile.email} | ${profile.phone})`);
          console.log(`Resume:        output/Banda_Sri_Hari_CV.pdf attached`);
          console.log('\n👉 THE SCRIPT WILL NEVER AUTOMATICALLY SUBMIT THE APPLICATION.');
          console.log('👉 PLEASE REVIEW ALL DETAILS IN THE BROWSER AND CLICK SUBMIT MANUALLY.\n');
          await askUser('👉 Press [Enter] once submitted in browser (or "s" to skip): ');
          break;
        }

        // Scan and populate inputs
        const inputs = await activeContainer.$$('input:not([type="hidden"]), textarea').catch(() => []);

        for (const input of inputs) {
          const isVis = await input.isVisible().catch(() => false);
          if (!isVis) continue;

          const signals = await extractIndeedFieldSignals(input);
          if (signals.isIgnored) continue;

          const classification = classifySemanticField(signals.fullSignalText, signals.inputType);

          if (classification.confidence === 'HIGH_RISK') {
            console.warn(`\n🔒 HIGH-RISK QUESTION: "${signals.labelText || signals.name}"`);
            if (classification.recommendation) {
              console.warn(`Recommended: ${classification.recommendation}`);
            }
            console.warn('👉 Please confirm or answer directly in browser.');
            await askUser('👉 Press [Enter] once answered in browser: ');
            continue;
          }

          if (classification.confidence === 'SUBJECTIVE') {
            const qText = signals.labelText || 'Application Question';
            const qClassification = classifySubjectiveQuestion(qText);
            const result = generateSubjectiveAnswer({
              questionType: qClassification.type,
              questionText: qText,
              companyName,
              roleTitle: jobTitle,
            });

            console.log(`\n[SUBJECTIVE QUESTION] ${qText}`);
            console.log(`Generated Answer:\n${result.draft}\n`);
            await fillAndVerifyIndeedInput(input, result.draft, 'SUBJECTIVE_QUESTION');
            continue;
          }

          // Deterministic Fields
          let fillVal = null;
          if (classification.canonical === 'PHONE_NATIONAL') fillVal = profile.phoneNational;
          else if (classification.canonical === 'EMAIL') fillVal = profile.email;
          else if (classification.canonical === 'FIRST_NAME') fillVal = profile.firstName;
          else if (classification.canonical === 'LAST_NAME') fillVal = profile.lastName;
          else if (classification.canonical === 'FULL_NAME') fillVal = profile.fullName;
          else if (classification.canonical === 'CITY') fillVal = profile.city;
          else if (classification.canonical === 'EXPERIENCE_YEARS') fillVal = profile.expYearsProfessional;

          if (fillVal) {
            console.log(`• Auto-filling ${classification.canonical}: "${fillVal}"`);
            await fillAndVerifyIndeedInput(input, fillVal, classification.canonical);
          }
        }

        // Check for file input
        const fileInput = await activeContainer.$('input[type="file"]').catch(() => null);
        if (fileInput && existsSync(resolvedPdfPath)) {
          console.log(`\n• Attaching verified resume PDF: ${PDF_PATH}`);
          await fileInput.setInputFiles(resolvedPdfPath).catch(() => {});
          await randomSleep(1500, 2500);
        }

        // Look for Continue / Next button (NEVER CLICK SUBMIT)
        const continueBtn = await activeContainer.$(
          'button:has-text("Continue"), button:has-text("Next"), button.ia-continueButton'
        ).catch(() => null);

        const submitBtn = await activeContainer.$(
          'button:has-text("Submit your application"), button:has-text("Submit application"), button:has-text("Submit")'
        ).catch(() => null);

        if (submitBtn && await submitBtn.isVisible().catch(() => false)) {
          console.log('\n======================================================');
          console.log(' ✅ FINAL REVIEW SCREEN REACHED (SUBMIT BUTTON DETECTED)');
          console.log('======================================================');
          console.log('\n👉 SCRIPT HALTED BEFORE SUBMISSION.');
          console.log('👉 PLEASE REVIEW IN BROWSER AND CLICK SUBMIT MANUALLY.\n');
          await askUser('👉 Press [Enter] once submitted in browser (or "s" to skip): ');
          break;
        }

        if (continueBtn && await continueBtn.isVisible().catch(() => false)) {
          console.log('• Advancing to next step (clicking Continue)...');
          await continueBtn.click().catch(() => {});
          await randomSleep(2500, 4500);
          stepCount++;
        } else {
          console.log('• Reached end of automated form steps or waiting for your interaction.');
          await askUser('👉 Press [Enter] when ready to complete/advance in browser: ');
          break;
        }
      }
    } else {
      console.log('\nℹ️ No direct Indeed Apply button located. Please inspect the open page directly in your browser.');
      await askUser('👉 Press [Enter] when done with this role: ');
    }

  } finally {
    await context.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  runIndeedApplicationAssistant().catch((err) => {
    console.error('Fatal Application Assistant Error:', err);
    process.exit(1);
  });
}
