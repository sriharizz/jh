import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const QUEUE_FILE = resolve('data/linkedin-queue.json');
const FRESH_FILE = resolve('scratch/fresh-linkedin-jobs.json');
const APPS_FILE = resolve('data/applications.md');

function getApplied() {
  const urls = new Set();
  const companies = new Set();
  if (existsSync(APPS_FILE)) {
    const lines = readFileSync(APPS_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const matchUrl = line.match(/\(https?:\/\/[^\)]+\)/);
      if (matchUrl) urls.add(matchUrl[0].slice(1, -1).trim());
      const parts = line.split('|').map(s => s.trim());
      if (parts[2]) companies.add(parts[2].toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').trim());
    }
  }
  return { urls, companies };
}

function cleanTitle(title) {
  if (!title) return '';
  let t = title.replace(/\s+with\s+verification$/i, '').replace(/\n/g, ' ').trim();
  // If doubled "AI Engineer AI Engineer", split in half
  const words = t.split(' ');
  if (words.length >= 4 && words.length % 2 === 0) {
    const half = words.length / 2;
    if (words.slice(0, half).join(' ') === words.slice(half).join(' ')) {
      t = words.slice(0, half).join(' ');
    }
  }
  return t;
}

function cleanCompany(comp) {
  if (!comp) return '';
  let c = comp.replace(/\n/g, ' ').trim();
  if (c.includes('|')) c = c.split('|').pop().trim();
  return c;
}

function run() {
  const { urls: appliedUrls, companies: appliedCompanies } = getApplied();
  const masterList = [];
  const seenUrls = new Set();

  // 1. Current Verified Queue
  if (existsSync(QUEUE_FILE)) {
    const queue = JSON.parse(readFileSync(QUEUE_FILE, 'utf-8'));
    for (const j of queue) {
      if (!seenUrls.has(j.url) && !appliedUrls.has(j.url)) {
        seenUrls.add(j.url);
        masterList.push({
          title: cleanTitle(j.title),
          company: cleanCompany(j.company),
          location: j.location || 'Bengaluru, India',
          url: j.url,
          type: j.applicationType?.includes('EASY') ? '🟢 Easy Apply' : '🔵 Direct Apply',
          score: j.fitScore || 95,
          tag: '🎯 Direct Match'
        });
      }
    }
  }

  // Previous 7d verified queue
  const prev7d = [
    { title: 'Python Intern – AI Solutions (PPO)', company: '8byte', location: 'Bengaluru', url: 'https://www.linkedin.com/jobs/view/4458343813/', type: '🟢 Easy Apply', score: 100, tag: '🎓 AI Intern' },
    { title: 'Forward Deployed Engineer - Agentic AI', company: 'C5i', location: 'Bengaluru', url: 'https://www.linkedin.com/jobs/view/4459616679/', type: '🟢 Easy Apply', score: 100, tag: '💼 FDE AI' },
    { title: 'AI Engineer - Generative AI', company: 'Jobs Ai', location: 'Bengaluru / Remote', url: 'https://www.linkedin.com/jobs/view/4459643791/', type: '🟢 Easy Apply', score: 100, tag: '💼 GenAI' },
    { title: 'Python / Python GenAI', company: 'Infosys', location: 'Bengaluru', url: 'https://www.linkedin.com/jobs/view/4458328279/', type: '🟢 Easy Apply', score: 100, tag: '💼 Python GenAI' },
    { title: 'Web Research Specialist (AI, LLM)', company: 'Pro Integrate', location: 'Remote India', url: 'https://www.linkedin.com/jobs/view/4458333953/', type: '🟢 Easy Apply', score: 100, tag: '🌐 Remote AI' },
    { title: 'Agent AI Engineer (temp)', company: 'Equisoft', location: 'Telangana / Remote', url: 'https://www.linkedin.com/jobs/view/4458508925/', type: '🔵 Workday Apply', score: 95, tag: '💼 Agent AI' },
    { title: 'CRM Specialist, AI-first', company: 'The Customization Group', location: 'Bengaluru', url: 'https://www.linkedin.com/jobs/view/4457730605/', type: '🟢 Easy Apply', score: 90, tag: '💼 AI Specialist' },
    { title: 'Junior Machine Learning Engineer', company: 'ClearML', location: 'Bengaluru / Remote', url: 'https://www.linkedin.com/jobs/view/4429572630/', type: '🟢 Easy Apply', score: 90, tag: '🎓 Jr ML' },
    { title: 'AI/ML Model Engineer Intern', company: 'NURY', location: 'Remote India', url: 'https://www.linkedin.com/jobs/view/4452243263/', type: '🟢 Easy Apply', score: 90, tag: '🎓 AI Intern' },
    { title: 'Software Engineer Intern', company: 'Engagezy AI', location: 'Bengaluru / Remote', url: 'https://www.linkedin.com/jobs/view/4452214020/', type: '🟢 Easy Apply', score: 90, tag: '🎓 SWE Intern' },
    { title: 'Python Developer', company: 'Moleculyst', location: 'Bengaluru', url: 'https://www.linkedin.com/jobs/view/4453985687/', type: '🟢 Easy Apply', score: 85, tag: '💼 Python Dev' },
    { title: 'AI - Software Engineer', company: 'KapariAI', location: 'Bengaluru / Remote', url: 'https://www.linkedin.com/jobs/view/4453999452/', type: '🟢 Easy Apply', score: 85, tag: '💼 AI Engineer' }
  ];

  for (const j of prev7d) {
    if (!seenUrls.has(j.url) && !appliedUrls.has(j.url)) {
      seenUrls.add(j.url);
      masterList.push(j);
    }
  }

  // 2. Fresh Fetch
  if (existsSync(FRESH_FILE)) {
    const fresh = JSON.parse(readFileSync(FRESH_FILE, 'utf-8'));
    for (const j of fresh) {
      if (!seenUrls.has(j.url) && !appliedUrls.has(j.url)) {
        const titleLower = j.title.toLowerCase();
        if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief|expert)\b/i.test(titleLower)) continue;
        
        seenUrls.add(j.url);
        masterList.push({
          title: cleanTitle(j.title),
          company: cleanCompany(j.company),
          location: j.location || 'India',
          url: j.url,
          type: j.easyApply,
          score: 85,
          tag: j.lane
        });
      }
    }
  }

  console.log(`Generated ${masterList.length} master LinkedIn roles:`);
  let md = `# Verified LinkedIn Opportunities (0-3 YOE, AI/FDE/Intern)\n\n`;
  md += `| # | Company | Role Title | Location | Type | Link |\n`;
  md += `|---|---|---|---|---|---|\n`;

  masterList.forEach((r, idx) => {
    md += `| ${idx + 1} | **${r.company}** | ${r.title} | 📍 ${r.location} | ${r.type} | [Apply on LinkedIn](${r.url}) |\n`;
  });

  console.log(md);
}

run();
