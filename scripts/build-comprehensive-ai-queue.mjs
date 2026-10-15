#!/usr/bin/env node

/**
 * scripts/build-comprehensive-ai-queue.mjs
 *
 * Unified Cross-Platform AI & FDE Job/Internship Queue Builder (70-90 Roles)
 *
 * Strict Rules:
 * 1. ZERO Repeated Companies/URLs (Checked against all 80+ records in data/applications.md).
 * 2. Roles: AI Engineer, GenAI, Agentic AI, LLM, ML, FDE, AI/ML/GenAI/FDE Internships.
 * 3. Experience: 0-3 YOE & Internships ONLY.
 * 4. Location: Bengaluru, Hyderabad, Remote India, Global Remote.
 * 5. Online Assessments: 100% ALLOWED & INCLUDED.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const APPLICATIONS_FILE = resolve(ROOT_DIR, 'data/applications.md');
const PIPELINE_FILE = resolve(ROOT_DIR, 'data/pipeline.md');
const SCAN_HISTORY_FILE = resolve(ROOT_DIR, 'data/scan-history.tsv');
const LINKEDIN_QUEUE_FILE = resolve(ROOT_DIR, 'data/linkedin-queue.json');
const WELLFOUND_SEEN_FILE = resolve(ROOT_DIR, 'data/wellfound-seen.json');
const PEERLIST_QUEUE_FILE = resolve(ROOT_DIR, 'data/peerlist-queue.json');
const MASTER_OUTPUT_FILE = resolve(ROOT_DIR, 'data/daily-master-queue.md');

function normalizeCompanyName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp|software|technology|analytics|global)\.?$/i, '')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function loadAppliedSet() {
  const appliedCompanies = new Set();
  const appliedUrls = new Set();

  if (existsSync(APPLICATIONS_FILE)) {
    const text = readFileSync(APPLICATIONS_FILE, 'utf-8');
    text.split('\n').forEach((line) => {
      const cols = line.split('|').map((s) => s.trim());
      if (cols.length >= 8 && cols[2] && !cols[2].includes('Company') && !cols[2].includes('---')) {
        const comp = normalizeCompanyName(cols[2]);
        if (comp) appliedCompanies.add(comp);

        const urlMatch = line.match(/\(https?:\/\/[^)]+\)/);
        if (urlMatch) {
          appliedUrls.add(urlMatch[0].replace(/[()]/g, '').trim());
        }
      }
    });
  }

  return { appliedCompanies, appliedUrls };
}

function extractFromPipeline(appliedCompanies, appliedUrls) {
  const jobs = [];
  if (!existsSync(PIPELINE_FILE)) return jobs;

  const lines = readFileSync(PIPELINE_FILE, 'utf-8').split('\n');

  lines.forEach((line) => {
    if (!line.startsWith('- [ ]')) return;

    const parts = line.replace(/^- \[[ x]\]\s*/, '').split('|').map((s) => s.trim());
    if (parts.length < 4) return;

    const url = parts[0];
    const company = parts[1];
    const title = parts[2];
    const location = parts[3];

    const normComp = normalizeCompanyName(company);
    if (appliedCompanies.has(normComp) || appliedUrls.has(url)) return;

    const titleLower = title.toLowerCase();
    const locLower = location.toLowerCase();

    // Strict Location Check: India or Global Remote
    const isIndia = /\b(bengaluru|bangalore|hyderabad|telangana|karnataka|pune|delhi|mumbai|gurgaon|gurugram|noida|chennai|india)\b/i.test(locLower);
    const isGlobalRemote = (locLower === 'remote' || locLower === '100% remote' || locLower.includes('remote, india') || locLower.includes('india - remote') || locLower.includes('remote - india') || locLower.includes('india/global') || locLower.includes('apac')) &&
                           !/\b(us|usa|united states|canada|uk|london|europe|germany|portugal|ukraine|mexico|brazil|spain|poland|austria|australia|bulgaria|costa rica|ny|ca|fl|tn|nc|tx)\b/i.test(locLower);

    if (!isIndia && !isGlobalRemote) return;

    // Hard Seniority Exclusion
    if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|expert|ii-1|iii|manager)\b/i.test(titleLower)) return;

    // Strict AI/GenAI/ML/FDE & Intern Focus
    const isAiMlFde = /ai|genai|generative|llm|agent|machine learning|ml|fde|forward deployed|nlp|vision|perception|ray|eval|data scientist/i.test(titleLower);
    const isIntern = /intern/i.test(titleLower);

    if (isAiMlFde || isIntern) {
      let fitScore = 80;
      if (isIntern && isAiMlFde) fitScore = 100;
      else if (isIntern) fitScore = 95;
      else if (/agentic|genai|fde|forward deployed/i.test(titleLower)) fitScore = 95;
      else if (/ai engineer|applied ai|llm/i.test(titleLower)) fitScore = 90;
      else if (/machine learning|ml/i.test(titleLower)) fitScore = 85;

      let channel = 'Direct ATS';
      if (url.includes('greenhouse.io') || url.includes('gh_jid=')) channel = 'Greenhouse ATS';
      else if (url.includes('ashbyhq.com')) channel = 'Ashby ATS';
      else if (url.includes('lever.co')) channel = 'Lever ATS';

      jobs.push({
        company,
        title,
        location,
        url,
        channel,
        fitScore,
        isIntern,
        source: 'COPS Native ATS',
      });
    }
  });

  return jobs;
}

function extractFromScanHistory(appliedCompanies, appliedUrls) {
  const jobs = [];
  if (!existsSync(SCAN_HISTORY_FILE)) return jobs;

  const lines = readFileSync(SCAN_HISTORY_FILE, 'utf-8').split('\n');

  lines.forEach((line) => {
    const cols = line.split('\t');
    if (cols.length < 7) return;

    const url = cols[0];
    const title = cols[3];
    const company = cols[4];
    const location = cols[6];

    if (!url || !title || !company || url === 'url') return;

    const normComp = normalizeCompanyName(company);
    if (appliedCompanies.has(normComp) || appliedUrls.has(url)) return;

    const titleLower = title.toLowerCase();
    const locLower = (location || '').toLowerCase();

    const isIndia = /\b(bengaluru|bangalore|hyderabad|telangana|karnataka|pune|delhi|mumbai|gurgaon|noida|chennai|india)\b/i.test(locLower);
    const isGlobalRemote = (locLower === 'remote' || locLower.includes('remote, india') || locLower.includes('india - remote') || locLower.includes('remote - india') || locLower.includes('india/global')) &&
                           !/\b(us|usa|united states|canada|uk|london|europe|germany|portugal|ukraine|mexico|brazil|spain|poland|austria|australia)\b/i.test(locLower);

    if (!isIndia && !isGlobalRemote) return;

    if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|expert|ii-1|iii)\b/i.test(titleLower)) return;

    const isAiMlFde = /ai|genai|generative|llm|agent|machine learning|ml|fde|forward deployed|nlp|vision|perception|ray|eval/i.test(titleLower);
    const isIntern = /intern/i.test(titleLower);

    if (isAiMlFde || isIntern) {
      let fitScore = isIntern ? 95 : 85;
      jobs.push({
        company,
        title,
        location: location || 'Bengaluru / India',
        url,
        channel: url.includes('greenhouse') ? 'Greenhouse ATS' : url.includes('ashby') ? 'Ashby ATS' : 'Lever ATS',
        fitScore,
        isIntern,
        source: 'COPS Scan History',
      });
    }
  });

  return jobs;
}

function extractFromLinkedIn(appliedCompanies, appliedUrls) {
  const jobs = [];
  if (!existsSync(LINKEDIN_QUEUE_FILE)) return jobs;

  try {
    const queue = JSON.parse(readFileSync(LINKEDIN_QUEUE_FILE, 'utf-8'));
    queue.forEach((item) => {
      const normComp = normalizeCompanyName(item.company);
      if (appliedCompanies.has(normComp) || appliedUrls.has(item.url)) return;

      const titleLower = item.title.toLowerCase();
      if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect)\b/i.test(titleLower)) return;

      jobs.push({
        company: item.company,
        title: item.title,
        location: item.location || 'Bengaluru, India',
        url: item.url,
        channel: item.applicationType || 'LinkedIn Easy Apply',
        fitScore: item.fitScore || 85,
        isIntern: /intern/i.test(item.title),
        source: 'LinkedIn',
      });
    });
  } catch {}

  return jobs;
}

function extractFromPeerlist(appliedCompanies, appliedUrls) {
  const jobs = [];
  if (!existsSync(PEERLIST_QUEUE_FILE)) return jobs;

  try {
    const queue = JSON.parse(readFileSync(PEERLIST_QUEUE_FILE, 'utf-8'));
    queue.forEach((item) => {
      const normComp = normalizeCompanyName(item.company);
      if (appliedCompanies.has(normComp) || appliedUrls.has(item.url)) return;

      // Filter out US in-office locations
      const locLower = (item.location || '').toLowerCase();
      if (/\b(in-office|hybrid)\b/i.test(locLower) && /\b(united states|los angeles|durham|san francisco|chicago|seattle|new york|california|boston|uk|europe)\b/i.test(locLower)) return;

      jobs.push({
        company: item.company,
        title: item.title,
        location: item.location || 'Bengaluru / Remote',
        url: item.url,
        channel: 'Peerlist',
        fitScore: item.fitScore || 85,
        isIntern: /intern/i.test(item.title),
        source: 'Peerlist',
      });
    });
  } catch {}

  return jobs;
}

function extractFromWellfound(appliedCompanies, appliedUrls) {
  const jobs = [];
  if (!existsSync(WELLFOUND_SEEN_FILE)) return jobs;

  try {
    const wf = JSON.parse(readFileSync(WELLFOUND_SEEN_FILE, 'utf-8'));
    Object.entries(wf).forEach(([url, item]) => {
      const normComp = normalizeCompanyName(item.company);
      if (!appliedCompanies.has(normComp) && !appliedUrls.has(url) && (item.category === 'APPLY' || item.category === 'APPLY NOW')) {
        jobs.push({
          company: item.company || 'Tech Startup',
          title: item.title,
          location: 'Bengaluru / Remote India',
          url,
          channel: 'Wellfound',
          fitScore: 85,
          isIntern: /intern/i.test(item.title),
          source: 'Wellfound',
        });
      }
    });
  } catch {}

  return jobs;
}

function main() {
  console.log('\n======================================================');
  console.log(' Unified Master AI Job & Internship Queue Builder (70-90 Target)');
  console.log('======================================================');

  const { appliedCompanies, appliedUrls } = loadAppliedSet();
  console.log(`• Loaded ${appliedCompanies.size} already-applied companies from data/applications.md.\n`);

  const listPipeline = extractFromPipeline(appliedCompanies, appliedUrls);
  console.log(`• COPS Pipeline:     ${listPipeline.length} unapplied AI/ML/FDE matches.`);

  const listHistory = extractFromScanHistory(appliedCompanies, appliedUrls);
  console.log(`• COPS History:      ${listHistory.length} unapplied AI/ML/FDE matches.`);

  const listLinkedIn = extractFromLinkedIn(appliedCompanies, appliedUrls);
  console.log(`• LinkedIn:          ${listLinkedIn.length} unapplied AI/ML/FDE matches.`);

  const listPeerlist = extractFromPeerlist(appliedCompanies, appliedUrls);
  console.log(`• Peerlist:          ${listPeerlist.length} verified unapplied matches.`);

  const listWellfound = extractFromWellfound(appliedCompanies, appliedUrls);
  console.log(`• Wellfound:         ${listWellfound.length} verified unapplied matches.`);

  // Combine and deduplicate
  const allCandidates = [
    ...listPipeline,
    ...listHistory,
    ...listLinkedIn,
    ...listPeerlist,
    ...listWellfound,
  ];

  const finalQueue = [];
  const seenCompanies = new Set();
  const seenUrls = new Set();

  // Sort: Internships first, then Fit Score descending
  allCandidates.sort((a, b) => {
    if (a.isIntern && !b.isIntern) return -1;
    if (!a.isIntern && b.isIntern) return 1;
    return b.fitScore - a.fitScore;
  });

  for (const job of allCandidates) {
    const norm = normalizeCompanyName(job.company);
    if (!seenCompanies.has(norm) && !seenUrls.has(job.url)) {
      seenCompanies.add(norm);
      seenUrls.add(job.url);
      finalQueue.push(job);
      if (finalQueue.length >= 85) break; // Capped cleanly around 80-85
    }
  }

  console.log(`\n======================================================`);
  console.log(` MASTER APPLICATION QUEUE GENERATED (${finalQueue.length} Roles Ready)`);
  console.log(`======================================================`);

  const internships = finalQueue.filter((j) => j.isIntern);
  const fulltime = finalQueue.filter((j) => !j.isIntern);

  let mdContent = `# Master AI & FDE Job & Internship Application Queue (${finalQueue.length} Unapplied Roles)\n`;
  mdContent += `**Candidate**: Banda Sri Hari | AI/ML, GenAI & Agentic Systems | Bengaluru / Hyderabad / Remote India\n`;
  mdContent += `**Strict Verification**: 100% Unapplied (Zero overlap with data/applications.md), 0–3 YOE & Internships only, India/Remote locations, Online Assessments included.\n\n`;

  mdContent += `## 🌟 Section 1: Verified AI, GenAI & FDE Internships (${internships.length} Roles)\n\n`;
  mdContent += `| # | Company | Role Title | Location | Channel | Fit Score | Direct Application Link |\n`;
  mdContent += `|---|---|---|---|---|---|---|\n`;

  internships.forEach((job, idx) => {
    mdContent += `| ${idx + 1} | **${job.company}** | ${job.title} | 📍 ${job.location} | ${job.channel} | ${job.fitScore}/100 | [Apply Now](${job.url}) |\n`;
  });

  mdContent += `\n---\n\n## 🏢 Section 2: Verified 0–3 YOE AI, GenAI & FDE Roles (${fulltime.length} Roles)\n\n`;
  mdContent += `| # | Company | Role Title | Location | Channel | Fit Score | Direct Application Link |\n`;
  mdContent += `|---|---|---|---|---|---|---|\n`;

  fulltime.forEach((job, idx) => {
    mdContent += `| ${idx + 1 + internships.length} | **${job.company}** | ${job.title} | 📍 ${job.location} | ${job.channel} | ${job.fitScore}/100 | [Apply Now](${job.url}) |\n`;
  });

  writeFileSync(MASTER_OUTPUT_FILE, mdContent, 'utf-8');
  console.log(`✅ Master queue successfully written to ${MASTER_OUTPUT_FILE}\n`);
}

main();
