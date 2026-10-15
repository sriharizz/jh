import fs from 'fs';
import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

const posts = JSON.parse(fs.readFileSync('data/linkedin-posts.json', 'utf-8'));

// Feed the posts to Gemini in one prompt for instant batch cross-check
const simplifiedList = posts.map((p, idx) => ({
  id: idx + 1,
  author: p.author,
  postedAge: p.postedAge,
  text: p.snippet || p.fullText.slice(0, 500),
}));

const prompt = `
You are the Lead Career Matchmaker and strict 2nd-stage gatekeeper for a junior AI / GenAI / Machine Learning Engineer (< 3 YOE) based in India.
Candidate Profile:
- Target roles: AI Engineer, Generative AI, LLM Developer, Agentic AI, Forward Deployed AI Engineer (FDE), Machine Learning, AI Intern, Junior Data Science.
- Target Locations: India (Bengaluru Tier 1, Hyderabad Tier 2, Remote India Tier 3) or 100% Global Remote.
- Strict Exclusions:
  1. Senior roles requiring 4+ YOE (Staff, Principal, Lead, Engineering Manager, Director).
  2. Non-engineering roles (QA tester, testing engineer, manual tester, firmware/hardware, sales, marketing, recruiter, data entry, audio/speech translation, language operations).
  3. Non-hiring posts (celebratory posts praising past hires, personal project showcases, thought leadership essays).
  4. Location-restricted outside India (e.g. US Only, Canada Only, EU Only).

Review the following candidate posts and determine which ones are GENUINE, actionable hiring opportunities for this candidate.

Candidate Posts:
${JSON.stringify(simplifiedList, null, 2)}

Respond with a valid JSON array of objects for ONLY the posts that PASS:
[
  {
    "id": number,
    "role": string,
    "company_or_author": string,
    "verdict": "VERIFIED_MATCH",
    "reason": string
  }
]
`;

async function run() {
  console.log('Sending posts to Gemini for 2nd Cross-Check...');
  const start = Date.now();
  const res = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json' },
  });
  const duration = ((Date.now() - start) / 1000).toFixed(2);
  console.log(`Cross-Check finished in ${duration}s!\n`);

  const results = JSON.parse(res.response.text());
  console.log(`Gemini approved ${results.length} out of ${posts.length} posts:\n`);
  results.forEach(r => {
    console.log(`✅ [#${r.id}] ${r.company_or_author} - ${r.role}`);
    console.log(`   Reason: ${r.reason}\n`);
  });
}

run().catch(console.error);
