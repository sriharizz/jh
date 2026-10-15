#!/usr/bin/env node

/**
 * scripts/ide-scheduler-daemon.mjs
 *
 * In-IDE Long-Running Scheduler Daemon for Career-Ops.
 * Replaces Windows Task Scheduler completely.
 *
 * Timetable (Indian Standard Time - Asia/Kolkata):
 * - Morning Pulse: 08:30 AM Daily (--mode morning)
 * - Night Sweep:   09:50 PM (21:50) Daily (--mode night)
 *
 * State is persisted in data/scheduler-state.json so jobs never double-run or collide.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, '..');

const STATE_FILE = resolve(ROOT_DIR, 'data/scheduler-state.json');
const LOG_FILE = resolve(ROOT_DIR, 'data/scheduler-daemon.log');

// Target Times (IST)
const SCHEDULE = {
  morning: { hour: 8, minute: 30, mode: 'morning', label: 'Morning Pulse (08:30 AM)' },
  night:   { hour: 21, minute: 50, mode: 'night', label: 'Night Multi-Platform Sweep (09:50 PM)' }
};

function log(msg) {
  const ts = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const line = `[${ts}] ${msg}\n`;
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_FILE, line, 'utf-8');
  } catch {}
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    } catch {}
  }
  return { lastMorningDate: null, lastNightDate: null, running: false };
}

function saveState(state) {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    log(`⚠️ Failed to save scheduler state: ${err.message}`);
  }
}

function getISTDateParts() {
  const formatter = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    dateStr: `${map.year}-${map.month}-${map.day}`,
    hour: parseInt(map.hour, 10),
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10)
  };
}

let activeChild = null;

function runOrchestrator(mode, label) {
  return new Promise((resolve) => {
    log(`🚀 Triggering Scheduled Run: ${label} [Mode: ${mode}]...`);
    const scriptPath = resolve(ROOT_DIR, 'scripts/daily-job-orchestrator.mjs');

    activeChild = spawn(process.execPath, [scriptPath, '--mode', mode], {
      cwd: ROOT_DIR,
      env: { ...process.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    activeChild.stdout.on('data', (data) => {
      const txt = data.toString();
      try { fs.appendFileSync(LOG_FILE, txt, 'utf-8'); } catch {}
    });

    activeChild.stderr.on('data', (data) => {
      const txt = data.toString();
      try { fs.appendFileSync(LOG_FILE, `[ERR] ${txt}`, 'utf-8'); } catch {}
    });

    activeChild.on('close', (code) => {
      log(`🏁 Scheduled Run ${label} finished with exit code ${code}.`);
      activeChild = null;
      resolve(code === 0);
    });

    activeChild.on('error', (err) => {
      log(`❌ Failed to start scheduled child process: ${err.message}`);
      activeChild = null;
      resolve(false);
    });
  });
}

async function tick() {
  const state = loadState();
  if (state.running) {
    // A job is currently executing
    return;
  }

  const { dateStr, hour, minute } = getISTDateParts();

  // Check Morning Trigger: 08:30 AM (between 08:30 and 08:45)
  if (hour === SCHEDULE.morning.hour && minute >= SCHEDULE.morning.minute && minute < SCHEDULE.morning.minute + 15) {
    if (state.lastMorningDate !== dateStr) {
      state.running = true;
      state.lastMorningDate = dateStr;
      saveState(state);

      await runOrchestrator(SCHEDULE.morning.mode, SCHEDULE.morning.label);

      state.running = false;
      saveState(state);
      return;
    }
  }

  // Check Night Trigger: 09:50 PM / 21:50 (between 21:50 and 22:05)
  if (hour === SCHEDULE.night.hour && minute >= SCHEDULE.night.minute && minute < SCHEDULE.night.minute + 15) {
    if (state.lastNightDate !== dateStr) {
      state.running = true;
      state.lastNightDate = dateStr;
      saveState(state);

      await runOrchestrator(SCHEDULE.night.mode, SCHEDULE.night.label);

      state.running = false;
      saveState(state);
      return;
    }
  }
}

log(`======================================================`);
log(` Career-Ops IDE Scheduler Daemon Started`);
log(` Schedule: Morning @ 08:30 AM IST | Night @ 09:50 PM IST`);
log(` Timezone: Asia/Kolkata`);
log(` Working Directory: ${ROOT_DIR}`);
log(`======================================================`);

// Run loop every 20 seconds
setInterval(() => {
  tick().catch((err) => log(`Tick error: ${err.message}`));
}, 20000);

// Run initial tick immediately
tick().catch((err) => log(`Initial tick error: ${err.message}`));
