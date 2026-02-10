/**
 * v3 Smart Server Monitoring — degradation alerts via Telegram.
 * Does NOT restart services. Only sends alerts via notifyAdmins().
 * State stored in /var/tmp/ziyomed-monitor-state.json; alerts only on state change.
 */

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

function loadEnv(): void {
  const candidates = [
    path.join(process.cwd(), '.env'),
    path.join(__dirname, '..', '..', '.env'),
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf8');
      for (const line of content.split('\n')) {
        const match = line.match(/^([^#=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let val = match[2].trim();
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1);
          }
          process.env[key] = val;
        }
      }
      return;
    }
  }
}

loadEnv();

import { notifyAdmins } from '../modules/ops/serverNotifier';

const STATE_PATH = '/var/tmp/ziyomed-monitor-state.json';
const CMD_TIMEOUT_MS = 5000;
const HOST_NAME = (process.env.MONITOR_HOST_NAME ?? 'ziyomed.com').trim() || 'ziyomed.com';

type Level = 'OK' | 'WARNING' | 'CRITICAL';

interface MonitorState {
  load: Level;
  memory: Level;
  disk: Level;
  pm2Restarts: Record<string, number>;
}

const DEFAULT_STATE: MonitorState = {
  load: 'OK',
  memory: 'OK',
  disk: 'OK',
  pm2Restarts: {},
};

function trim(s: string): string {
  return String(s).trim();
}

function readState(): MonitorState {
  try {
    const raw = fs.readFileSync(STATE_PATH, 'utf8');
    const data = JSON.parse(raw) as Partial<MonitorState>;
    return {
      load: data.load === 'WARNING' || data.load === 'CRITICAL' ? data.load : 'OK',
      memory: data.memory === 'WARNING' || data.memory === 'CRITICAL' ? data.memory : 'OK',
      disk: data.disk === 'WARNING' || data.disk === 'CRITICAL' ? data.disk : 'OK',
      pm2Restarts: typeof data.pm2Restarts === 'object' && data.pm2Restarts ? data.pm2Restarts : {},
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function writeState(state: MonitorState): void {
  try {
    fs.mkdirSync(path.dirname(STATE_PATH), { recursive: true });
    fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (err) {
    console.warn('[check-degradation] writeState:', err instanceof Error ? err.message : err);
  }
}

async function runCmd(command: string): Promise<string> {
  const { stdout } = await execAsync(command, {
    timeout: CMD_TIMEOUT_MS,
    maxBuffer: 64 * 1024,
  });
  return trim(stdout ?? '');
}

// ——— A) Load ———
async function getLoad1m(): Promise<number | null> {
  try {
    const out = await runCmd('cat /proc/loadavg');
    const parts = trim(out).split(/\s+/);
    const load1 = parseFloat(parts[0]);
    return Number.isFinite(load1) ? load1 : null;
  } catch {
    return null;
  }
}

function loadLevel(load1: number, cores: number): Level {
  if (load1 > cores * 2.5) return 'CRITICAL';
  if (load1 > cores * 1.5) return 'WARNING';
  return 'OK';
}

// ——— B) Memory ———
async function getMemoryUsedPercent(): Promise<number | null> {
  try {
    const out = await runCmd('free -m');
    const lines = out.split('\n').map(trim);
    // Mem: total used free shared buff/cache available
    const memLine = lines.find((l) => l.startsWith('Mem:'));
    if (!memLine) return null;
    const parts = memLine.split(/\s+/).filter(Boolean);
    if (parts.length < 3) return null;
    const total = parseInt(parts[1], 10);
    const used = parseInt(parts[2], 10);
    if (!Number.isFinite(total) || !Number.isFinite(used) || total <= 0) return null;
    return Math.round((used / total) * 100);
  } catch {
    return null;
  }
}

function memoryLevel(pct: number): Level {
  if (pct > 90) return 'CRITICAL';
  if (pct > 80) return 'WARNING';
  return 'OK';
}

// ——— C) Disk ———
async function getDiskUsedPercent(): Promise<number | null> {
  try {
    const out = await runCmd('df -h /');
    const lines = out.split('\n').map(trim);
    // header then row: ... 50% ...
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/(\d+)%/);
      if (match) return parseInt(match[1], 10);
    }
    return null;
  } catch {
    return null;
  }
}

function diskLevel(pct: number): Level {
  if (pct > 95) return 'CRITICAL';
  if (pct > 85) return 'WARNING';
  return 'OK';
}

// ——— D) PM2 restarts ———
const PM2_PROCESS_NAMES = ['exam-api', 'exam-web', 'ziyoda-bot'];

async function getPm2RestartTimes(): Promise<Record<string, number>> {
  try {
    const out = await runCmd('PM2_NO_COLOR=true pm2 jlist');
    const arr = JSON.parse(out) as unknown[];
    if (!Array.isArray(arr)) return {};
    const result: Record<string, number> = {};
    for (const p of arr) {
      const name = (p as { name?: string }).name;
      const restartTime = (p as { pm2_env?: { restart_time?: number } }).pm2_env?.restart_time ?? 0;
      if (name && PM2_PROCESS_NAMES.includes(name)) {
        result[name] = restartTime;
      }
    }
    return result;
  } catch {
    return {};
  }
}

function buildAlertHtml(
  severity: 'CRITICAL' | 'WARNING' | 'RECOVERED',
  issue: string,
  value: string,
  threshold: string
): string {
  const now = new Date().toISOString();
  if (severity === 'RECOVERED') {
    return (
      `✅ <b>SERVER RECOVERED</b>\n\n` +
      `<b>Issue:</b> ${issue}\n` +
      `<b>Value:</b> ${value}\n\n` +
      `<b>Host:</b> ${HOST_NAME}\n` +
      `<b>Time:</b> ${now}`
    );
  }
  const emoji = severity === 'CRITICAL' ? '🛑' : '⚠️';
  const title = severity === 'CRITICAL' ? 'SERVER CRITICAL' : 'SERVER WARNING';
  return (
    `${emoji} <b>${title}</b>\n\n` +
    `<b>Issue:</b> ${issue}\n` +
    `<b>Value:</b> ${value}\n` +
    `<b>Threshold:</b> ${threshold}\n\n` +
    `<b>Host:</b> ${HOST_NAME}\n` +
    `<b>Time:</b> ${now}`
  );
}

async function main(): Promise<void> {
  const cores = os.cpus().length;
  const prev = readState();
  const next: MonitorState = {
    load: 'OK',
    memory: 'OK',
    disk: 'OK',
    pm2Restarts: { ...prev.pm2Restarts },
  };

  // A) Load
  const load1 = await getLoad1m();
  if (load1 !== null) {
    next.load = loadLevel(load1, cores);
    if (next.load !== prev.load) {
      if (next.load === 'OK') {
        await notifyAdmins(buildAlertHtml('RECOVERED', 'CPU / Load', `${load1.toFixed(2)} (1m)`, '—'));
      } else {
        const threshold = next.load === 'CRITICAL' ? `> ${cores * 2.5}` : `> ${cores * 1.5}`;
        await notifyAdmins(
          buildAlertHtml(next.load, 'High load average', `${load1.toFixed(2)} (1m)`, threshold)
        );
      }
    }
  }

  // B) Memory
  const memPct = await getMemoryUsedPercent();
  if (memPct !== null) {
    next.memory = memoryLevel(memPct);
    if (next.memory !== prev.memory) {
      if (next.memory === 'OK') {
        await notifyAdmins(buildAlertHtml('RECOVERED', 'High memory usage', `${memPct}%`, '—'));
      } else {
        const threshold = next.memory === 'CRITICAL' ? '> 90%' : '> 80%';
        await notifyAdmins(
          buildAlertHtml(next.memory, 'High memory usage', `${memPct}%`, threshold)
        );
      }
    }
  }

  // C) Disk
  const diskPct = await getDiskUsedPercent();
  if (diskPct !== null) {
    next.disk = diskLevel(diskPct);
    if (next.disk !== prev.disk) {
      if (next.disk === 'OK') {
        await notifyAdmins(buildAlertHtml('RECOVERED', 'High disk usage', `${diskPct}%`, '—'));
      } else {
        const threshold = next.disk === 'CRITICAL' ? '> 95%' : '> 85%';
        await notifyAdmins(
          buildAlertHtml(next.disk, 'High disk usage', `${diskPct}%`, threshold)
        );
      }
    }
  }

  // D) PM2 restarts
  const currentRestarts = await getPm2RestartTimes();
  for (const name of PM2_PROCESS_NAMES) {
    const cur = currentRestarts[name] ?? 0;
    const last = prev.pm2Restarts[name] ?? 0;
    next.pm2Restarts[name] = cur;
    if (cur > last) {
      await notifyAdmins(
        buildAlertHtml(
          'WARNING',
          `PM2 process restarted: ${name}`,
          `restart_time: ${cur}`,
          'increased since last check'
        )
      );
    }
  }

  writeState(next);
}

main().catch((err) => {
  console.warn('[check-degradation]', err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
