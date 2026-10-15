#!/usr/bin/env node

/**
 * scripts/dispatch-curated-to-telegram.mjs
 *
 * Dispatches an AI IDE-curated batch of verified opportunities to Telegram @Ichizbot
 * and marks them permanently as APPLIED in data/linkedin-seen.json.
 */

import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { sendJobBatchToTelegram, sendFounderPostsToTelegram } from './telegram-notifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const CURATED_FILE = resolve(ROOT_DIR, 'data/curated-dispatch.json');
const SEEN_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');

async function main() {
  if (!fs.existsSync(CURATED_FILE)) {
    console.error(`Error: Curated dispatch file not found at ${CURATED_FILE}`);
    process.exit(1);
  }

  const items = JSON.parse(fs.readFileSync(CURATED_FILE, 'utf-8'));
  if (!Array.isArray(items) || items.length === 0) {
    console.log('No curated items to dispatch.');
    return;
  }

  console.log(`\nDispatching ${items.length} curated opportunities to Telegram @Ichizbot...`);

  // Separate founder posts vs official jobs
  const founderPosts = items.filter(i => i.type === 'FOUNDER_POST' || i.postUrl);
  const officialJobs = items.filter(i => i.type !== 'FOUNDER_POST' && !i.postUrl);

  if (officialJobs.length > 0) {
    await sendJobBatchToTelegram(
      officialJobs,
      `🎯 Verified AI Opportunities (Curated by AI IDE)`
    );
  }

  if (founderPosts.length > 0) {
    await sendFounderPostsToTelegram(
      founderPosts,
      `🚀 Verified Founder & Recruiter Announcements (Curated by AI IDE)`
    );
  }

  // Record in seenCache
  let seenCache = {};
  if (fs.existsSync(SEEN_FILE)) {
    try { seenCache = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8')); } catch {}
  }

  const today = new Date().toISOString().split('T')[0];
  for (const item of items) {
    const entry = {
      jobId: item.jobId || '',
      title: item.title || item.author || '',
      company: item.company || item.headline || '',
      status: 'DISPATCHED',
      date: today,
      dispatched: true,
      curatedBy: 'AI_IDE',
    };
    if (item.jobId) seenCache[item.jobId] = entry;
    const targetUrl = item.url || item.postUrl;
    if (targetUrl) {
      const cleanUrl = targetUrl.split('?')[0].replace(/\/+$/, '');
      seenCache[cleanUrl] = entry;
      seenCache[cleanUrl + '/'] = entry;
    }
  }

  fs.writeFileSync(SEEN_FILE, JSON.stringify(seenCache, null, 2), 'utf-8');
  console.log(`🔒 Permanently recorded ${items.length} curated items as APPLIED in data/linkedin-seen.json.`);
  console.log(`✅ Dispatch complete!\n`);
}

main().catch(console.error);
