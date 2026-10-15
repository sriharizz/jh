#!/usr/bin/env node

/**
 * scripts/telegram-notifier.mjs
 *
 * Telegram Job Alert & Notification Dispatcher for Sri Hari (@Ichizbot)
 */

import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const CONFIG_FILE = resolve(ROOT_DIR, 'data/telegram.json');

export function loadTelegramConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    throw new Error(`Telegram configuration file not found at: ${CONFIG_FILE}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
}

/**
 * Send raw HTML message to Telegram
 */
export async function sendTelegramMessage(text, parseMode = 'HTML') {
  const config = loadTelegramConfig();
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;

  const payload = {
    chat_id: config.chatId,
    text,
    parse_mode: parseMode,
    disable_web_page_preview: true,
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API Error: ${data.description || 'Unknown error'}`);
  }
  return data;
}

/**
 * Escape HTML special characters for Telegram HTML mode
 */
function escapeHtml(str = '') {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Send formatted batch of job roles to Telegram
 * @param {Array} jobs - List of evaluated job objects
 * @param {string} title - Header title for the notification
 */
export async function sendJobBatchToTelegram(jobs = [], title = '🎯 Daily AI Job Matches') {
  if (!jobs || jobs.length === 0) {
    await sendTelegramMessage(`ℹ️ <b>${escapeHtml(title)}</b>\n\nNo new unapplied roles found in this sweep.`);
    return;
  }

  // Header
  let header = `🚀 <b>${escapeHtml(title)}</b>\n`;
  header += `📅 <i>${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })}</i> | <b>${jobs.length} Roles Curated</b>\n`;
  header += `──────────────\n\n`;

  const chunks = [];
  let currentMsg = header;

  for (let i = 0; i < jobs.length; i++) {
    const job = jobs[i];
    const isEasyApply = job.applicationType === 'Easy Apply' || job.isEasyApply || job.easyApply;
    const badge = isEasyApply ? '🟢 <b>Easy Apply</b>' : '🔵 <b>Direct ATS</b>';
    const locTier = job.locationTier || job.location || 'India';
    const cleanComp = escapeHtml(job.company || 'Direct Employer');
    const cleanTitle = escapeHtml(job.title || 'AI Engineer');
    const compText = job.compensation ? ` · 💵 ${escapeHtml(job.compensation)}` : '';
    const ageText = job.ageText || job.posted || 'Recent';

    let jobEntry = `<b>#${i + 1}</b> · <a href="${job.url}"><b>${cleanTitle}</b></a>\n`;
    jobEntry += `🏢 <b>${cleanComp}</b> | 📍 ${escapeHtml(locTier)}${compText}\n`;
    jobEntry += `${badge} · ⏱️ ${escapeHtml(ageText)}\n`;

    if (job.keyMatches && job.keyMatches.length > 0) {
      const topMatches = job.keyMatches.slice(0, 2).map(escapeHtml).join(' | ');
      jobEntry += `✨ <i>${topMatches}</i>\n`;
    }

    jobEntry += `👉 <a href="${job.url}">Tap to Apply</a>\n\n`;

    // Check 4000 char threshold
    if ((currentMsg + jobEntry).length > 3800) {
      chunks.push(currentMsg);
      currentMsg = jobEntry;
    } else {
      currentMsg += jobEntry;
    }
  }

  if (currentMsg.trim().length > 0) {
    chunks.push(currentMsg);
  }

  for (const chunk of chunks) {
    await sendTelegramMessage(chunk);
    // Small delay between chunks to avoid flood limits
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`✅ Sent ${jobs.length} job alerts to Telegram across ${chunks.length} message(s).`);
}

/**
 * Send formatted batch of founder & recruiter hiring posts to Telegram
 * @param {Array} posts - List of scraped founder post objects
 * @param {string} title - Header title for the notification
 */
export async function sendFounderPostsToTelegram(posts = [], title = '📢 Founder & Recruiter AI Hiring Announcements') {
  if (!posts || posts.length === 0) return;

  let header = `🚀 <b>${escapeHtml(title)}</b>\n`;
  header += `📅 <i>${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })}</i> | <b>${posts.length} Fresh Announcements</b>\n`;
  header += `──────────────\n\n`;

  const chunks = [];
  let currentMsg = header;

  for (let i = 0; i < posts.length; i++) {
    const post = posts[i];
    const authorName = escapeHtml(post.author || 'Hiring Leader');
    const headline = escapeHtml(post.headline || '');
    const age = escapeHtml(post.postedAge || 'Recent');
    const snippet = escapeHtml(post.snippet || '').replace(/\s+/g, ' ');

    let postEntry = `<b>#${i + 1}</b> · <b>${authorName}</b>\n`;
    if (headline && headline !== '• 3rd+' && headline !== '• 2nd') {
      postEntry += `💼 <i>${headline}</i>\n`;
    }
    postEntry += `⏱️ <b>${age}</b> · ⚡ <i>Direct Hiring Post</i>\n`;
    postEntry += `📝 <i>"${snippet}..."</i>\n`;

    const actionLinks = [];
    if (post.postUrl) {
      actionLinks.push(`<a href="${post.postUrl}">View Post</a>`);
    }
    if (post.externalLinks && post.externalLinks.length > 0) {
      const validLink = post.externalLinks.find(l => !l.includes('linkedin.com') && !l.startsWith('mailto:'));
      if (validLink) {
        actionLinks.push(`<a href="${validLink}">Apply Link</a>`);
      }
    }
    if (post.authorUrl) {
      actionLinks.push(`<a href="${post.authorUrl}">DM Author</a>`);
    }

    if (actionLinks.length > 0) {
      postEntry += `👉 ${actionLinks.join(' | ')}\n`;
    }

    if (post.emails && post.emails.length > 0) {
      postEntry += `📩 <code>${escapeHtml(post.emails[0])}</code>\n`;
    }

    postEntry += `\n`;

    if ((currentMsg + postEntry).length > 3800) {
      chunks.push(currentMsg);
      currentMsg = postEntry;
    } else {
      currentMsg += postEntry;
    }
  }

  if (currentMsg.trim().length > 0) {
    chunks.push(currentMsg);
  }

  for (const chunk of chunks) {
    await sendTelegramMessage(chunk);
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log(`✅ Sent ${posts.length} founder hiring posts to Telegram.`);
}

// ── Standalone CLI test ──
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  (async () => {
    try {
      console.log('Sending test message to Telegram...');
      await sendTelegramMessage(
        `⚡ <b>Career-Ops Job Agent Connected!</b>\n\n` +
        `Hey Sri Hari! Your bot <b>@Ichizbot</b> is now linked and active.\n\n` +
        `• <b>Morning Pulse</b> (~10:30 AM IST): Quick Easy Apply early alerts.\n` +
        `• <b>Night Full Sweep</b> (~9:45 PM IST): Curated Top 20 batch for your nightly applications.\n\n` +
        `<i>Bengaluru (Tier 1) · Hyderabad (Tier 2) · Remote India (Tier 3)</i>`
      );
      console.log('✅ Test message sent successfully!');
    } catch (e) {
      console.error('❌ Failed to send Telegram message:', e.message);
    }
  })();
}
