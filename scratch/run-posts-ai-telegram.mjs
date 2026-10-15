import fs from 'fs';
import { resolve } from 'path';
import { crossCheckPostsWithAI } from '../scripts/ai-crosscheck.mjs';
import { sendFounderPostsToTelegram } from '../scripts/telegram-notifier.mjs';

const POSTS_FILE = resolve('data/linkedin-posts.json');

async function main() {
  console.log('Loading existing 48 posts from data/linkedin-posts.json...');
  const posts = JSON.parse(fs.readFileSync(POSTS_FILE, 'utf-8'));

  console.log(`Auditing ${posts.length} posts with Gemini 2.5 Flash...`);
  const verified = await crossCheckPostsWithAI(posts);

  console.log(`\nResults: ${verified.length} posts passed strict AI verification.`);
  fs.writeFileSync(POSTS_FILE, JSON.stringify(verified, null, 2), 'utf-8');

  if (verified.length > 0) {
    console.log(`Dispatching ${verified.length} verified posts to Telegram...`);
    await sendFounderPostsToTelegram(verified, '📢 AI-Verified Founder & Hiring Announcements');
    console.log('✅ Telegram dispatch completed successfully!');
  }
}

main().catch(console.error);
