import fs from 'fs';
import { sendTelegramMessage } from '../scripts/telegram-notifier.mjs';

function cleanUtf8(str = '') {
  return str
    .toWellFormed()
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

async function run() {
  const rawPosts = JSON.parse(fs.readFileSync('data/linkedin-posts.json', 'utf-8'));
  console.log(`Loaded ${rawPosts.length} posts for auditing...`);

  // Review & Audit Filter
  const audited = [];
  for (const p of rawPosts) {
    const text = (p.fullText || p.snippet || '').toLowerCase();
    
    // 1. Skip non-engineering / sales / scam
    if (/sales intern|business development|telecaller|bpo|unpaid|marketing intern/i.test(text)) {
      continue;
    }
    // 2. Skip strictly foreign locked
    if (/residents? of (sweden|norway|denmark|uk|london|germany|qatar)|must be located in (sweden|london|germany|qatar)/i.test(text) && !/india|remote/i.test(text)) {
      continue;
    }
    // 3. Skip senior 3+ YOE requirements
    if (/\b(3\+|4\+|5\+|6\+|7\+|8\+|10\+)\s*(years|yrs|yoe)\b/i.test(text)) {
      continue;
    }

    audited.push(p);
  }

  console.log(`Audited: ${audited.length} / ${rawPosts.length} passed strict verification.`);

  // Build Telegram chunks safely
  let header = `🚀 <b>Verified LinkedIn AI Hiring Posts (Past 24H - Fresh)</b>\n`;
  header += `📅 <i>${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short', month: 'short', day: 'numeric' })}</i> | <b>${audited.length} Audited Roles</b>\n`;
  header += `──────────────\n\n`;

  let currentMsg = header;
  const chunks = [];

  for (let i = 0; i < audited.length; i++) {
    const p = audited[i];
    const author = cleanUtf8(p.author || 'Hiring Leader');
    const age = cleanUtf8(p.postedAge || 'Recent');
    const headline = cleanUtf8(p.headline || '').slice(0, 100);
    const snippet = cleanUtf8((p.snippet || '').replace(/\s+/g, ' ')).slice(0, 280);

    let entry = `<b>#${i + 1}</b> · <b>${author}</b> (⏱️ ${age})\n`;
    if (headline && !headline.startsWith('•')) {
      entry += `💼 <i>${headline}</i>\n`;
    }
    entry += `📝 <i>"${snippet}..."</i>\n`;

    const links = [];
    if (p.postUrl) links.push(`<a href="${p.postUrl}">View Post</a>`);
    if (p.externalLinks && p.externalLinks.length > 0) {
      const valid = p.externalLinks.find(l => !l.includes('linkedin.com') && !l.startsWith('mailto:'));
      if (valid) links.push(`<a href="${valid}">Apply Link</a>`);
    }
    if (p.authorUrl) links.push(`<a href="${p.authorUrl}">DM Author</a>`);

    if (links.length > 0) {
      entry += `👉 ${links.join(' | ')}\n`;
    }
    if (p.emails && p.emails.length > 0) {
      entry += `📩 <code>${cleanUtf8(p.emails[0])}</code>\n`;
    }
    entry += `\n`;

    if ((currentMsg + entry).length > 3800) {
      chunks.push(currentMsg);
      currentMsg = entry;
    } else {
      currentMsg += entry;
    }
  }

  if (currentMsg.trim().length > 0) {
    chunks.push(currentMsg);
  }

  console.log(`Sending ${chunks.length} message chunk(s) to Telegram...`);
  for (let c = 0; c < chunks.length; c++) {
    await sendTelegramMessage(chunks[c]);
    console.log(`Sent chunk ${c + 1}/${chunks.length}`);
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('✅ All audited posts delivered to Telegram successfully!');
}

run().catch(err => {
  console.error('Audit & Send Error:', err);
  process.exit(1);
});
