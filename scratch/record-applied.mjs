import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = resolve(__dirname, '..');

const seenPath = resolve(ROOT_DIR, 'data/linkedin-seen.json');
let seen = {};
try { seen = JSON.parse(readFileSync(seenPath, 'utf8')); } catch {}

const appliedJobs = [
  { jobId: '4462155421', company: 'Tiger Analytics', title: 'AI Engineer - Data and AI', url: 'https://www.linkedin.com/jobs/view/4462155421/' },
  { jobId: '4462165225', company: 'Tiger Analytics', title: 'AI Engineer - Data and AI (Chennai)', url: 'https://www.linkedin.com/jobs/view/4462165225/' },
  { jobId: '4459209057', company: 'Cyncly', title: 'AI/ML Engineer', url: 'https://www.linkedin.com/jobs/view/4459209057/' },
  { jobId: '4459941781', company: 'Infused Solutions', title: 'Intelligence Data Engineer (AI)', url: 'https://www.linkedin.com/jobs/view/4459941781/' },
  { jobId: '4462736939', company: 'CGI', title: 'AI & Automation Engineer', url: 'https://www.linkedin.com/jobs/view/4462736939/' },
  { jobId: '4462747038', company: 'Quik Hire Staffing', title: 'AI Engineer - Generative AI', url: 'https://www.linkedin.com/jobs/view/4462747038/' },
  { jobId: '4461392105', company: 'Infosys', title: '.Net Full Stack Gen AI Developer', url: 'https://www.linkedin.com/jobs/view/4461392105/' },
  { jobId: '4462724321', company: 'FetchJobs.co', title: 'AI Engineer', url: 'https://www.linkedin.com/jobs/view/4462724321/' },
  { jobId: '4459975467', company: 'AiMi', title: 'Agentic AI Engineer', url: 'https://www.linkedin.com/jobs/view/4459975467/' },
  { jobId: '4451822541', company: 'PwC India', title: 'Azure AI/ML/Agentic AI Engineer', url: 'https://www.linkedin.com/jobs/view/4451822541/' },
  { jobId: '4462134931', company: 'Innova ESI', title: 'Generative AI / Agentic AI Engineer (Python)', url: 'https://www.linkedin.com/jobs/view/4462134931/' },
  { jobId: '4462106892', company: 'YMinds.AI', title: 'Agentic AI Engineer', url: 'https://www.linkedin.com/jobs/view/4462106892/' },
  { jobId: '4445476604', company: 'Nielsen', title: 'AI / ML Engineer II / III', url: 'https://www.linkedin.com/jobs/view/4445476604/' },
  { jobId: '4459909276', company: 'ACROSSTEK™', title: 'AI/ML Engineer', url: 'https://www.linkedin.com/jobs/view/4459909276/' },
  { jobId: '4462044724', company: 'Solventum', title: 'Associate AI/ML Engineer', url: 'https://www.linkedin.com/jobs/view/4462044724/' },
  { jobId: '4462485297', company: 'MSD', title: 'Specialist, Full-Stack GenAI & Agentic AI', url: 'https://www.linkedin.com/jobs/view/4462485297/' },
  { jobId: '4461379529', company: 'Mercor', title: 'Customer Success Engineer - AI SaaS', url: 'https://www.linkedin.com/jobs/view/4461379529/' },
  { jobId: '4461713455', company: 'CoffeeBeans', title: 'Agentic AI Engineer', url: 'https://www.linkedin.com/jobs/view/4461713455/' },
  { jobId: '4460238637', company: 'Multiscale AI', title: 'Agentic AI Engineer', url: 'https://www.linkedin.com/jobs/view/4460238637/' }
];

appliedJobs.forEach(job => {
  seen[job.jobId] = { jobId: job.jobId, title: job.title, company: job.company, status: 'APPLIED', date: '2026-09-04' };
  seen[job.url] = { jobId: job.jobId, title: job.title, company: job.company, status: 'APPLIED', date: '2026-09-04' };
});
writeFileSync(seenPath, JSON.stringify(seen, null, 2), 'utf8');

const appPath = resolve(ROOT_DIR, 'data/applications.md');
let appMd = readFileSync(appPath, 'utf8').trim();
const rows = appliedJobs.map(job => `| 2026-09-04 | ${job.company} | ${job.title} | 95/100 | Applied | [PDF](../output/Banda_Sri_Hari_CV.pdf) | [URL](${job.url}) | LinkedIn |`).join('\n');
writeFileSync(appPath, appMd + '\n' + rows + '\n', 'utf8');
console.log(`Successfully recorded ${appliedJobs.length} applied jobs in tracker and seen cache!`);
