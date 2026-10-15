import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

const HISTORY_FILE = resolve('data/scan-history.tsv');
const APPS_FILE = resolve('data/applications.md');
const BLACKLIST_FILE = resolve('data/blacklist.md');

function loadApps() {
  const seenUrls = new Set();
  const seenCompanies = new Set();
  if (existsSync(APPS_FILE)) {
    const lines = readFileSync(APPS_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const matchUrl = line.match(/\(https?:\/\/[^\)]+\)/);
      if (matchUrl) {
        seenUrls.add(matchUrl[0].slice(1, -1).trim());
      }
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 4 && parts[2]) {
        seenCompanies.add(parts[2].toLowerCase());
      }
    }
  }
  return { seenUrls, seenCompanies };
}

function loadBlacklist() {
  const bl = new Set();
  if (existsSync(BLACKLIST_FILE)) {
    const lines = readFileSync(BLACKLIST_FILE, 'utf-8').split('\n');
    for (const line of lines) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length >= 3 && parts[1]) {
        bl.add(parts[1].toLowerCase());
      }
    }
  }
  return bl;
}

function run() {
  const { seenUrls, seenCompanies } = loadApps();
  const blacklist = loadBlacklist();

  if (!existsSync(HISTORY_FILE)) {
    console.error('No scan-history.tsv found.');
    return;
  }

  const raw = readFileSync(HISTORY_FILE, 'utf-8');
  const lines = raw.split('\n').filter(l => l.trim().length > 0);
  const header = lines[0].split('\t');
  
  const urlIdx = header.indexOf('url');
  const titleIdx = header.indexOf('title');
  const companyIdx = header.indexOf('company');
  const locIdx = header.indexOf('location');
  const postedIdx = header.indexOf('posted_at');
  const portalIdx = header.indexOf('portal');

  const candidates = [];
  const seenCandidateUrls = new Set();

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split('\t');
    const url = cols[urlIdx]?.trim();
    const title = cols[titleIdx]?.trim() || '';
    const company = cols[companyIdx]?.trim() || '';
    const location = cols[locIdx]?.trim() || '';
    const posted = cols[postedIdx]?.trim() || '';
    const portal = cols[portalIdx]?.trim() || '';

    if (!url || seenCandidateUrls.has(url)) continue;
    seenCandidateUrls.add(url);

    // Skip if already applied
    if (seenUrls.has(url)) continue;

    // Skip if company blacklisted
    const normComp = company.toLowerCase();
    if (blacklist.has(normComp)) continue;

    const titleLower = title.toLowerCase();
    const locLower = location.toLowerCase();

    // Exclude Seniority / Leadership
    if (/\b(senior|sr\.|staff|principal|lead|head of|vp|director|manager|architect|partner|chief|expert|tier 3|level 3|consultant ii)\b/i.test(titleLower)) {
      continue;
    }

    // Exclude Non-AI / Non-Tech
    if (/\b(sales|marketing|recruiter|hr|talent|bde|sdr|accountant|writer|graphic|operations|support|c#|servicenow|ruby|php|sap|salesforce)\b/i.test(titleLower)) {
      continue;
    }

    // Location check: Must be India, Bengaluru, Hyderabad, Pune, Gurgaon, Noida, Remote, Worldwide, Anywhere, APAC
    const isIndiaHub = locLower.includes('bengaluru') || locLower.includes('bangalore') || locLower.includes('hyderabad') || locLower.includes('karnataka') || locLower.includes('telangana') || locLower.includes('pune') || locLower.includes('gurgaon') || locLower.includes('noida') || locLower.includes('mumbai') || locLower.includes('india') || locLower.includes('delhi');
    const isRemoteGlobal = locLower.includes('remote') || locLower.includes('worldwide') || locLower.includes('anywhere') || locLower.includes('apac') || locLower.includes('global');
    const isBlockedForeignOnsite = locLower.includes('united states') || locLower.includes('san francisco') || locLower.includes('new york') || locLower.includes('london') || locLower.includes('seattle') || locLower.includes('germany') || locLower.includes('poland') || locLower.includes('spain') || locLower.includes('costa rica') || locLower.includes('canada');

    if (!isIndiaHub && !isRemoteGlobal) continue;
    if (isBlockedForeignOnsite && !isIndiaHub && !locLower.includes('remote-friendly')) continue;

    // AI / ML / Software focus
    const isAiMl = /\b(ai|ml|machine learning|genai|generative|llm|agent|agentic|langgraph|fde|forward deployed|data science|computer vision|nlp|software engineer|developer|intern)\b/i.test(titleLower);
    if (!isAiMl) continue;

    let fitScore = 60;
    if (/\b(intern|internship|fresher|graduate|junior|entry-level|associate)\b/i.test(titleLower)) fitScore += 25;
    if (/\b(ai engineer|genai|generative ai|agentic|fde|forward deployed|llm)\b/i.test(titleLower)) fitScore += 20;
    if (/\b(machine learning|nlp|computer vision)\b/i.test(titleLower)) fitScore += 15;
    if (isIndiaHub) fitScore += 10;

    candidates.push({
      title,
      company,
      location,
      url,
      posted,
      portal,
      fitScore
    });
  }

  candidates.sort((a, b) => b.fitScore - a.fitScore || (b.posted || '').localeCompare(a.posted || ''));

  console.log(`Found ${candidates.length} relevant unapplied opportunities from scan history:\n`);
  console.log(JSON.stringify(candidates.slice(0, 25), null, 2));
}

run();
