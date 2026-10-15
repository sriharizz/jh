function parseYearsOfExperience(rawText, titleText = '') {
  const text = (rawText || '').toLowerCase().replace(/[–—−]/g, '-');
  const title = (titleText || '').toLowerCase();

  // 1. Hard Senior Title check
  if (/\b(senior|sr\.?|lead|principal|staff|architect|director|head of|leader|manager)\b/i.test(title)) {
    return { min: 6, max: 12, minRequiredYOE: 6, maxRequiredYOE: 12, reason: 'Senior Title', isSenior: true };
  }

  // 2. Hard Senior JD Keywords & Agency Header Tags
  const seniorPattern = /\b(positions?:\s*\d*\s*senior|budget:.*senior|\(senior\)|senior-level|senior\s*(?:professional|practitioner|engineer|developer|consultant|analyst|data scientist|ai|ml|talent|individual|member|specialist|resource|candidate|profile)|lead\s*(?:ai|ml|engineer|developer)|principal\s*(?:ai|ml|engineer|developer)|sr\.\s*(?:ai|ml|engineer|developer))\b/i;
  if (seniorPattern.test(text)) {
    return { min: 5, max: 10, minRequiredYOE: 5, maxRequiredYOE: 10, reason: 'Senior Keyword/Tag in JD Body', isSenior: true };
  }

  const expMatches = [];

  const addMatch = (num1, num2, raw, isTotal = false) => {
    if (!isNaN(num1) && num1 >= 0 && num1 <= 35) {
      const maxVal = (!isNaN(num2) && num2 >= num1) ? num2 : num1;
      expMatches.push({ min: num1, max: maxVal, raw, isTotal });
    }
  };

  // Pattern 1: Total / Overall / Industry experience explicitly
  const pTotal = /(?:total|overall|industry|software(?:\s*engineering)?|professional|work)?\s*(?:experience|exp)[:\s]+(?:of\s*)?(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)?\b/gi;
  let m;
  while ((m = pTotal.exec(text)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  // Pattern 2: "around X years of total...", "with X+ years of total..."
  const pTotal2 = /(?:with|around|approx(?:imately)?|about|have|has|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\s*(?:of\s*)?(?:total|overall|industry|software|engineering|professional|work)\s*experience/gi;
  while ((m = pTotal2.exec(text)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], true);
  }

  // Pattern 3: General "X+ years", "X-Y years", "X to Y years", "X years of experience"
  const pGeneral = /\b(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b(?:\s*(?:of\s*)?(?:relevant|hands-on|overall|industry|professional|work)?\s*experience)?/gi;
  while ((m = pGeneral.exec(text)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  // Pattern 4: "minimum X years", "at least X years"
  const pMin = /\b(?:minimum|at\s*least|min\.?)\s*(?:of\s*)?(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b/gi;
  while ((m = pMin.exec(text)) !== null) {
    addMatch(parseInt(m[1], 10), m[2] ? parseInt(m[2], 10) : NaN, m[0], false);
  }

  if (expMatches.length === 0) {
    return { min: 0, max: 1, minRequiredYOE: 0, maxRequiredYOE: 1, isSenior: false, reason: 'No explicit YOE found (Assumed entry/fresher)' };
  }

  // CRITICAL: If ANY total/overall/general experience requirement >= 4, it's senior
  const seniorExpMatch = expMatches.find(e => e.min >= 4);
  if (seniorExpMatch) {
    return {
      min: seniorExpMatch.min,
      max: seniorExpMatch.max,
      minRequiredYOE: seniorExpMatch.min,
      maxRequiredYOE: seniorExpMatch.max,
      isSenior: true,
      reason: `Experience requirement (${seniorExpMatch.raw}) >= 4 years`,
    };
  }

  const hasEntryContext = /\b(intern|internship|fresher|0-1|0-2|0-3|entry-level|trainee|graduate)\b/i.test(text);
  const minRequired = Math.min(...expMatches.map(e => e.min));
  const maxRequired = Math.max(...expMatches.map(e => e.max));

  if (minRequired >= 3 && !hasEntryContext) {
    return {
      min: minRequired,
      max: maxRequired,
      minRequiredYOE: minRequired,
      maxRequiredYOE: maxRequired,
      isSenior: true,
      reason: `Requires ${minRequired}+ years experience without entry-level context`,
    };
  }

  return {
    min: minRequired,
    max: maxRequired,
    minRequiredYOE: minRequired,
    maxRequiredYOE: maxRequired,
    isSenior: false,
    matches: expMatches,
  };
}

const testCases = [
  {
    title: 'AI Engineer – Generative AI & Agentic AI',
    body: 'Senior professional with around 10 years of total software engineering, architecture, cloud or platform engineering experience. Minimum 3+ years of relevant hands-on AI Engineering experience, including Generative AI and practical LLM-based application delivery.',
    expectedReject: true,
  },
  {
    title: 'AI Engineer',
    body: 'JPID: DLTJP00060241\nInterview Time: Till 2:00 PM\nPositions: 1 Senior\nLocation: Hyderabad, Bangalore, Pune, Chennai\nExperience: 6–10 years\nWork Timing: 11:00 AM – 8:00 PM\nWork Mode: Hybrid\nMax Budget: 25 LPA',
    expectedReject: true,
  },
  {
    title: 'Machine Learning Engineer',
    body: 'Experience: 6–8 Years. Anthropic Claude APIs Exp is Must...',
    expectedReject: true,
  },
  {
    title: 'AI Developer',
    body: 'We are looking for a passionate AI Developer with 5+ years of overall experience...',
    expectedReject: true,
  },
  {
    title: 'Generative AI Developer',
    body: 'Experience: 4+ years. Location: Remote - India',
    expectedReject: true,
  },
  {
    title: 'Forward Deployed Engineering Leader',
    body: 'Lead customer implementations of Microsoft AI',
    expectedReject: true,
  },
  {
    title: 'AI Engineer Intern',
    body: 'We are looking for an AI Engineer Intern with 0-1 years of experience in Python and PyTorch. Freshers welcome.',
    expectedReject: false,
  },
  {
    title: 'Junior AI Engineer',
    body: 'Role requires 0-2 years of experience in machine learning, Python, and LangChain.',
    expectedReject: false,
  },
  {
    title: 'ML Engineer I',
    body: 'Requirements: Bachelor degree in Computer Science. 1-2 years experience with Python.',
    expectedReject: false,
  },
];

let allPassed = true;
for (const tc of testCases) {
  const res = parseYearsOfExperience(tc.body, tc.title);
  const isRejected = res.isSenior || res.minRequiredYOE > 3;
  const passTest = isRejected === tc.expectedReject;
  if (!passTest) allPassed = false;
  console.log(`[${passTest ? 'PASS' : 'FAIL'}] "${tc.title}" -> isSenior: ${res.isSenior}, minRequiredYOE: ${res.minRequiredYOE}, Reason: ${res.reason || 'OK'} (Expected Reject: ${tc.expectedReject}, Got: ${isRejected})`);
}

console.log(`\nALL TESTS PASSED: ${allPassed}`);
