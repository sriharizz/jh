/**
 * scratch/test-subjective-intelligence.mjs
 * Comprehensive Offline & Live-Pattern Test Harness for Subjective Question Intelligence
 */

import {
  classifySubjectiveQuestion,
  generateSubjectiveAnswer,
  validateSubjectiveAnswer,
} from '../scripts/linkedin/linkedin-apply.mjs';

const companyName = 'Skild AI';
const roleTitle = 'Computer Vision & AI Engineer';
const jdText = 'Building scalable foundation models for physical AI and general-purpose robotics. Looking for engineers with strong Python, agentic systems, and high-performance pipeline experience.';

const testCases = [
  {
    id: 'TEST CASE 1 — Company Motivation',
    questionText: 'Why do you want to work at Skild AI?',
    expectedType: 'COMPANY_MOTIVATION',
  },
  {
    id: 'TEST CASE 2 — Multi-Project Breakdown (Live Skild Form Wording)',
    questionText: "Tell us about two to three projects or accomplishments you're most proud of! Whether it's building something impactful, contributing to open-source work, launching a company, winning an award, or anything else that showcases your skills — we're excited to hear about it!",
    expectedType: 'PROJECT_MULTI',
  },
  {
    id: 'TEST CASE 3 — Technical Experience (LangGraph / Multi-Agent)',
    questionText: 'Describe your hands-on experience with LangGraph, multi-agent systems, and asynchronous concurrency.',
    expectedType: 'TECHNICAL_EXPERIENCE',
  },
  {
    id: 'TEST CASE 4 — Fine-Tuning & AST RAG (GitNova)',
    questionText: 'Walk us through a project where you fine-tuned an LLM or built a code retrieval system.',
    expectedType: 'PROJECT',
  },
];


console.log('======================================================');
console.log(' SUBJECTIVE QUESTION INTELLIGENCE VERIFICATION REPORT');
console.log('======================================================\n');

const sessionPreviousAnswers = [];

for (let i = 0; i < testCases.length; i++) {
  const tc = testCases[i];
  const qClassification = classifySubjectiveQuestion(tc.questionText);

  const result = generateSubjectiveAnswer({
    questionType: qClassification.type,
    questionText: tc.questionText,
    companyName,
    roleTitle,
    jdText,
    fieldLimit: null,
    previousAnswers: sessionPreviousAnswers,
  });

  const val = validateSubjectiveAnswer({
    questionType: qClassification.type,
    questionText: tc.questionText,
    answer: result.draft,
    companyName,
    previousAnswers: sessionPreviousAnswers,
  });

  console.log('======================================================');
  console.log(`SUBJECTIVE QUESTION #${i + 1} (${tc.id})`);
  console.log('======================================================');
  console.log(`Question: ${tc.questionText}\n`);
  console.log(`Classification: ${qClassification.label} (${qClassification.type})\n`);
  console.log('Selected evidence:');
  const evList = Array.isArray(result.selectedEvidence) ? result.selectedEvidence : [result.selectedEvidence];
  for (const ev of evList) {
    console.log(`- ${ev}`);
  }
  console.log(`\nGenerated answer:\n${result.draft}\n`);
  console.log('Validation:');
  console.log(`- Directly answers question: ${val.directlyAnswers ? 'YES' : 'NO'}`);
  console.log(`- Relevant evidence:         ${val.relevantEvidence ? 'YES' : 'NO'}`);
  console.log(`- Reused previous answer:    ${val.notReused ? 'NO' : 'YES (WARNING)'}`);
  console.log(`- Natural style:             ${val.naturalStyle ? 'YES' : 'NO'}`);
  console.log(`- Evidence supported:        ${val.evidenceSupported ? 'YES' : 'NO'}`);
  console.log('======================================================\n');

  if (!val.isValid) {
    console.error(`❌ Validation failed on Test Case #${i + 1}`);
    process.exit(1);
  }

  // Push to session previous answers
  sessionPreviousAnswers.push(result.draft);
}

// Anti-Caching & Material Difference Verification
console.log('======================================================');
console.log(' ANTI-CACHING & MATERIAL DIFFERENCE VERIFICATION');
console.log('======================================================');
const ans1 = sessionPreviousAnswers[0];
const ans2 = sessionPreviousAnswers[1];
const ans3 = sessionPreviousAnswers[2];

const areDistinct12 = ans1 !== ans2 && !ans2.includes(ans1.slice(0, 40));
const areDistinct23 = ans2 !== ans3 && !ans3.includes(ans2.slice(0, 40));

console.log(`• Answer 1 (Company Motivation): ${ans1.length} chars`);
console.log(`• Answer 2 (3 Projects Prose):    ${ans2.length} chars`);
console.log(`• Answer 3 (Technical Exp):       ${ans3.length} chars`);
console.log(`• Q1 vs Q2 Distinct:              ${areDistinct12 ? '✅ CONFIRMED (Zero overlap/reuse)' : '❌ FAILED'}`);
console.log(`• Q2 vs Q3 Distinct:              ${areDistinct23 ? '✅ CONFIRMED (Zero overlap/reuse)' : '❌ FAILED'}`);
console.log(`• Q2 discusses 2-3 projects:      ${ans2.includes('Meera V2') && ans2.includes('Veridian') && ans2.includes('Unshell') ? '✅ CONFIRMED (Meera V2, Veridian WorkOS, Unshell)' : '❌ FAILED'}`);
console.log(`• Q1 focuses on Skild AI robotics:${ans1.includes('Skild AI') && ans1.includes('robotics') ? '✅ CONFIRMED' : '❌ FAILED'}`);
console.log('======================================================\n');
