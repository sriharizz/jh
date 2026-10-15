#!/usr/bin/env node

/**
 * scripts/record-master-queue-applied.mjs
 *
 * Appends all roles in data/daily-master-queue.md to data/applications.md as Applied
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const QUEUE_FILE = resolve(ROOT_DIR, 'data/daily-master-queue.md');
const TRACKER_FILE = resolve(ROOT_DIR, 'data/applications.md');
const PDF_PATH = 'output/Banda_Sri_Hari_CV.pdf';
const TODAY = '2026-08-26';

function main() {
  if (!existsSync(QUEUE_FILE)) {
    console.error('Master queue file not found.');
    return;
  }

  const text = readFileSync(QUEUE_FILE, 'utf-8');
  const lines = text.split('\n');

  let addedCount = 0;
  let trackerContent = existsSync(TRACKER_FILE) ? readFileSync(TRACKER_FILE, 'utf-8') : '# Applications Tracker\n\n| Date | Company | Role | Score | Status | PDF | Source | Notes |\n|---|---|---|---|---|---|---|---|\n';

  // Read existing lines to avoid duplicate appends
  const existingRows = new Set(trackerContent.split('\n').map((l) => l.trim()));

  lines.forEach((line) => {
    // Format: | 1 | **Company** | Title | 📍 Location | Channel | Fit Score | [Apply Now](url) |
    if (!line.startsWith('|') || line.includes('|---|') || line.includes('| # |')) return;

    const cols = line.split('|').map((s) => s.trim()).filter(Boolean);
    if (cols.length < 6) return;

    let company = cols[1].replace(/\*\*/g, '').trim();
    let title = cols[2].trim();
    let score = cols[5].trim();
    let urlMatch = cols[6] ? cols[6].match(/\((https?:\/\/[^)]+)\)/) : null;
    let url = urlMatch ? urlMatch[1] : '';
    let channel = cols[4] || 'Direct ATS';

    // Cleanup prefix like "1d ago" or "4d ago" if present
    if (company.includes('ago')) {
      const match = title.match(/at\s+(.+)$/i);
      if (match) {
        company = match[1].trim();
        title = title.replace(/\s+at\s+.+$/i, '').trim();
      }
    }

    if (!company || company.toLowerCase() === 'company') return;

    const row = `| ${TODAY} | ${company} | ${title} | ${score} | Applied | [PDF](../${PDF_PATH}) | [URL](${url}) | ${channel} |`;

    if (!existingRows.has(row)) {
      existingRows.add(row);
      trackerContent += `${row}\n`;
      addedCount++;
    }
  });

  writeFileSync(TRACKER_FILE, trackerContent, 'utf-8');
  console.log(`✅ Successfully updated ${TRACKER_FILE}: Added ${addedCount} roles with status Applied.`);
}

main();
