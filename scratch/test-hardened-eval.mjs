import { readFileSync } from 'fs';

// Quick test script to verify that Deloitte, Visa, Quantiphi, and other 3+ YOE roles are 100% rejected.

function testJob(title, desc) {
  // Normalization: Unify dashes and collapse spaces around numbers, pluses, and hyphens
  let rawDesc = (desc || '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-')
    .replace(/(\d+)\s*\+\s*(?:years?|yrs?|yoe)/gi, '$1+ years')
    .replace(/(\d+)\s*-\s*(\d+)\s*(?:years?|yrs?|yoe)/gi, '$1-$2 years')
    .replace(/(\d+)\s*to\s*(\d+)\s*(?:years?|yrs?|yoe)/gi, '$1-$2 years');
  const d = rawDesc.toLowerCase();
  const t = (title || '').toLowerCase();

  const expMatches = [];
  const addMatch = (num1, num2, raw, isTotal = false) => {
    if (!isNaN(num1) && num1 >= 0 && num1 <= 35) {
      const maxVal = (!isNaN(num2) && num2 >= num1) ? num2 : (raw.includes('+') ? num1 + 2 : num1);
      expMatches.push({ min: num1, max: maxVal, raw, isTotal });
    }
  };

  const pTotal = /(?:total|overall|industry|software(?:\s*engineering)?|professional|work)?\s*(?:experience|exp)[:\s]+(?:of\s*)?(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)?\b/gi;
  let m;
  while ((m = pTotal.exec(d)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  const pTotal2 = /(?:with|around|approx(?:imately)?|about|have|has|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\s*(?:of\s*)?(?:total|overall|industry|software|engineering|professional|work)\s*experience/gi;
  while ((m = pTotal2.exec(d)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  const pGeneral = /\b(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b(?:\s*(?:of\s*)?(?:relevant|hands-on|overall|industry|professional|work)?\s*experience)?/gi;
  while ((m = pGeneral.exec(d)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  const pMin = /\b(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b/gi;
  while ((m = pMin.exec(d)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  const hasSeniorLeadershipTitle = /\b(senior|sr\.?|lead\b|principal\b|staff\b|architect\b|director\b|head of\b|leader\b|manager\b|vp\b|vice president\b|chief\b)/i.test(t) ||
    /\b(sde[- ]?(?:2|ii|3|iii)|swe[- ]?(?:2|ii|3|iii)|engineer[- ]?(?:2|ii|3|iii)|developer[- ]?(?:2|ii|3|iii)|level[- ]?(?:2|ii|3|iii))\b/i.test(t) ||
    /software engineer ii\b/i.test(t) ||
    /(?:job\s*title|position|role)[:\s-]+[^\n\r]*(?:lead|principal|staff|architect|technical lead|tech lead|senior engineer)/i.test(d);

  const seniorExpMatch = expMatches.find(e => 
    e.min >= 3 || 
    (!isNaN(e.max) && e.max >= 4 && e.min >= 2) ||
    /\b(?:3\s*\+|3\s*plus|[4-9]\s*\+|\d{2,}\s*\+)\s*(?:years?|yrs?|yoe)\b/i.test(e.raw) ||
    /\b2\s*\+\s*(?:years?|yrs?|yoe)\b/i.test(e.raw) ||
    /\b(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?[3-9]\b/i.test(e.raw)
  );

  const rejected = Boolean(seniorExpMatch || hasSeniorLeadershipTitle);
  const reason = seniorExpMatch ? `Experience (${seniorExpMatch.raw})` : (hasSeniorLeadershipTitle ? 'Senior/Level II Title' : 'None');
  return { rejected, reason, expMatches };
}

// Case 1: Deloitte Screenshot
const deloitteTitle = "Applied AI Engineer - Software Engineer II";
const deloitteDesc = "3 + years of experience with most of the following: Angular, React, NodeJS, Python... 2 + years of experience building AI/ML";
console.log('Deloitte Test:', testJob(deloitteTitle, deloitteDesc));

// Case 2: Screenshot 2
const case2Title = "AI Engineer";
const case2Desc = "Database & AI Data Access — SQL proficiency. Experience — 3-5 years total; 1-2 years GenAI/LLM; 6-12 months LangGraph";
console.log('Case 2 (Em-dash) Test:', testJob(case2Title, case2Desc));

// Case 3: Visa Sr SW Engineer
const visaTitle = "Sr. SW Engineer (3";
const visaDesc = "with 3+ years of relevant experience. Preferred Qualifications: 3-5 years of work experience";
console.log('Visa Test:', testJob(visaTitle, visaDesc));

// Case 4: Valid Early Career Job
const validTitle = "Junior AI Engineer";
const validDesc = "Looking for an AI engineer with 0-1 years of experience in Python, LangGraph, and FastAPI. Fresh graduates welcome!";
console.log('Valid Job Test:', testJob(validTitle, validDesc));
