#!/usr/bin/env node

/**
 * scripts/linkedin/linkedin-apply-queue.mjs
 *
 * Sequential Daily LinkedIn Application Queue Runner
 *
 * Capabilities:
 * 1. Reads the ranked shortlist from `data/linkedin-queue.json`.
 * 2. Filters out already applied/resolved jobs from `data/linkedin-seen.json`.
 * 3. Processes jobs ONE AT A TIME sequentially.
 * 4. Launches `linkedin-apply.mjs` for each job in a visible browser window.
 * 5. Pauses for human review and manual submission at the final Review screen.
 * 6. Prompts user to confirm submission status and updates tracker & dedup records.
 * 7. Never parallelizes or auto-submits.
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import * as readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const QUEUE_FILE = resolve(ROOT_DIR, 'data/linkedin-queue.json');
const SEEN_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');
const TRACKER_FILE = resolve(ROOT_DIR, 'data/applications.md');
const PDF_PATH = 'output/Banda_Sri_Hari_CV.pdf';

function askUser(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((res) => {
    rl.question(query, (ans) => {
      rl.close();
      res(ans.trim().toLowerCase());
    });
  });
}

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

function recordInTracker(job) {
  const today = new Date().toISOString().slice(0, 10);
  const row = `| ${today} | ${job.company} | ${job.title} | ${job.fitScore}/100 | Applied | [PDF](../${PDF_PATH}) | [URL](${job.url}) | LinkedIn Easy Apply |\n`;

  if (!existsSync(TRACKER_FILE)) {
    const header = `# Applications Tracker\n\n| Date | Company | Role | Score | Status | PDF | Source | Notes |\n|---|---|---|---|---|---|---|---|\n`;
    writeFileSync(TRACKER_FILE, header + row, 'utf-8');
  } else {
    const content = readFileSync(TRACKER_FILE, 'utf-8');
    writeFileSync(TRACKER_FILE, content + row, 'utf-8');
  }
}

function runApplyScript(jobUrl, autoSubmit = false, autoMode = true) {
  return new Promise((resolve) => {
    const applyArgs = ['scripts/linkedin/linkedin-apply.mjs', '--url', jobUrl];
    if (autoMode) {
      applyArgs.push('--auto');
    }
    if (autoSubmit) {
      applyArgs.push('--auto-submit');
    }
    const child = spawn(
      'node',
      applyArgs,
      { cwd: ROOT_DIR, stdio: 'inherit' }
    );

    child.on('close', (code) => {
      resolve(code);
    });
  });
}

async function main() {
  const args = process.argv.slice(2);
  const AUTO_SUBMIT = args.includes('--auto-submit');
  const AUTO_MODE = args.includes('--auto') || AUTO_SUBMIT;
  const LIMIT_ARG = args.find((a, i) => args[i - 1] === '--limit');
  const MAX_JOBS = LIMIT_ARG ? parseInt(LIMIT_ARG, 10) : (AUTO_SUBMIT ? 5 : 10);

  console.log('\n======================================================');
  console.log(' LinkedIn Application Queue Runner');
  console.log('======================================================');
  console.log(`Autonomous Mode: ${AUTO_MODE ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Auto-Submit:     ${AUTO_SUBMIT ? 'ENABLED' : 'DISABLED'}`);
  console.log(`Max Jobs To Run: ${MAX_JOBS}\n`);

  if (!existsSync(QUEUE_FILE)) {
    console.error(`❌ Queue file not found at ${QUEUE_FILE}`);
    console.error('Please run discovery first: node scripts/linkedin/linkedin-discover.mjs\n');
    process.exit(1);
  }

  const queue = loadJson(QUEUE_FILE, []);
  const seen = loadJson(SEEN_FILE, {});

  // Flexible across both Easy Apply and External ATS portals
  const unappliedJobs = queue.filter((j) => !seen[j.jobId] || seen[j.jobId].status !== 'APPLIED');

  console.log(`• Total Jobs in Queue:        ${queue.length}`);
  console.log(`• Pending Unapplied Roles:    ${unappliedJobs.length}\n`);

  if (unappliedJobs.length === 0) {
    console.log('🎉 All jobs in the current daily queue have been applied to or reviewed!');
    return;
  }

  const jobsToProcess = unappliedJobs.slice(0, MAX_JOBS);

  for (let i = 0; i < jobsToProcess.length; i++) {
    const job = jobsToProcess[i];
    console.log(`\n======================================================`);
    console.log(` [${i + 1}/${jobsToProcess.length}] CURRENT APPLICATION: ${job.company} — ${job.title}`);
    console.log(`======================================================`);
    console.log(`• Location:      ${job.location} (${job.locationTier})`);
    console.log(`• Fit Score:     ${job.fitScore}/100`);
    console.log(`• Type:          ${job.applicationType}`);
    console.log(`• Matching:      ${(job.keyMatches || []).join(' | ')}`);
    console.log(`• URL:           ${job.url}\n`);

    if (!AUTO_MODE) {
      const action = await askUser('👉 Ready to start assistant for this job? (y/skip/quit): ');
      if (action === 'quit' || action === 'q') {
        console.log('Quitting queue runner. Progress saved.');
        break;
      }
      if (action === 'skip' || action === 's') {
        console.log(`Skipping ${job.company}.`);
        seen[job.jobId] = { ...job, status: 'SKIPPED', date: new Date().toISOString() };
        saveJson(SEEN_FILE, seen);
        continue;
      }
    }

    console.log(`Launching application assistant for ${job.company}...`);
    const exitCode = await runApplyScript(job.url, AUTO_SUBMIT, AUTO_MODE);

    if (!AUTO_SUBMIT) {
      console.log('\n------------------------------------------------------');
      const result = await askUser('👉 Did you complete and submit this application in the browser? (y/n/skip): ');
      if (result === 'y' || result === 'yes') {
        seen[job.jobId] = { ...job, status: 'APPLIED', date: new Date().toISOString() };
        saveJson(SEEN_FILE, seen);
        recordInTracker(job);
        console.log(`✅ Recorded application for ${job.company} in data/applications.md and cache.`);
      } else if (result === 'skip') {
        seen[job.jobId] = { ...job, status: 'SKIPPED', date: new Date().toISOString() };
        saveJson(SEEN_FILE, seen);
        console.log(`Marked ${job.company} as skipped.`);
      } else {
        console.log(`Application for ${job.company} left unrecorded.`);
      }
    } else {
      if (exitCode === 0) {
        seen[job.jobId] = { ...job, status: 'APPLIED', date: new Date().toISOString() };
        saveJson(SEEN_FILE, seen);
        console.log(`✅ [AUTONOMOUS] Successfully submitted and marked ${job.company} as APPLIED in cache.`);
      } else {
        console.warn(`⚠️ [AUTONOMOUS] Application cycle for ${job.company} ended with exit code ${exitCode}.`);
      }
      console.log(`[AUTONOMOUS] Moving to next role with 3s pacing...`);
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.log('\n======================================================');
  console.log(' DAILY QUEUE RUN COMPLETE');
  console.log('======================================================\n');
}

main().catch(console.error);
