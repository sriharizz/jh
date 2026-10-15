#!/usr/bin/env node

/**
 * cops-master-scan.mjs — Unified Master Career-Ops Scanner
 * 
 * Runs a complete sweep across:
 * 1. Specialized AI & Startup Boards (Agentic Jobs, Himalayas, EchoJobs)
 * 2. 50+ Top Tracked GCCs & AI Labs (Anthropic, Together AI, Glean, Anyscale, Supabase, Stripe, CRED, PhonePe)
 * 3. Global Reverse-ATS Discovery (Greenhouse, Ashby, Lever public directories)
 * 
 * Enforces:
 * - 0-3 YOE & Internship filter
 * - Rejects 4+ to 10+ YOE roles
 * - Deduplication against data/applications.md and data/scan-history.tsv
 * - Targets: Bengaluru (Tier 1), Hyderabad (Tier 2), Remote India (Tier 3)
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import path from 'path';

console.log('\n======================================================');
console.log('  CAREER-OPS MASTER MULTI-PLATFORM SCANNER');
console.log('======================================================');
console.log('Target Profile: 0–3 YOE / Entry-Level / AI Internships');
console.log('Location Hubs:  Bengaluru (T1), Hyderabad (T2), Remote India (T3)');
console.log('Platforms:      Agentic Jobs | Himalayas | EchoJobs | GCCs | 50+ AI Labs | Global ATS\n');

// ── Step 1: Run Direct Portal & Specialized Board Scanner ──────────────
console.log('══════════════════════════════════════════════════════');
console.log(' [1/2] Scanning Tracked GCCs, AI Labs & Specialized Boards...');
console.log('══════════════════════════════════════════════════════');

try {
  execSync('node scan.mjs', { stdio: 'inherit' });
} catch (err) {
  console.warn(`⚠️ Portal scan completed with non-fatal notice.`);
}

// ── Step 2: Run Global Reverse-ATS Discovery Sweep ───────────────────
console.log('\n══════════════════════════════════════════════════════');
console.log(' [2/2] Sweeping Global Reverse-ATS Directories (Greenhouse / Ashby / Lever)...');
console.log('══════════════════════════════════════════════════════');

try {
  execSync('node scan-ats-full.mjs --ats greenhouse,ashby,lever --limit 100 --since 7', { stdio: 'inherit' });
} catch (err) {
  console.warn(`⚠️ Reverse ATS scan completed with non-fatal notice.`);
}

// ── Step 3: Summarize Pending Opportunities in Pipeline ──────────────
console.log('\n======================================================');
console.log(' MASTER SCAN COMPLETE — PENDING DISCOVERIES');
console.log('======================================================');

const PIPELINE_FILE = 'data/pipeline.md';
if (existsSync(PIPELINE_FILE)) {
  const content = readFileSync(PIPELINE_FILE, 'utf-8');
  const pendingLines = content
    .split('\n')
    .filter((line) => line.startsWith('- [ ] '))
    .slice(0, 15);

  if (pendingLines.length > 0) {
    console.log(`Found ${pendingLines.length} fresh matching opportunities ready in data/pipeline.md:\n`);
    pendingLines.forEach((line, idx) => {
      const parts = line.replace('- [ ] ', '').split(' | ');
      const url = parts[0] || '';
      const comp = parts[1] || 'Company';
      const title = parts[2] || 'Role';
      const loc = parts[3] || 'Location';
      console.log(`[#${idx + 1}] ${comp} — ${title}`);
      console.log(`    📍 ${loc}`);
      console.log(`    🔗 ${url}\n`);
    });
  } else {
    console.log('Pipeline is clear. No new unapplied offers at this moment.');
  }
}

console.log('Next Actions:');
console.log('• To evaluate any offer and generate a tailored CV: node gemini-eval.mjs <URL>');
console.log('• Review pending list in: data/pipeline.md\n');
