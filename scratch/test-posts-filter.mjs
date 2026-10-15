import fs from 'fs';

const posts = JSON.parse(fs.readFileSync('data/linkedin-posts.json', 'utf-8'));

const NOISE_REGEX = /\b(happy to announce|started a new position|joined as|thrilled to share|promoted to|celebrating \d+ years|certificate of completion|webinar|workshop|masterclass|course|bootcamp|enroll now|register now|admissions open)\b/i;
const MARKETING_AD_REGEX = /\b(request demo|book a demo|schedule a demo|try our demo|free demo|read the full report|download the report|flagged for ai-cheating)\b/i;
const STAFFING_SPAM_REGEX = /\b(c2c|corp to corp|corp-to-corp|bench sales|bench consultant|hotlist|w2\b|1099|c2h|h1b|h1-t|eads|visa transfer|us it staffing|sap technical|sap consultant|workato|network engineer|network architect|data center network|qa automation|qa lead|manual tester|latam|mexico)\b/i;
const FOREIGN_GATEKEEPER_REGEX = /\b(residents? of (sweden|germany|uk|united kingdom|canada|australia|singapore|japan|uae|dubai|saudi)|must be (located|based) in (sweden|germany|uk|london|berlin|dubai|riyadh|stockholm)|arabic speaker|german speaker|swedish speaker|french speaker|us citizen only|w2 only|c2c only)\b/i;
const POSITIVE_AI_REGEX = /\b(ai\b|artificial intelligence|genai|generative ai|llm|agentic|langgraph|machine learning|ml\b|nlp|computer vision|deep learning|rag|prompt engineering|pytorch|tensorflow)\b/i;

function evaluatePostSuitability(item) {
  const text = item.fullText || '';
  if (!text || text.length < 50) return { pass: false, reason: 'TEXT_TOO_SHORT' };

  // 1. Post Freshness: Reject posts that are weeks or months old
  const postAge = (item.postAge || item.postedAge || '').toLowerCase();
  if (/\b(\d+w|\d+mo|\d+y)\b/i.test(postAge)) {
    return { pass: false, reason: `STALE_POST (${postAge})` };
  }

  // 2. Fundamental Noise and Non-opportunity filter
  if (NOISE_REGEX.test(text)) return { pass: false, reason: 'NOISE_ANNOUNCEMENT' };
  if (MARKETING_AD_REGEX.test(text)) return { pass: false, reason: 'MARKETING_DEMO_AD' };
  if (STAFFING_SPAM_REGEX.test(text)) return { pass: false, reason: 'C2C_STAFFING_SPAM' };
  if (FOREIGN_GATEKEEPER_REGEX.test(text)) return { pass: false, reason: 'FOREIGN_GATEKEEPER' };

  // 3. Non-Tech function rejection
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

  // 6. Hard Numerical Experience Gate
  const expRegex = /\b(\d+)\s*(?:\+|plus|or more|\s*[\-–—to\s]+\s*(\d+))?\s*(?:years?|yrs?|yoe)\b/gi;
  let match;
  while ((match = expRegex.exec(text)) !== null) {
    const min = parseInt(match[1], 10);
    if (min >= 4 && min <= 35) {
      return { pass: false, reason: `SENIOR_EXPERIENCE (${match[0]})` };
    }
  }

  // Shorthand for 4+ to 20+ YOE without "years"
  if (/\b([4-9]|\d{2,})\s*(?:\+|plus)(?!\d)/i.test(text)) {
    return { pass: false, reason: 'SENIOR_EXPERIENCE_SHORTHAND' };
  }

  // 7. Senior Leadership Roles
  if (/\b(engineering manager|manager level|director of engineering|head of ai|head of engineering|vp of engineering|lead architect|principal engineer|staff engineer)\b/i.test(text)) {
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

  return { pass: true, emails: uniqueEmails };
}

console.log('=== TEST SUITABILITY ON 20 POSTS ===\n');
posts.forEach((p, idx) => {
  const res = evaluatePostSuitability(p);
  console.log(`#${idx + 1} (${p.author}, ${p.postedAge}): ${res.pass ? '✅ PASS' : '❌ REJECT: ' + res.reason}`);
});
