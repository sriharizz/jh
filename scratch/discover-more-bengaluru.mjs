import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createLinkedInContext, evaluateAuthStatus } from '../scripts/linkedin/linkedin-session.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const CACHE_FILE = resolve(ROOT_DIR, 'data/linkedin-seen.json');
const QUEUE_FILE = resolve(ROOT_DIR, 'data/linkedin-queue.json');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const baseFilter = 'f_TPR=r604800&sortBy=DD'; // Past 7 days, latest first

const searchQueries = [
  {
    lane: 'Bengaluru — Forward Deployed AI & FDE',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22Forward%20Deployed%22%20OR%20%22FDE%22&geoId=105214831&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — AI Developer & GenAI Developer',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22AI%20Developer%22%20OR%20%22GenAI%20Developer%22&geoId=105214831&f_E=1,2,3&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — LangGraph & Multi-Agent Systems',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22LangGraph%22%20OR%20%22Multi-Agent%22%20OR%20%22Agentic%22&geoId=105214831&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — AI Research Intern & Deep Learning Intern',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22AI%20Research%20Intern%22%20OR%20%22Deep%20Learning%20Intern%22%20OR%20%22NLP%20Intern%22&geoId=105214831&f_JT=I&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — Computer Vision & GenAI Intern',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22Computer%20Vision%20Intern%22%20OR%20%22GenAI%20Intern%22&geoId=105214831&f_JT=I&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — Software Engineer AI / ML (< 3 YOE)',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22Software%20Engineer%22%20AND%20(%22AI%22%20OR%20%22ML%22%20OR%20%22LLM%22)&geoId=105214831&f_E=1,2,3&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — Associate Data Scientist & AI Trainee',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22Associate%20Data%20Scientist%22%20OR%20%22AI%20Trainee%22&geoId=105214831&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — RAG & LLM Application Engineer',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22RAG%22%20OR%20%22LLM%20Application%22&geoId=105214831&f_E=1,2,3&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — AI Solutions & Applied ML Engineer',
    url: `https://www.linkedin.com/jobs/search/?keywords=%22AI%20Solutions%20Engineer%22%20OR%20%22Applied%20ML%22&geoId=105214831&f_E=1,2,3&${baseFilter}`,
  },
  {
    lane: 'Bengaluru — Fresh Graduate & Entry Level AI',
    url: `https://www.linkedin.com/jobs/search/?keywords=AI%20Fresher%20OR%20%22Entry%20Level%20AI%22%20OR%20%22Graduate%20AI%22&geoId=105214831&${baseFilter}`,
  },
];

function triageCard(card) {
  const title = (card.title || '').toLowerCase();
  const loc = (card.location || '').toLowerCase();

  if (/\b(staff|principal|head of|vp|director|group manager|architect|partner|chief|distinguished)\b/i.test(title)) {
    return false;
  }
  if (/\b(sales|marketing|recruiter|hr|talent|business development|bde|sdr|social media|video|filmmaking|creative|graphic|content|writer|accountant|lawyer|operations|support|executive|psychology)\b/i.test(title)) {
    return false;
  }
  const isBengaluru = loc.includes('bengaluru') || loc.includes('bangalore') || loc.includes('karnataka');
  if (!isBengaluru && loc.length > 2) return false;

  return true;
}

function evaluateFit(job) {
  const title = (job.title || '').toLowerCase();
  const desc = (job.description || '').toLowerCase().replace(/[–—−]/g, '-');
  const loc = (job.location || '').toLowerCase();

  let fitScore = 50;
  const keyMatches = [];
  const blockers = [];

  if (title.includes('ai engineer') || title.includes('applied ai') || title.includes('genai') || title.includes('agentic')) {
    fitScore += 20;
    keyMatches.push('Primary Target Title (AI/GenAI Engineer)');
  } else if (title.includes('machine learning') || title.includes('ml engineer')) {
    fitScore += 15;
    keyMatches.push('Target Title (ML Engineer)');
  }

  const expMatches = [];
  const pGeneral = /\b(?:around|approx(?:imately)?|about|at\s*least|minimum|min\.?|up\s*to|over)?\s*(\d+)(?:\s*(?:-|to)\s*(\d+)|\+)?\s*(?:years?|yrs?|yoe)\b(?:\s*(?:of\s*)?(?:relevant|hands-on|overall|industry|professional|work)?\s*experience)?/gi;
  let m;
  while ((m = pGeneral.exec(desc)) !== null) {
    const num1 = parseInt(m[1], 10);
    const num2 = m[2] ? parseInt(m[2], 10) : num1;
    if (!isNaN(num1) && num1 >= 0 && num1 <= 35) {
      expMatches.push({ min: num1, max: num2, raw: m[0] });
    }
  }

  const hasSeniorLeadershipTitle = /\b(lead\b|principal\b|staff\b|architect\b|director\b|head of\b|leader\b|manager\b|vp\b|vice president\b|chief\b)/i.test(title);
  const seniorExpMatch = expMatches.find((e) => e.min >= 4);

  if (seniorExpMatch || hasSeniorLeadershipTitle) {
    return { fitScore: 0, blockers: ['Seniority requirement in JD (>= 4 yrs)'] };
  }

  const minRequiredYOE = expMatches.length > 0 ? Math.min(...expMatches.map((e) => e.min)) : 0;
  const isIntern = title.includes('intern') || (job.employmentType || '').toLowerCase().includes('intern') || desc.includes('internship');
  const isFresher = title.includes('graduate') || title.includes('entry') || title.includes('junior') || title.includes('associate') || desc.includes('0-1') || desc.includes('0-2') || minRequiredYOE <= 2;

  if (isIntern) {
    fitScore += 30;
    keyMatches.push('🎓 Tier 1: Internship (PPO/FTE potential)');
  } else if (isFresher) {
    fitScore += 30;
    keyMatches.push('🎯 Tier 1: 0-2 YOE / Entry-level role');
  } else if (minRequiredYOE === 3) {
    fitScore += 15;
    keyMatches.push('🚀 Tier 1 / Priority: 2-3 YOE Target Profile');
  }

  const ageStr = (job.ageText || '').toLowerCase();
  if (/\b(hour|minute|just now|today|0 days|1 day)\b/i.test(ageStr)) {
    fitScore += 25;
    keyMatches.push('⚡ Freshly Posted (< 24h / Early Applicant)');
  } else {
    fitScore += 10;
    keyMatches.push('📅 Recent Posting (Past 7 Days)');
  }

  if (/langgraph|multi[- ]agent|agentic|state machine|workflow/i.test(desc)) {
    fitScore += 15;
    keyMatches.push('LangGraph / Multi-Agent Systems');
  }
  if (/fastapi|python|asyncio|pydantic/i.test(desc)) {
    fitScore += 10;
    keyMatches.push('Python / FastAPI / Asyncio');
  }
  if (/rag|pgvector|vector|faiss|retrieval|embeddings/i.test(desc)) {
    fitScore += 10;
    keyMatches.push('RAG / Vector Databases');
  }
  if (/azure openai|openai|groq|llama|llm|generative ai/i.test(desc)) {
    fitScore += 8;
    keyMatches.push('LLMOps / GenAI Architectures');
  }
  if (/evaluation|eval|testing|benchmarking|langsmith/i.test(desc)) {
    fitScore += 8;
    keyMatches.push('AI Evaluation & Testing');
  }

  return {
    fitScore,
    locationTier: 'Tier 1 (Bengaluru)',
    keyMatches,
    blockers,
  };
}

async function run() {
  console.log('--- Launching Targeted Expansion Search for Bengaluru Tier 1 ---');
  const seenCache = existsSync(CACHE_FILE) ? JSON.parse(readFileSync(CACHE_FILE, 'utf-8')) : {};
  let existingQueue = existsSync(QUEUE_FILE) ? JSON.parse(readFileSync(QUEUE_FILE, 'utf-8')) : [];
  const existingJobIds = new Set(existingQueue.map((q) => q.jobId));

  const ctx = await createLinkedInContext({ headless: true });
  const page = await ctx.newPage();

  const candidateCards = [];

  try {
    for (const q of searchQueries) {
      console.log(`\n• Querying Lane: "${q.lane}"...`);
      await page.goto(q.url, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await sleep(2000);

      const auth = await evaluateAuthStatus(page);
      if (auth.status === 'checkpoint' || auth.status === 'login_required') {
        console.error('Session error, stopping.');
        break;
      }

      for (let s = 0; s < 12; s++) {
        await page.evaluate(() => {
          const scroller = document.querySelector('.jobs-search-results-list, .scaffold-layout__list-detail-inner, main') || window;
          if (scroller.scrollBy) scroller.scrollBy(0, 800);
          else window.scrollBy(0, 800);
        });
        await sleep(350);
      }
      await sleep(1000);

      const cards = await page.evaluate(() => {
        const items = document.querySelectorAll('li.jobs-search-results__list-item, div.job-card-container, div.base-card, div[data-job-id]');
        const results = [];
        items.forEach((item) => {
          const titleEl = item.querySelector('.job-card-list__title, a.job-card-container__link, h3, a.base-card__full-link');
          const companyEl = item.querySelector('.job-card-container__primary-description, .artdeco-entity-lockup__subtitle, .base-search-card__subtitle, h4, span.job-card-container__company-name');
          const locEl = item.querySelector('.job-card-container__metadata-item, .job-search-card__location, span.job-card-container__metadata-wrapper');
          const linkEl = item.querySelector('a[href*="/jobs/view/"]');
          const isEasyApply = Boolean(item.querySelector('.job-card-container__easy-apply-text, svg[data-test-icon*="easy-apply"]'));
          const timeEl = item.querySelector('time, .job-search-card__listdate, .job-card-container__listed-time, .base-search-card__metadata');
          const postedTime = timeEl ? (timeEl.getAttribute('datetime') || timeEl.innerText.trim()) : '';

          const href = linkEl ? linkEl.href : '';
          const m = href.match(/\/jobs\/view\/(\d+)/);
          const jobId = m ? m[1] : '';

          if (jobId && titleEl) {
            results.push({
              jobId,
              title: titleEl.innerText.trim(),
              company: companyEl ? companyEl.innerText.trim() : '',
              location: locEl ? locEl.innerText.trim() : '',
              url: `https://www.linkedin.com/jobs/view/${jobId}/`,
              easyApply: isEasyApply,
              postedTime,
            });
          }
        });
        return results;
      });

      console.log(`  Found ${cards.length} cards in lane.`);

      for (const card of cards) {
        if (seenCache[card.jobId] && seenCache[card.jobId].status === 'APPLIED') continue;
        if (existingJobIds.has(card.jobId)) continue;
        if (!triageCard(card)) continue;
        if (!candidateCards.some((c) => c.jobId === card.jobId)) {
          candidateCards.push(card);
        }
      }
    }

    console.log(`\nFound ${candidateCards.length} candidate cards for deep inspection.`);
    const toInspect = candidateCards.slice(0, 45);

    for (let i = 0; i < toInspect.length; i++) {
      const card = toInspect[i];
      console.log(`[${i + 1}/${toInspect.length}] Inspecting: ${card.company} — ${card.title}`);
      try {
        await page.goto(card.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(1200);

        const details = await page.evaluate(() => {
          const descEl = document.querySelector('.jobs-description__content, #job-details, .jobs-box__html-content, .description__text');
          const companyEl = document.querySelector('div.job-details-jobs-unified-top-card__company-name a, span.job-details-jobs-unified-top-card__company-name a, div.job-details-jobs-unified-top-card__company-name, .topcard__flavor');
          const titleEl = document.querySelector('h1.job-details-jobs-unified-top-card__job-title, h1.t-24, h1.topcard__title, h1');
          const locEl = document.querySelector('div.job-details-jobs-unified-top-card__primary-description-container span, span.job-details-jobs-unified-top-card__bullet + span');
          const pageText = document.body.innerText.toLowerCase();

          let hasEasyApply = false;
          for (const btn of Array.from(document.querySelectorAll('button, a'))) {
            const txt = (btn.innerText || '').toLowerCase();
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (txt.includes('easy apply') || aria.includes('easy apply')) {
              hasEasyApply = true;
              break;
            }
          }

          let followersCount = null;
          const fm = pageText.match(/([\d,]+(?:\.\d+)?)\s*(k|m|thousand|million)?\s*followers/i);
          if (fm) {
            let n = parseFloat(fm[1].replace(/,/g, ''));
            const u = (fm[2] || '').toLowerCase();
            if (u.startsWith('k') || u.startsWith('thous')) n *= 1000;
            else if (u.startsWith('m')) n *= 1000000;
            followersCount = n;
          }

          let employeeCount = null;
          const em = pageText.match(/([\d,]+(?:\+)?(?:\s*-\s*[\d,]+)?)\s+employees/i);
          if (em) employeeCount = em[0];

          return {
            description: descEl ? descEl.innerText : '',
            company: companyEl ? companyEl.innerText.trim() : '',
            title: titleEl ? titleEl.innerText.trim() : '',
            location: locEl ? locEl.innerText.trim() : '',
            hasEasyApply,
            followersCount,
            employeeCount,
          };
        });

        const finalCompany = details.company || card.company;
        const finalTitle = details.title || card.title;
        const finalLocation = details.location || card.location || 'Bengaluru, Karnataka, India';

        const isCredible = (details.followersCount && details.followersCount >= 500) || (details.employeeCount && !details.employeeCount.startsWith('1-'));
        if (!isCredible) {
          console.log(`  ❌ Excluded: Unverified company / < 500 followers`);
          continue;
        }

        const credText = details.followersCount ? `${Math.round(details.followersCount).toLocaleString()} followers` : (details.employeeCount || 'Verified company');

        let ageText = card.postedTime || 'Recent';
        const pageAll = (details.description + ' ' + (card.postedTime || '')).toLowerCase();
        if (/(?:today|just now|\d+\s*hours?\s*ago|\d+\s*minutes?\s*ago)/i.test(pageAll)) {
          ageText = '0 days (< 24h)';
        } else if (/(?:yesterday|1\s*day\s*ago)/i.test(pageAll)) {
          ageText = '1 day ago';
        } else if (/(\d+)\s+days?\s+ago/i.test(pageAll)) {
          const d = pageAll.match(/(\d+)\s+days?\s+ago/i);
          ageText = `${d[1]} days ago`;
        }

        const fit = evaluateFit({
          title: finalTitle,
          description: details.description,
          location: finalLocation,
          easyApply: details.hasEasyApply || card.easyApply,
          ageText,
        });

        if (fit.fitScore >= 50 && fit.blockers.length === 0) {
          console.log(`  ✅ Passed: ${finalCompany} — ${finalTitle} (Score: ${fit.fitScore})`);
          existingQueue.push({
            jobId: card.jobId,
            company: finalCompany,
            title: finalTitle,
            location: finalLocation,
            locationTier: 'Tier 1 (Bengaluru)',
            url: card.url,
            applicationType: (details.hasEasyApply || card.easyApply) ? 'Easy Apply' : 'External ATS',
            ageText,
            fitScore: fit.fitScore,
            credibility: `🟢 ${credText}`,
            keyMatches: fit.keyMatches,
            blockers: fit.blockers,
          });
          existingJobIds.add(card.jobId);
        } else {
          console.log(`  ❌ Rejected: ${fit.blockers.join(', ') || 'Fit score < 50'}`);
        }
      } catch (err) {
        console.log(`  ⚠️ Error inspecting ${card.jobId}: ${err.message}`);
      }
    }

    existingQueue.sort((a, b) => b.fitScore - a.fitScore);
    writeFileSync(QUEUE_FILE, JSON.stringify(existingQueue, null, 2), 'utf-8');
    console.log(`\n🎉 Total Queue now has ${existingQueue.length} verified Tier 1 Bengaluru roles in ${QUEUE_FILE}!`);

  } finally {
    await ctx.close().catch(() => {});
  }
}

run().catch(console.error);
