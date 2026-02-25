/**
 * V3 Safe Server Ops Console — read-only whitelist of server commands.
 * No user input, no dynamic commands, no query params.
 * All routes protected by admin middleware (parent router).
 * All exec results pass through cleanOutput().
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { cleanOutput } from './cleanOutput';

const execAsync = promisify(exec);

const EXEC_OPTS = {
  timeout: 10_000,
  maxBuffer: 500 * 1024,
} as const;

const EXEC_CWD = '/opt/exam/exam-platform';
const DEPLOY_CWD = '/opt/exam/exam-platform';
const DEPLOY_CMD = 'git pull origin main && /opt/exam/deploy.sh';
const PM2_BIN = '/usr/bin/pm2';
const DEPLOY_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const MAX_OUTPUT = 4000;

function trimOutput(s: string): string {
  const t = s.trim();
  if (t.length <= MAX_OUTPUT) return t;
  return t.slice(0, MAX_OUTPUT) + '\n[... truncated]';
}

function safeError(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

const PM2_ENV = { ...process.env, PM2_NO_COLOR: 'true' };

async function runCommand(
  res: Response,
  title: string,
  command: string,
  opts?: { env?: Record<string, string>; cwd?: string }
): Promise<void> {
  try {
    const execOpts = {
      ...EXEC_OPTS,
      env: opts?.env ?? process.env,
      cwd: opts?.cwd ?? process.cwd(),
    };
    const { stdout, stderr } = await execAsync(command, execOpts);
    const raw = [stdout, stderr].filter(Boolean).join('\n');
    const output = trimOutput(cleanOutput(raw));
    res.json({ title, output });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title, output: trimOutput(cleanOutput(msg)) });
  }
}

/** Build one-line status: "API: 🟢 Online | RAM 160MB | 2m" */
function formatProcessLine(name: string, status: string, memoryMb: number, uptimeStr: string): string {
  const icon = status === 'online' ? '🟢' : '🔴';
  const statusLabel = status === 'online' ? 'Online' : status;
  return `${name}: ${icon} ${statusLabel} | RAM ${memoryMb}MB | ${uptimeStr}`;
}

/** From pm2 jlist build summarized status lines for API, WEB, BOT. */
function summarizePm2List(raw: unknown[]): string {
  const byName: Record<string, { status: string; memoryMb: number; uptimeSec: number }> = {};
  for (const p of raw) {
    const obj = p as {
      name?: string;
      pm2_env?: { status?: string; pm_uptime?: number };
      monit?: { memory?: number };
    };
    const name = obj.name ?? '';
    const status = obj.pm2_env?.status ?? 'unknown';
    const memBytes = obj.monit?.memory ?? 0;
    const memoryMb = Math.round(memBytes / 1024 / 1024);
    const pmUptime = obj.pm2_env?.pm_uptime;
    const uptimeSec = typeof pmUptime === 'number' ? Math.max(0, Math.floor((Date.now() - pmUptime) / 1000)) : 0;
    byName[name] = { status, memoryMb, uptimeSec };
  }
  const fmtUptime = (sec: number) => {
    if (sec >= 3600) return `${Math.floor(sec / 3600)}h`;
    if (sec >= 60) return `${Math.floor(sec / 60)}m`;
    return `${sec}s`;
  };
  const lines: string[] = [];
  const order = [
    { key: 'exam-api', label: 'API' },
    { key: 'exam-web', label: 'WEB' },
    { key: 'ziyoda-bot', label: 'BOT' },
  ];
  for (const { key, label } of order) {
    const v = byName[key];
    if (v) {
      lines.push(formatProcessLine(label, v.status, v.memoryMb, fmtUptime(v.uptimeSec)));
    } else {
      lines.push(`${label}: 🔴 — | RAM 0MB | —`);
    }
  }
  return lines.join('\n');
}

const router = Router();

router.get('/status', async (req: Request, res: Response) => {
  try {
    const cmd = `PM2_NO_COLOR=true ${PM2_BIN} jlist`;
    const opts = { ...EXEC_OPTS, env: PM2_ENV, cwd: EXEC_CWD };
    const { stdout } = await execAsync(cmd, opts);
    const raw = JSON.parse(stdout) as unknown[];
    if (!Array.isArray(raw)) {
      return res.json({ title: 'Server status', output: 'Unexpected PM2 output format.' });
    }
    const output = summarizePm2List(raw);
    res.json({ title: 'Server status', output });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Server status', output: trimOutput(cleanOutput(msg)) });
  }
});

router.post('/restart-api', async (req: Request, res: Response) => {
  try {
    await execAsync(`${PM2_BIN} restart exam-api`, { ...EXEC_OPTS, env: PM2_ENV, cwd: EXEC_CWD });
    res.json({ title: 'Restart API', output: '✅ API restarted' });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Restart API', output: trimOutput(cleanOutput(msg)) });
  }
});

router.post('/restart-web', async (req: Request, res: Response) => {
  try {
    await execAsync(`${PM2_BIN} restart exam-web`, { ...EXEC_OPTS, env: PM2_ENV, cwd: EXEC_CWD });
    res.json({ title: 'Restart WEB', output: '✅ WEB restarted' });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Restart WEB', output: trimOutput(cleanOutput(msg)) });
  }
});

router.post('/restart-bot', async (req: Request, res: Response) => {
  try {
    await execAsync(`${PM2_BIN} restart ziyoda-bot`, { ...EXEC_OPTS, env: PM2_ENV, cwd: EXEC_CWD });
    res.json({ title: 'Restart BOT', output: '✅ BOT restarted' });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Restart BOT', output: trimOutput(cleanOutput(msg)) });
  }
});

/** Full deploy: git pull + deploy.sh (build + pm2 restart from current release). */
router.post('/deploy', async (req: Request, res: Response) => {
  try {
    const { stdout, stderr } = await execAsync(DEPLOY_CMD, {
      timeout: DEPLOY_TIMEOUT_MS,
      maxBuffer: 2 * 1024 * 1024,
      env: PM2_ENV,
      cwd: DEPLOY_CWD,
    });
    const raw = [stdout, stderr].filter(Boolean).join('\n');
    const output = trimOutput(cleanOutput(raw));
    res.json({ title: 'Deploy', output: output || '✅ Deploy finished' });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Deploy', output: trimOutput(cleanOutput(msg)) });
  }
});

router.get('/uptime', (req: Request, res: Response) => {
  runCommand(res, 'Uptime', 'uptime');
});

router.get('/memory', (req: Request, res: Response) => {
  runCommand(res, 'Memory', 'free -m');
});

router.get('/disk', (req: Request, res: Response) => {
  runCommand(res, 'Disk', 'df -h /');
});

router.get('/load', (req: Request, res: Response) => {
  runCommand(res, 'Load', 'cat /proc/loadavg');
});

router.get('/network', (req: Request, res: Response) => {
  runCommand(res, 'Network', 'ss -tunlp | head -n 30');
});

router.get('/recent-api-errors', (req: Request, res: Response) => {
  runCommand(res, 'API Errors', 'tail -n 80 /root/.pm2/logs/exam-api-error.log');
});

router.get('/recent-web-errors', (req: Request, res: Response) => {
  runCommand(res, 'WEB Errors', 'tail -n 80 /root/.pm2/logs/exam-web-error.log');
});

router.post('/clear-logs', async (req: Request, res: Response) => {
  try {
    await execAsync(`${PM2_BIN} flush`, { ...EXEC_OPTS, env: PM2_ENV, cwd: EXEC_CWD });
    res.json({ title: 'Clear Logs', output: '✅ Logs cleared' });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title: 'Clear Logs', output: trimOutput(cleanOutput(msg)) });
  }
});

export default router;
