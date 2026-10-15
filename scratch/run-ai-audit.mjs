import { crossCheckJobsWithAI } from '../scripts/ai-crosscheck.mjs';
import fs from 'fs';
import { sendJobBatchToTelegram } from '../scripts/telegram-notifier.mjs';

async function main() {
  const raw = JSON.parse(fs.readFileSync('data/wellfound-raw.json', 'utf-8'));
  console.log(`Loaded ${raw.length} raw jobs from data/wellfound-raw.json`);

  const approved = await crossCheckJobsWithAI(raw);
  console.log(`\n✨ AI Audit completed! Approved ${approved.length} out of ${raw.length} candidates:\n`);

  approved.forEach((j, idx) => {
    console.log(`[#${idx + 1}] ${j.company} — ${j.title} [${j.location}]`);
    console.log(`     URL: ${j.url}`);
    console.log(`     Reason: ${j.aiReason || 'Early career match'}\n`);
  });

  fs.writeFileSync('data/wellfound-matches.json', JSON.stringify(approved, null, 2), 'utf-8');

  if (approved.length > 0) {
    console.log(`📲 Dispatching ${approved.length} AI-verified roles to Telegram...`);
    await sendJobBatchToTelegram(approved, '🎯 Curated Early-Career AI & FDE Roles (AI-Audited)');
  }
}

main().catch(console.error);
