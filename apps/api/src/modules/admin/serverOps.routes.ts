/**
 * V3 Safe Server Ops Console — read-only whitelist of server commands.
 * No user input, no dynamic commands, no query params.
 * All routes protected by admin middleware (parent router).
 */

import { Router, Request, Response } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

const EXEC_OPTS = {
  timeout: 10_000,
  maxBuffer: 500 * 1024,
} as const;

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

async function runCommand(
  res: Response,
  title: string,
  command: string,
  env?: Record<string, string>
): Promise<void> {
  try {
    const opts = {
      ...EXEC_OPTS,
      env: env ? { ...process.env, ...env } : process.env,
    };
    const { stdout, stderr } = await execAsync(command, opts);
    const output = [stdout, stderr].filter(Boolean).join('\n');
    res.json({ title, output: trimOutput(output) });
  } catch (err) {
    const msg = safeError(err);
    res.json({ title, output: trimOutput(msg) });
  }
}

const router = Router();

router.get('/status', (req: Request, res: Response) => {
  runCommand(res, 'Status', 'PM2_NO_COLOR=true pm2 jlist', {
    PM2_NO_COLOR: 'true',
  });
});

router.post('/restart-api', (req: Request, res: Response) => {
  runCommand(res, 'Restart API', 'PM2_NO_COLOR=true pm2 restart exam-api', {
    PM2_NO_COLOR: 'true',
  });
});

router.post('/restart-web', (req: Request, res: Response) => {
  runCommand(res, 'Restart WEB', 'PM2_NO_COLOR=true pm2 restart exam-web', {
    PM2_NO_COLOR: 'true',
  });
});

router.post('/restart-bot', (req: Request, res: Response) => {
  runCommand(res, 'Restart BOT', 'PM2_NO_COLOR=true pm2 restart ziyoda-bot', {
    PM2_NO_COLOR: 'true',
  });
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

export default router;
