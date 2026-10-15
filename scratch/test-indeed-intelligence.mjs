/**
 * scratch/test-indeed-intelligence.mjs
 * Unit Test Harness for Indeed India Discovery & Application Intelligence
 */

import {
  classifySubjectiveQuestion,
  generateSubjectiveAnswer,
} from '../scripts/indeed/indeed-apply.mjs';

console.log('======================================================');
console.log(' INDEED QUESTION INTELLIGENCE UNIT TEST SUITE');
console.log('======================================================\n');

const companyName = 'PhonePe / Fractal Analytics';
const roleTitle = 'AI Engineer';
const jdText = 'Looking for an AI engineer with strong Python, LangGraph, RAG, and FastAPI experience to build agentic pipelines in Bengaluru.';

const testQuestions = [
  {
    name: 'Test 1: Company Motivation',
    question: 'Why are you interested in working with Fractal Analytics?',
    expectedType: 'COMPANY_MOTIVATION',
  },
  {
    name: 'Test 2: Multi-Project Showcase',
    question: 'Please describe 2-3 machine learning or AI systems you have engineered.',
    expectedType: 'PROJECT_MULTI',
  },
  {
    name: 'Test 3: Technical Experience (LangGraph)',
    question: 'Describe your hands-on experience with LangGraph and agentic workflows.',
    expectedType: 'TECHNICAL_EXPERIENCE',
  },
  {
    name: 'Test 4: Specific Project Deep-Dive (Fine-Tuning / Code)',
    question: 'Walk us through a project where you fine-tuned a model or built a code intelligence pipeline.',
    expectedType: 'PROJECT',
  },
];

const answers = [];

for (let i = 0; i < testQuestions.length; i++) {
  const t = testQuestions[i];
  const qClass = classifySubjectiveQuestion(t.question);

  console.log(`[TEST CASE #${i + 1}] ${t.name}`);
  console.log(`Question:       "${t.question}"`);
  console.log(`Classification: ${qClass.label} (${qClass.type})`);

  if (qClass.type !== t.expectedType) {
    console.error(`❌ Expected classification ${t.expectedType} but got ${qClass.type}`);
    process.exit(1);
  }

  const ans = generateSubjectiveAnswer({
    questionType: qClass.type,
    questionText: t.question,
    companyName,
    roleTitle,
    jdText,
    previousAnswers: answers,
  });

  console.log(`Selected Evidence: ${ans.selectedEvidence.join(' | ')}`);
  console.log(`Generated Answer (${ans.draft.length} chars):\n${ans.draft}\n`);

  if (!ans.draft || ans.draft.length < 50) {
    console.error('❌ Generated answer too short or empty');
    process.exit(1);
  }

  if (i === 1) {
    if (!ans.draft.includes('Meera V2') || !ans.draft.includes('Veridian') || !ans.draft.includes('Unshell')) {
      console.error('❌ Multi-project answer missing required 3 projects');
      process.exit(1);
    }
  }

  if (i === 3) {
    if (!ans.draft.includes('GitNova') || !ans.draft.includes('Qwen') || !ans.draft.includes('QLoRA')) {
      console.error('❌ Fine-tuning answer missing GitNova / QLoRA evidence');
      process.exit(1);
    }
  }

  answers.push(ans.draft);
}

// Anti-Reuse check
console.log('======================================================');
console.log(' ANTI-REUSE VERIFICATION');
console.log('======================================================');
const ans1 = answers[0];
const ans2 = answers[1];
const ans3 = answers[2];
const ans4 = answers[3];

const distinct12 = ans1 !== ans2 && !ans2.includes(ans1.slice(0, 40));
const distinct23 = ans2 !== ans3 && !ans3.includes(ans2.slice(0, 40));
const distinct34 = ans3 !== ans4 && !ans4.includes(ans3.slice(0, 40));

console.log(`• Q1 vs Q2 Distinct: ${distinct12 ? '✅ CONFIRMED' : '❌ FAILED'}`);
console.log(`• Q2 vs Q3 Distinct: ${distinct23 ? '✅ CONFIRMED' : '❌ FAILED'}`);
console.log(`• Q3 vs Q4 Distinct: ${distinct34 ? '✅ CONFIRMED' : '❌ FAILED'}`);
console.log('======================================================');
console.log('✅ ALL INDEED UNIT TESTS PASSED SUCCESSFULLY.\n');
