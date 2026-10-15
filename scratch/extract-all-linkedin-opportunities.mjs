import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const APPS_FILE = resolve('data/applications.md');
const LINKEDIN_SEEN = resolve('data/linkedin-seen.json');
const LINKEDIN_QUEUE = resolve('data/linkedin-queue.json');
const SCAN_HISTORY = resolve('data/scan-history.tsv');

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

function run() {
  const { urls: appliedUrls, companies: appliedCompanies } = getApplied();
  const allJobs = new Map();

  // 1. Load from LINKEDIN_QUEUE
  if (existsSync(LINKEDIN_QUEUE)) {
    try {
      const queue = JSON.parse(readFileSync(LINKEDIN_QUEUE, 'utf-8'));
      for (const item of queue) {
        if (!allJobs.has(item.url)) {
          allJobs.set(item.url, {
            title: item.title,
            company: item.company,
            location: item.location || 'Bengaluru / India / Remote',
            url: item.url,
            type: item.applicationType || 'Easy Apply',
            fitScore: item.fitScore || 90,
            matches: item.keyMatches || []
          });
        }
      }
    } catch {}
  }

  // 2. Load from LINKEDIN_SEEN
  if (existsSync(LINKEDIN_SEEN)) {
    try {
      const seen = JSON.parse(readFileSync(LINKEDIN_SEEN, 'utf-8'));
      for (const [key, val] of Object.entries(seen)) {
        if (!key.startsWith('http')) continue;
        if (val.status === 'APPLIED') continue;
        const normComp = (val.company || '').toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').trim();
        if (appliedCompanies.has(normComp) || appliedUrls.has(key)) continue;

        const titleLower = (val.title || '').toLowerCase();
        if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief)\b/i.test(titleLower)) continue;
        if (/\b(sales|marketing|recruiter|hr|talent|bde|sdr|accountant|writer|graphic|operations|support)\b/i.test(titleLower)) continue;
        if (!/\b(ai|ml|genai|llm|agent|fde|machine learning|python|data science|nlp|vision|intern)\b/i.test(titleLower)) continue;

        if (!allJobs.has(key)) {
          allJobs.set(key, {
            title: val.title,
            company: val.company,
            location: 'Bengaluru / India / Remote',
            url: key,
            type: 'LinkedIn Easy Apply / Direct',
            fitScore: 85,
            matches: ['AI / ML Alignment', '0-3 YOE Target']
          });
        }
      }
    } catch {}
  }

  // 3. Load from SCAN_HISTORY (LinkedIn URLs)
  if (existsSync(SCAN_HISTORY)) {
    try {
      const lines = readFileSync(SCAN_HISTORY, 'utf-8').split('\n');
      for (const line of lines) {
        if (!line.includes('linkedin.com/jobs/view/')) continue;
        const parts = line.split('\t');
        const url = parts[0]?.trim();
        const title = parts[3]?.trim();
        const company = parts[4]?.trim();
        const loc = parts[6]?.trim();

        if (!url || allJobs.has(url) || appliedUrls.has(url)) continue;
        const normComp = (company || '').toLowerCase().replace(/\s+(inc|pvt|ltd|llp|technologies|solutions|corp)\.?$/i, '').trim();
        if (appliedCompanies.has(normComp)) continue;

        const titleLower = (title || '').toLowerCase();
        if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief)\b/i.test(titleLower)) continue;
        if (/\b(sales|marketing|recruiter|hr|talent|bde|sdr|accountant|writer|graphic|operations|support)\b/i.test(titleLower)) continue;
        if (!/\b(ai|ml|genai|llm|agent|fde|machine learning|python|data science|nlp|vision|intern)\b/i.test(titleLower)) continue;

        allJobs.set(url, {
          title,
          company,
          location: loc || 'Bengaluru / India / Remote',
          url,
          type: 'LinkedIn Apply',
          fitScore: 85,
          matches: ['AI Engineering', '0-3 YOE Target']
        });
      }
    } catch {}
  }

  const results = Array.from(allJobs.values());
  console.log(`Found ${results.length} total verified LinkedIn roles:\n`);
  console.log(JSON.stringify(results.slice(0, 35), null, 2));
}

run();
