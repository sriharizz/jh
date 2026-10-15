#!/usr/bin/env node

/**
 * scripts/ai-crosscheck.mjs
 *
 * Automated 2nd-Stage LLM Cross-Check for Career-Ops
 * Evaluates candidate job postings and founder announcements against Sri Hari's profile:
 * - Target roles: AI / GenAI / LLMs / Agentic / FDE / ML / AI Internships / Junior Data Science
 * - Strictly <= 3 YOE or Internships (hard reject 4+ YOE, Staff, Principal, Engineering Managers)
 * - India locations (Bengaluru, Hyderabad, Remote India) or 100% Global Remote
 * - Rejects non-engineering gigs (QA tester, firmware, sales, audio translation, member spotlights)
 * - Rejects non-hiring retrospective/celebratory essays
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

export async function crossCheckPostsWithAI(posts = []) {
  if (!posts || posts.length === 0) return [];

  let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    try {
      const envFile = resolve(ROOT_DIR, '.env');
      if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, 'utf-8');
        const m = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
        if (m) apiKey = m[1].trim();
      }
    } catch {}
  }

  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not found in environment or .env. Skipping AI 2nd cross-check stage.');
    return posts;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  // Using stable high-speed flash model
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const simplifiedList = posts.map((p, idx) => ({
    id: idx,
    author: p.author || '',
    headline: p.headline || '',
    postedAge: p.postedAge || '',
    text: p.fullText ? p.fullText.slice(0, 1000) : (p.snippet || ''),
  }));

  const prompt = `
You are the Lead Technical Recruiter and strict gatekeeper for Sri Hari, an early-career AI / GenAI Engineer (0-2 YOE, expected graduation 2027 from Sir MVIT Bengaluru) targeting opportunities in India (Bengaluru, Hyderabad, Remote India) or Global Remote.

Target Roles:
- AI Engineer, Generative AI Engineer, LLM Developer, Agentic AI Engineer, Forward Deployed Engineer (FDE), Machine Learning Engineer, AI/ML Intern, Junior Data Scientist.

Strict Disqualification Rules (verdict must NOT be VERIFIED_MATCH):
1. JOB SEEKERS & CANDIDATES: REJECT ANY post where an individual candidate is looking for work, sharing their own resume, or asking for referrals (e.g., #OpenToWork, "looking for remote opportunities", "grateful for leads or referrals", "if your team is hiring", "hire me").
2. PERSONAL CELEBRATIONS / CAREER UPDATES: REJECT posts where someone is celebrating getting a new job, announcing they joined a company, or sharing their first week ("career update", "I joined", "excited to share I have joined", "my first week at").
3. Senior/Mid roles requiring 3+ YOE: REJECT 3+ YOE, 3-5 years, Staff, Principal, Lead, Tech Lead, Engineering Manager, Director, VP, SDE 2, SWE II.
4. Non-engineering functions: QA testing, SDET, firmware, hardware, IT support, sales, marketing, recruiter, data entry, audio/speech transcription, language operations.
5. Non-hiring posts: retrospective essays, personal project showcases, thought leadership with no open requisition.
6. Location-restricted outside India: strictly US on-site, Canada Only, EU Only without India or Global Remote options.

Approval Rules (verdict: "VERIFIED_MATCH"):
- An actual founder, engineering lead, or recruiter announcing an ACTIVE OPEN engineering position or internship for their team.
- Role matches AI/GenAI/ML/FDE/Python engineering.
- Achievable for an early-career builder (0-2 YOE or Internships).

Evaluate the following candidate posts and return ONLY the items that are GENUINE hiring opportunities for Sri Hari:

${JSON.stringify(simplifiedList, null, 2)}

Respond ONLY with a valid JSON array of objects:
[
  {
    "id": number,
    "role": string,
    "verdict": "VERIFIED_MATCH" | "REJECT",
    "reason": string
  }
]
`;

  console.log(`🤖 Running 2nd Cross-Check with Gemini on ${posts.length} candidate posts...`);
  try {
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });

    const parsed = JSON.parse(res.response.text());
    const approvedIds = new Set(parsed.filter(r => r.verdict === 'VERIFIED_MATCH').map(r => r.id));

    const approvedPosts = [];
    const seenContent = new Set();

    for (const post of posts) {
      const idx = posts.indexOf(post);
      if (approvedIds.has(idx)) {
        // Deduplicate reposts with identical author & snippet
        const dedupKey = `${post.author}_${(post.snippet || '').slice(0, 50)}`.toLowerCase();
        if (seenContent.has(dedupKey)) continue;
        seenContent.add(dedupKey);

        const aiReview = parsed.find(r => r.id === idx);
        approvedPosts.push({
          ...post,
          aiVerifiedRole: aiReview ? aiReview.role : (post.title || 'AI Role'),
          aiReason: aiReview ? aiReview.reason : 'Verified Match',
        });
      }
    }

    console.log(`✨ AI 2nd Cross-Check approved ${approvedPosts.length} out of ${posts.length} candidate posts.`);
    return approvedPosts;
  } catch (err) {
    console.error('⚠️ AI 2nd Cross-Check encountered an error:', err.message);
    // Fallback: return posts if LLM call failed so pipeline doesn't break
    return posts;
  }
}

/**
 * 2nd-Stage LLM Cross-Check for Job Postings
 * Reads full JD snippet and validates role alignment and experience limits (< 3 YOE)
 */
export async function crossCheckJobsWithAI(jobs = []) {
  if (!jobs || jobs.length === 0) return [];

  let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    try {
      const envFile = resolve(ROOT_DIR, '.env');
      if (fs.existsSync(envFile)) {
        const envContent = fs.readFileSync(envFile, 'utf-8');
        const m = envContent.match(/GEMINI_API_KEY=([^\r\n]+)/);
        if (m) apiKey = m[1].trim();
      }
    } catch {}
  }

  if (!apiKey) {
    console.warn('⚠️ GEMINI_API_KEY not found in environment or .env. Skipping AI 2nd cross-check stage.');
    return jobs;
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

  const approvedJobs = [];
  const BATCH_SIZE = 10;

  for (let b = 0; b < jobs.length; b += BATCH_SIZE) {
    const batch = jobs.slice(b, b + BATCH_SIZE);
    const simplifiedList = batch.map((j, idx) => ({
      id: idx,
      title: j.title || '',
      company: j.company || '',
      location: j.location || '',
      descriptionSnippet: (j.description || '').slice(0, 1200),
    }));

    const prompt = `
You are the strict Technical Screener for Banda Sri Hari.
Candidate Profile:
- Early-Career AI / GenAI Engineer (0-1 YOE, B.E. in AI & ML expected 2027 from Sir MVIT Bengaluru).
- Core Technical Skills: LangGraph, Agentic AI, RAG pipelines, Python, FastAPI, PyTorch, Vector DBs (Chroma/FAISS/pgvector).
- Real experience: AI Engineer Intern at Chiacon (built 9-node LangGraph voice agent, concurrent LLM evaluators).
- Target Locations: Bengaluru, Hyderabad, Remote India, or Global Remote.

Strict REJECTION Criteria (verdict: "REJECT"):
1. Experience Barrier: ANY job requiring 3 or more years of experience (e.g. "3+ years", "3-5 years", "3-4 years", "4+ years", "5+ years", or titled 'Senior', 'Sr', 'Lead', 'Staff', 'Principal', 'SDE 2', 'SWE II', 'Software Engineer II', 'Engineer 2').
2. Wrong / Legacy Stack: Pure non-AI roles (pure Java/Spring Boot, Angular/React only, QA / SDET testing, IT support, SAP, Salesforce, RPA / Power Automate, Sales, Marketing).
3. Strictly Foreign On-site: Located in US, UK, Europe, etc. without India or Remote options.
4. Shady / Fee-based / Consultancies: Training institutes asking for fees or ghost consultancies.

Approval Criteria (verdict: "VERIFIED_MATCH"):
- Real hands-on AI / GenAI / LLM / Agentic / Forward Deployed (FDE) / Machine Learning / Python AI engineering role.
- Achievable for an early-career engineer: 0 YOE, 0-1 YOE, 0-2 YOE, 1 year of experience, or Internships / Freshers. Even if it asks for 1 year experience, APPROVE IT!

Evaluate these candidate jobs and return a JSON array:
${JSON.stringify(simplifiedList, null, 2)}

Respond ONLY with valid JSON array:
[
  {
    "id": number,
    "verdict": "VERIFIED_MATCH" | "REJECT",
    "reason": string
  }
]
`;

    try {
      console.log(`🤖 [AI Audit] Auditing batch ${Math.floor(b / BATCH_SIZE) + 1}/${Math.ceil(jobs.length / BATCH_SIZE)} (${batch.length} jobs) with Gemini 2.5 Flash...`);
      const res = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json' },
      });

      const parsed = JSON.parse(res.response.text());
      for (const item of parsed) {
        const original = batch[item.id];
        if (!original) continue;

        if (item.verdict === 'VERIFIED_MATCH') {
          approvedJobs.push({
            ...original,
            aiVerified: true,
            aiReason: item.reason,
          });
          console.log(`  ✅ [AI Approved] ${original.company} — ${original.title}: ${item.reason}`);
        } else {
          console.log(`  ❌ [AI Disqualified] ${original.company} — ${original.title}: ${item.reason}`);
        }
      }
    } catch (err) {
      console.error(`  ⚠️ Batch AI audit error: ${err.message}. Passing batch as fallback.`);
      approvedJobs.push(...batch);
    }
  }

  console.log(`✨ AI Audit complete: Approved ${approvedJobs.length} of ${jobs.length} candidate jobs.`);
  return approvedJobs;
}
