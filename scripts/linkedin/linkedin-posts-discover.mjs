#!/usr/bin/env node

/**
 * scripts/linkedin/linkedin-posts-discover.mjs
 *
 * Discovers fresh Founder, Recruiter & Hiring Manager posts on LinkedIn
 * targeting AI Internships, GenAI Engineers, FDE, and early-career AI roles.
 *
 * Scrapes https://www.linkedin.com/search/results/content/ with sortBy=["date_posted"]
 * Extracts: Author, Headline, Direct Post Link, External Apply Link, Email, and Post Body.
 */

import { createLinkedInContext } from './linkedin-session.mjs';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { crossCheckPostsWithAI } from '../ai-crosscheck.mjs';
import { sendFounderPostsToTelegram } from '../telegram-notifier.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '../..');

const POSTS_OUTPUT_FILE = resolve(ROOT_DIR, 'data/linkedin-posts.json');
const SEEN_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');

const args = process.argv.slice(2);
const HEADLESS = !args.includes('--no-headless');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 50;
const ENABLE_TELEGRAM = args.includes('--telegram');
const ENABLE_AI_API = args.includes('--ai');
const CUSTOM_SCROLLS = args.includes('--scrolls') ? parseInt(args[args.indexOf('--scrolls') + 1], 10) : null;
const SEARCH_MODE_FILTER = args.includes('--mode') ? args[args.indexOf('--mode') + 1].toLowerCase() : 'all';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const randomJitter = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// Natural query lanes matching actual founder & engineering lead hiring announcements
// Top priority lanes (AI Intern & FDE combinations without restrictive quotes) run first
const POST_LANES = [
  { name: 'AI Intern Core', query: 'ai intern hiring', priority: true },
  { name: 'AI Hiring Direct', query: 'ai hiring', priority: true },
  { name: 'AI Intern Remote', query: 'ai intern remote', priority: true },
  { name: 'FDE Intern & Early', query: 'fde intern hiring', priority: true },
  { name: 'FDE Hiring & Founder', query: 'forward deployed engineer hiring', priority: true },
  { name: 'FDE Remote', query: 'forward deployed intern remote', priority: true },
  { name: 'Agentic AI & LangGraph', query: 'agentic ai hiring intern', priority: true },
  { name: 'LangGraph Engineer', query: 'langgraph hiring developer', priority: true },
  { name: 'GenAI Engineer Bangalore', query: 'genai engineer hiring bangalore' },
  { name: 'AI Engineer Hyderabad / Remote', query: 'ai engineer hiring hyderabad remote' },
  { name: 'Direct Resume DM AI', query: 'dm me your resume ai intern' },
  { name: 'Fresher AI Engineer', query: 'fresher ai engineer hiring' },
  { name: 'Direct Founder AI Hiring', query: 'im hiring ai intern' },
];

// Noise and Spam rejection heuristics
const NOISE_REGEX = /\b(happy to announce|started a new position|joined as|thrilled to share|promoted to|celebrating \d+ years|certificate of completion|webinar|workshop|masterclass|course|bootcamp|enroll now|register now|admissions open)\b/i;
const MARKETING_AD_REGEX = /\b(request demo|book a demo|schedule a demo|try our demo|free demo|read the full report|download the report|flagged for ai-cheating)\b/i;
const STAFFING_SPAM_REGEX = /\b(c2c|corp to corp|corp-to-corp|bench sales|bench consultant|hotlist|w2\b|1099|c2h|h1b|h1-t|eads|visa transfer|us it staffing|sap technical|sap consultant|workato|network engineer|network architect|data center network|qa automation|qa lead|manual tester|latam|mexico)\b/i;
const FOREIGN_GATEKEEPER_REGEX = /\b(residents? of (sweden|germany|uk|united kingdom|canada|australia|singapore|japan|uae|dubai|saudi)|must be (located|based) in (sweden|germany|uk|london|berlin|dubai|riyadh|stockholm)|arabic speaker|german speaker|swedish speaker|french speaker|us citizen only|w2 only|c2c only)\b/i;
const POSITIVE_AI_REGEX = /\b(ai\b|artificial intelligence|genai|generative ai|llm|agentic|langgraph|machine learning|ml\b|nlp|computer vision|deep learning|rag|prompt engineering|pytorch|tensorflow|fde\b|forward deployed)\b/i;

// Rejection for Candidates / Job Seekers advertising themselves (#OpenToWork)
const CANDIDATE_JOB_SEEKER_REGEX = /\b(open to work|#opentowork|looking for (?:a )?(?:new )?(?:remote )?(?:job|role|opportunity|opportunities)|grateful for (?:any )?leads|appreciate a referral|if your team is hiring|hire me|my resume|my portfolio|i'm currently looking for|im currently looking for)\b/i;

// Rejection for personal career celebration / announcements
const PERSONAL_UPDATE_REGEX = /\b(career update|thrilled to share that i have joined|excited to announce that i have joined|excited to share that i have joined|joined as an?|my first week at|happy to announce that i have joined|joined bland|i have joined|sound human for a living now)\b/i;

export function evaluatePostSuitability(item) {
  const text = item.fullText || '';
  if (!text || text.length < 50) return { pass: false, reason: 'TEXT_TOO_SHORT' };

  // 1. Post Freshness: Reject posts that are weeks or months old, or older than 5 days
  const postAge = (item.postAge || item.postedAge || '').toLowerCase();
  if (/\b(\d+w|\d+mo|\d+y)\b/i.test(postAge)) {
    return { pass: false, reason: `STALE_POST (${postAge})` };
  }
  const dayMatch = postAge.match(/^(\d+)d\b/);
  if (dayMatch && parseInt(dayMatch[1], 10) > 5) {
    return { pass: false, reason: `STALE_POST_OVER_5D (${postAge})` };
  }

  // 2. Reject Job Seekers & Personal Celebration Announcements
  if (CANDIDATE_JOB_SEEKER_REGEX.test(text)) return { pass: false, reason: 'JOB_SEEKER_POST' };
  if (PERSONAL_UPDATE_REGEX.test(text)) return { pass: false, reason: 'PERSONAL_CAREER_UPDATE' };

  // 3. Fundamental Noise and Non-opportunity filter
  if (NOISE_REGEX.test(text)) return { pass: false, reason: 'NOISE_ANNOUNCEMENT' };
  if (MARKETING_AD_REGEX.test(text)) return { pass: false, reason: 'MARKETING_DEMO_AD' };
  if (STAFFING_SPAM_REGEX.test(text)) return { pass: false, reason: 'C2C_STAFFING_SPAM' };
  if (FOREIGN_GATEKEEPER_REGEX.test(text)) return { pass: false, reason: 'FOREIGN_GATEKEEPER' };

  // 3. Non-Tech function rejection (data collection, transcription, operations, spotlights)
  if (/\b(language operations|transcription|audio data|facial data|data collection|data annotation|annotation interns?|ai trainer|prompt evaluator|content creator|social media intern|supply intern|operations interns?|product analyst|business analyst|growth intern|marketing intern|sales intern|hr intern|recruiting intern|talent acquisition intern|member spotlight|members spotlight)\b/i.test(text)) {
    return { pass: false, reason: 'NON_TECH_FUNCTION' };
  }

  // 4. Must be positive AI/ML/Data role
  if (!POSITIVE_AI_REGEX.test(text)) {
    return { pass: false, reason: 'NOT_AI_ROLE' };
  }

  // 5. Must contain active hiring intent
  if (!/\b(hiring|looking for|opening|intern|internship|apply|opportunity|join us|dm me|reach out|stipend|paid|seeking|expanding|need|wanted)\b/i.test(text)) {
    return { pass: false, reason: 'NO_HIRING_INTENT' };
  }

  // 6. Hard Numerical Experience Gate:
  // Catches: 3+ yrs, 3-5 years, 3–5 yrs (en-dash), 3 to 5 years, 4+, 5 plus, 10 or more years
  // Avoid matching historical company descriptions like "founded 5 years ago", "over the past 5 years"
  const expRegex = /\b(\d+)\s*(?:\+|plus|or more|\s*[\-–—to\s]+\s*(\d+))?\s*(?:years?|yrs?|yoe)\b/gi;
  let match;
  while ((match = expRegex.exec(text)) !== null) {
    const min = parseInt(match[1], 10);
    if (min >= 3 && min <= 35) {
      const postSnippet = text.slice(match.index + match[0].length, match.index + match[0].length + 10).toLowerCase();
      const preSnippet = text.slice(Math.max(0, match.index - 25), match.index).toLowerCase();
      if (postSnippet.includes('ago') || preSnippet.includes('founded') || preSnippet.includes('for over') || preSnippet.includes('past')) {
        continue;
      }
      return { pass: false, reason: `SENIOR_EXPERIENCE (${match[0]})` };
    }
  }

  // Shorthand for 3+ to 20+ YOE without "years" (e.g. "3+", "4+", "5 plus in applied ML")
  if (/\b([3-9]|\d{2,})\s*(?:\+|plus)(?!\d)/i.test(text)) {
    return { pass: false, reason: 'SENIOR_EXPERIENCE_SHORTHAND' };
  }

  // 7. Senior Leadership Roles in the job itself
  if (/\b(senior|sr\.?|(?:engineering|software|product|project)\s+manager|manager\s*,\s*(?:software|engineering)|manager level|director of engineering|head of ai|head of engineering|vp of engineering|lead architect|principal engineer|staff engineer|sde[- ]?2|swe[- ]?2)\b/i.test(text)) {
    return { pass: false, reason: 'LEADERSHIP_ROLE' };
  }

  // 8. Location Gate: Reject purely foreign-only locations (unless India is explicitly mentioned)
  const isForeignOnly = /(?:european union|canada|united states|uk|europe|london|california|san francisco|australia|germany)\s*(?:\(remote\)|remote|\(on-site\)|on-site|only)/i.test(text);
  const mentionsIndia = /\b(india|bengaluru|bangalore|hyderabad|delhi|mumbai|pune|noida|chennai|gurgaon|remote india)\b/i.test(text);
  if (isForeignOnly && !mentionsIndia) {
    return { pass: false, reason: 'FOREIGN_LOCATION_LOCKED' };
  }

  // 9. Actionable contact / apply mechanism
  const uniqueEmails = Array.from(new Set(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []));
  const hasDirectContact = /\b(dm me|message me|send your resume|send cv|drop your resume|drop your cv|apply here|email your resume|send across your resume|share your profile|share your cv|stipend|comment below|reach out directly)\b/i.test(text);
  const hasExternalLink = item.externalLinks && item.externalLinks.some(l => !l.includes('linkedin.com') && !l.startsWith('javascript:') && !l.startsWith('mailto:'));
  const hasEmail = uniqueEmails.length > 0;

  if (!hasEmail && !hasExternalLink && !hasDirectContact) {
    return { pass: false, reason: 'NOT_ACTIONABLE' };
  }

  // 10. Reject Affiliate Referral Links & Spam Aggregators
  const hasAffiliateLink = item.externalLinks && item.externalLinks.some(l =>
    l.includes('referralCode=') ||
    l.includes('refer.micro1.ai') ||
    l.includes('work.turing.com/r/') ||
    l.includes('turing.com/r/') ||
    l.includes('blogspot.com')
  );
  if (hasAffiliateLink) {
    return { pass: false, reason: 'AFFILIATE_SPAM_LINK' };
  }

  return { pass: true, emails: uniqueEmails };
}

export async function discoverLinkedInPosts(options = {}) {
  const limit = options.limit || LIMIT;
  const headless = options.headless !== undefined ? options.headless : HEADLESS;

  console.log(`\n========================================================`);
  console.log(` Starting LinkedIn Content / Post Discovery Sweep`);
  console.log(` Mode: Headless=${headless} | Match Mode: Top Relevance & Credibility (Past 7d)`);
  console.log(` Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
  console.log(`========================================================\n`);

  let seenCache = {};
  if (fs.existsSync(SEEN_FILE)) {
    try { seenCache = JSON.parse(fs.readFileSync(SEEN_FILE, 'utf-8')); } catch { }
  }

  const isSeen = (url) => {
    if (!url) return false;
    const clean = url.split('?')[0].replace(/\/+$/, '');
    return !!(seenCache[clean] || seenCache[clean + '/']);
  };

  const context = await createLinkedInContext({ headless });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://www.linkedin.com' });
  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

  const collectedPosts = [];
  const processedPostKeys = new Set();

  let SEARCH_MODES = [
    {
      id: 'relevance',
      name: 'Top Relevance & Matched (Past 7 Days)',
      getUrl: (query) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&origin=FACETED_SEARCH&f_TPR=r604800`,
      scrolls: CUSTOM_SCROLLS || 10,
    },
    {
      id: '24h',
      name: 'Past 24 Hours (Fresh Chronological)',
      getUrl: (query) => `https://www.linkedin.com/search/results/content/?keywords=${encodeURIComponent(query)}&origin=FACETED_SEARCH&sortBy=%5B%22date_posted%22%5D&f_TPR=r86400`,
      scrolls: CUSTOM_SCROLLS || 10,
    },
  ];

  if (SEARCH_MODE_FILTER === '24h') {
    SEARCH_MODES = SEARCH_MODES.filter(m => m.id === '24h');
  } else if (SEARCH_MODE_FILTER === '7d' || SEARCH_MODE_FILTER === 'relevance') {
    SEARCH_MODES = SEARCH_MODES.filter(m => m.id === 'relevance');
  }

  const PRIORITY_ONLY = args.includes('--priority-only') || args.includes('--priority');
  const activeLanes = PRIORITY_ONLY ? POST_LANES.filter(l => l.priority) : POST_LANES;

  try {
    for (const mode of SEARCH_MODES) {
      console.log(`\n========================================================`);
      console.log(` 🚀 STARTING PASS: [${mode.name}]`);
      console.log(`========================================================\n`);

      for (const lane of activeLanes) {
        if (collectedPosts.length >= limit) {
          console.log(`\n🎯 Target limit of ${limit} posts reached. Finishing sweep.`);
          break;
        }

        const searchUrl = mode.getUrl(lane.query);
        console.log(`\n🔍 Searching Lane: [${lane.name}] (${mode.name})`);

        try {
          await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
          await sleep(randomJitter(2500, 3800));
        } catch (err) {
          console.warn(`   ⚠️ Navigation timeout on lane: ${err.message}`);
          continue;
        }

        // Check for checkpoint
        const pageTitle = await page.title();
        if (pageTitle.toLowerCase().includes('security') || pageTitle.toLowerCase().includes('checkpoint')) {
          console.warn('   ⚠️ LinkedIn security checkpoint encountered. Pausing post discovery.');
          break;
        }

        // Deep scroll to load feed items
        console.log(`   📜 Scrolling deeply (${mode.scrolls} scrolls) to load feed items...`);
        for (let s = 0; s < mode.scrolls; s++) {
          await page.evaluate(() => window.scrollBy({ top: 1100, behavior: 'smooth' }));
          await sleep(randomJitter(1200, 1800));
        }

        // Expand all "... more" buttons on the page so text is full (client-side DOM only, 0 network requests)
        await page.evaluate(() => {
          const moreButtons = Array.from(document.querySelectorAll('button')).filter(b => b.innerText && b.innerText.includes('more'));
          moreButtons.forEach(b => {
            try { b.click(); } catch { }
          });
        });
        await sleep(800);

        // Extract all candidate post items
        const postElementsData = await page.evaluate(() => {
          const items = Array.from(document.querySelectorAll('[role="listitem"]'));
          return items.map((item, idx) => {
            const fullText = item.innerText || '';

            // Find author link
            const authorAnchor = item.querySelector('a[href*="/in/"]');
            const authorUrl = authorAnchor ? authorAnchor.href.split('?')[0] : '';

            // Extract author name from lines of text (line 0 is usually 'Feed post', line 1 is author name)
            const textLines = fullText.split('\n').map(l => l.trim()).filter(Boolean);
            let authorName = '';
            if (textLines.length > 1) {
              if (textLines[0].toLowerCase().includes('feed post')) {
                authorName = textLines[1];
              } else {
                authorName = textLines[0];
              }
            }
            if (!authorName && authorAnchor) {
              authorName = (authorAnchor.innerText || '').split('\n')[0].trim();
            }

            // Relative post age (e.g., 2m, 1h, 1d)
            let postAge = '';
            const timeEl = item.querySelector('time');
            if (timeEl && timeEl.innerText) postAge = timeEl.innerText.trim();
            if (!postAge) {
              const spans = Array.from(item.querySelectorAll('span'));
              const ageSpan = spans.find(s => /^\d+\s*[smhdwy](\s*•|\s*$)/i.test(s.innerText.trim()));
              if (ageSpan) {
                postAge = ageSpan.innerText.trim().replace(/•.*$/, '').trim();
              }
              if (!postAge) {
                const hiddenAge = spans.find(s => /(?:hour|minute|day|week|month)s?\s+ago/i.test(s.innerText.trim()));
                if (hiddenAge) postAge = hiddenAge.innerText.trim();
              }
            }
            if (!postAge) postAge = 'Recent';

            // Direct Post URL from links or URN
            const directPostLink = item.querySelector('a[href*="/feed/update/urn:li:activity:"], a[href*="/posts/"]');
            let directPostUrl = directPostLink ? directPostLink.href.split('?')[0] : '';
            if (!directPostUrl) {
              const urnEl = item.querySelector('[data-urn*="activity"], [data-chameleon-result-urn*="activity"]');
              if (urnEl) {
                const urn = urnEl.getAttribute('data-urn') || urnEl.getAttribute('data-chameleon-result-urn');
                const actId = urn ? urn.match(/activity:(\d+)/) : null;
                if (actId) directPostUrl = `https://www.linkedin.com/feed/update/urn:li:activity:${actId[1]}/`;
              }
            }

            // Extract all external links and lnkd.in links
            const links = Array.from(item.querySelectorAll('a[href]'))
              .map(a => a.href)
              .filter(href => !href.includes('linkedin.com/in/') && !href.includes('linkedin.com/company/') && !href.includes('linkedin.com/search') && !href.startsWith('javascript:'));

            // Unescape LinkedIn safety redirect URLs
            const cleanedLinks = links.map(l => {
              if (l.includes('linkedin.com/safety/go/?url=')) {
                try {
                  const match = l.match(/url=([^&]+)/);
                  if (match) return decodeURIComponent(match[1]);
                } catch { }
              }
              return l;
            });

            const uniqueLinks = Array.from(new Set(cleanedLinks));

            return {
              domIndex: idx,
              fullText,
              authorName,
              authorUrl,
              postAge,
              directPostUrl,
              externalLinks: uniqueLinks,
            };
          });
        });

        console.log(`   Found ${postElementsData.length} post containers in lane.`);

        let laneMatches = 0;

        // Process all post items sequentially (no per-lane caps)
        for (const item of postElementsData) {
          if (collectedPosts.length >= limit) break;

          const text = item.fullText;
          if (!text || text.length < 50) continue;

          // Comprehensive Eligibility & Noise Evaluation
          const suitability = evaluatePostSuitability(item);
          if (!suitability.pass) {
            // Excluded due to senior YOE, leadership role, foreign location lock, or non-tech noise
            continue;
          }

          const uniqueEmails = suitability.emails || [];

          // Unique post deduplication key across both passes
          const postKey = item.directPostUrl || (item.authorUrl ? `${item.authorUrl}_${item.postAge}` : text.slice(0, 100));
          if (processedPostKeys.has(postKey)) continue;
          processedPostKeys.add(postKey);

          // Canonical Post Link
          let postUrl = item.directPostUrl || '';
          if (!postUrl) {
            // Fallback to control menu clipboard copy only if direct URL was missing
            try {
              postUrl = await page.evaluate(async (domIdx) => {
                const items = Array.from(document.querySelectorAll('[role="listitem"]'));
                if (!items[domIdx]) return '';

                const it = items[domIdx];
                const menuBtn = it.querySelector('button[aria-label*="control menu"]');
                if (!menuBtn) return '';

                menuBtn.click();
                await new Promise(r => setTimeout(r, 600));

                const menuItems = Array.from(document.querySelectorAll('[role="menuitem"]'));
                const copyItem = menuItems.find(m => m.textContent && m.textContent.includes('Copy link'));
                if (!copyItem) {
                  menuBtn.click();
                  return '';
                }

                copyItem.click();
                await new Promise(r => setTimeout(r, 500));

                try {
                  return await navigator.clipboard.readText();
                } catch (e) {
                  return '';
                }
              }, item.domIndex);
            } catch (clipErr) { }
          }

          // Fallback post URL to author profile if still not found
          if (!postUrl && item.authorUrl) {
            postUrl = `${item.authorUrl}/recent-activity/all/`;
          }

          if (isSeen(postUrl)) {
            continue;
          }

          // Clean post text snippet for preview
          const rawLines = text.split('\n').map(l => l.trim()).filter(Boolean);
          const lines = rawLines.filter(l =>
            !l.startsWith('Feed post') &&
            !/^[•·]?\s*(1st|2nd|3rd\+?|following|follow|connect|joined)\b/i.test(l) &&
            !/^\d+[smhdwy]\s*•?/i.test(l) &&
            !/^(like|comment|repost|send|share)\b/i.test(l)
          );
          let headline = '';
          let bodyLines = [];
          if (lines.length > 0) {
            if (lines.length > 1) {
              headline = lines[1];
              bodyLines = lines.slice(2);
            } else {
              bodyLines = lines.slice(1);
            }
          }
          const bodySnippet = bodyLines.slice(0, 6).join(' ').slice(0, 300);

          const postRecord = {
            type: 'FOUNDER_POST',
            platform: 'LinkedIn Post',
            author: item.authorName || 'Hiring Leader / Founder',
            authorUrl: item.authorUrl,
            headline,
            postUrl: postUrl || item.authorUrl,
            postedAge: item.postAge,
            snippet: bodySnippet,
            fullText: text,
            externalLinks: item.externalLinks,
            emails: uniqueEmails,
            dateCaptured: new Date().toISOString().split('T')[0],
          };

          collectedPosts.push(postRecord);
          laneMatches++;
          console.log(`   ✨ Captured Post #${collectedPosts.length} [${mode.id.toUpperCase()}]: ${postRecord.author} (${postRecord.postedAge}) -> ${postRecord.postUrl}`);

          // Human-like jitter
          await sleep(randomJitter(800, 1500));
        }

        await sleep(randomJitter(2000, 3500));
      }
    }
  } finally {
    await context.close();
  }

  // Run AI 2nd Cross-Check to filter out any candidates or celebration posts (optional via --ai flag)
  let finalVerifiedPosts = collectedPosts;
  if (ENABLE_AI_API && collectedPosts.length > 0) {
    try {
      console.log(`\n🤖 Running AI Verification (Gemini 2.5 Flash) on ${collectedPosts.length} candidate posts...`);
      finalVerifiedPosts = await crossCheckPostsWithAI(collectedPosts);
    } catch (err) {
      console.warn('⚠️ AI cross check error:', err.message);
    }
  }

  // Save discovered posts to data/linkedin-posts.json
  fs.writeFileSync(POSTS_OUTPUT_FILE, JSON.stringify(finalVerifiedPosts, null, 2), 'utf-8');
  console.log(`\n💾 Saved ${finalVerifiedPosts.length} hiring posts to data/linkedin-posts.json`);

  // Dispatch to Telegram only if explicitly enabled via --telegram
  if (ENABLE_TELEGRAM && finalVerifiedPosts.length > 0) {
    try {
      console.log(`\n📲 Dispatching ${finalVerifiedPosts.length} posts to Telegram...`);
      await sendFounderPostsToTelegram(finalVerifiedPosts, '📢 AI-Verified Founder & Hiring Announcements');
    } catch (err) {
      console.error('Failed to send Telegram notifications:', err.message);
    }
  } else if (!ENABLE_TELEGRAM && finalVerifiedPosts.length > 0) {
    console.log(`\nℹ️ Telegram notification skipped (pass --telegram to dispatch).`);
  }

  return finalVerifiedPosts;
}

// Direct execution
if (process.argv[1] && process.argv[1].endsWith('linkedin-posts-discover.mjs')) {
  discoverLinkedInPosts().catch(console.error);
}
