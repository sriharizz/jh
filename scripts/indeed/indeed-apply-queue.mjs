#!/usr/bin/env node

/**
 * scripts/indeed/indeed-apply-queue.mjs
 *
 * Daily Indeed Queue Runner & Batch Orchestrator
 *
 * Features:
 * 1. Reads ranked jobs from data/indeed-queue.json
 * 2. Checks against data/applications.md to prevent duplicate applications
 * 3. Sequentially executes `indeed-apply.mjs` for each pending role
 * 4. Logs submitted applications to data/applications.md
 * 5. Provides end-of-batch summary report
 */

import { existsSync, readFileSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import readline from 'readline';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const QUEUE_FILE = resolve(ROOT_DIR, 'data/indeed-queue.json');
const APPLICATIONS_FILE = resolve(ROOT_DIR, 'data/applications.md');

const args = process.argv.slice(2);
const getArg = (flag, fallback = null) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};

const LIMIT = parseInt(getArg('--limit', '20'), 10);
const DEBUG = args.includes('--debug');

function askUser(query) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => {
    rl.question(query, (ans) => {
      rl.close();
      res(ans.trim());
    });
  });
}

function loadAppliedUrls() {
  const applied = new Set();
  if (existsSync(APPLICATIONS_FILE)) {
    const content = readFileSync(APPLICATIONS_FILE, 'utf-8');
    const matches = content.match(/https:\/\/in\.indeed\.com\/[^\s|)]+/g) || [];
    for (const m of matches) {
      applied.add(m.split('?')[0].split('&')[0]);
    }
  }
  return applied;
}

function logApplicationOutcome(job, submitted = true) {
  if (!existsSync(APPLICATIONS_FILE)) return;
  const dateStr = new Date().toISOString().split('T')[0];
  const cleanComp = (job.company || 'Employer').replace(/\|/g, '-').trim();
  const cleanRole = (job.title || 'Role').replace(/\|/g, '-').trim();
  const status = submitted ? 'Applied (Indeed)' : 'Skipped';
  const notes = `Fit: ${job.fitScore}/100 | ${job.keyMatches?.slice(0, 2).join(', ') || ''} | URL: ${job.url}`;

  const row = `| - | ${dateStr} | ${cleanComp} | ${cleanRole} | ${job.fitScore} | ${status} | Banda_Sri_Hari_CV.pdf | - | ${notes} |\n`;
  try {
    appendFileSync(APPLICATIONS_FILE, row, 'utf-8');
    console.log(`  📝 Logged application to data/applications.md`);
  } catch (err) {
    console.warn(`  ⚠️ Could not append to applications.md: ${err.message}`);
  }
}

async function runJobAssistant(job) {
  return new Promise((resolvePromise) => {
    const scriptPath = resolve(__dirname, 'indeed-apply.mjs');
    const childArgs = [scriptPath, '--url', job.url];
    if (DEBUG) childArgs.push('--debug');

    console.log(`\nLaunching application assistant for ${job.company}...`);
    const proc = spawn(process.execPath, childArgs, {
      stdio: 'inherit',
      cwd: ROOT_DIR,
    });

    proc.on('close', (code) => {
      resolvePromise(code === 0);
    });
  });
}

// ── Main Queue Runner ───────────────────────────────────────────────────────

async function main() {
  console.log('======================================================');
  console.log(' Indeed Application Queue Runner');
  console.log('======================================================');

  if (!existsSync(QUEUE_FILE)) {
    console.log('No data/indeed-queue.json found. Run discovery first:');
    console.log('  node scripts/indeed/indeed-discover.mjs\n');
    process.exit(0);
  }

  let queue = [];
  try {
    queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
  } catch {
    console.error('❌ Could not parse data/indeed-queue.json');
    process.exit(1);
  }

  const appliedUrls = loadAppliedUrls();
  const pendingJobs = queue.filter((j) => !appliedUrls.has(j.url.split('?')[0].split('&')[0]));

  console.log(`• Total Jobs in Queue:        ${queue.length}`);
  console.log(`• Pending Unapplied Roles:    ${pendingJobs.length}`);
  console.log(`• Target Batch Limit:         ${LIMIT}\n`);

  if (pendingJobs.length === 0) {
    console.log('✅ All jobs in the current Indeed queue have already been processed!');
    console.log('To find new jobs, run: node scripts/indeed/indeed-discover.mjs\n');
    process.exit(0);
  }

  const batch = pendingJobs.slice(0, LIMIT);
  let preparedCount = 0;
  let submittedCount = 0;
  let skippedCount = 0;

  for (let i = 0; i < batch.length; i++) {
    const job = batch[i];

    console.log(`\n======================================================`);
    console.log(` [${i + 1}/${batch.length}] CURRENT APPLICATION: ${job.company} — ${job.title}`);
    console.log(`======================================================`);
    console.log(`• Location:      ${job.location}`);
    console.log(`• Fit Score:     ${job.fitScore}/100`);
    console.log(`• Type:          ${job.applicationType}`);
    console.log(`• Key Matches:   ${job.keyMatches?.join(' | ')}`);
    console.log(`• URL:           ${job.url}`);

    await runJobAssistant(job);
    preparedCount++;

    console.log('\n------------------------------------------------------');
    const outcome = await askUser('👉 Did you complete and submit this application in the browser? (y/n/skip): ');

    if (outcome.toLowerCase() === 'y' || outcome.toLowerCase() === 'yes') {
      submittedCount++;
      logApplicationOutcome(job, true);
    } else {
      skippedCount++;
      console.log(`Application for ${job.company} left unrecorded or marked skipped.`);
    }

    if (i < batch.length - 1) {
      const cont = await askUser('\n👉 Advance to next application in queue? (press Enter to continue, "q" to quit): ');
      if (cont.toLowerCase() === 'q' || cont.toLowerCase() === 'quit') {
        console.log('\nStopping queue early per your request.');
        break;
      }
    }
  }

  console.log('\n======================================================');
  console.log(' INDEED DAILY QUEUE RUN COMPLETE');
  console.log('======================================================');
  console.log(`• Applications Prepared: ${preparedCount}`);
  console.log(`• Submitted by You:      ${submittedCount}`);
  console.log(`• Skipped / Pending:     ${skippedCount}`);
  console.log('======================================================\n');
}

main().catch((err) => {
  console.error('Fatal Queue Error:', err);
  process.exit(1);
});
