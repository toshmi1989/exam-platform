import { Router, Request, Response } from 'express';
import path from 'path';
import { spawn } from 'child_process';
import { prisma } from '../../db/prisma';
import { normalizeName, firstThreeWords } from './normalize';

const router = Router();

/** Project root (exam-platform): from .../modules/attestation up to repo root */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const PARSER_TIMEOUT_MS = 900_000; // 15 min

function runParserOnce(): Promise<{ ok: boolean; hint?: string }> {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'parser_attestation.py');
  const pythonCommands = ['python3', 'python'];

  function run(cmd: string): Promise<{ ok: boolean; hint?: string }> {
    return new Promise((resolve) => {
      let resolved = false;
      const done = (result: { ok: boolean; hint?: string }) => {
        if (resolved) return;
        resolved = true;
        resolve(result);
      };
      const prefix = '[attestation-parser] ';
      const stderrChunks: string[] = [];
      console.log('[attestation] spawn', cmd, scriptPath);

      const child = spawn(cmd, [scriptPath], {
        cwd: PROJECT_ROOT,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      child.stdout?.on('data', (data: Buffer) => {
        process.stdout.write(prefix + data.toString());
      });
      child.stderr?.on('data', (data: Buffer) => {
        const s = data.toString();
        stderrChunks.push(s);
        process.stderr.write(prefix + s);
      });

      child.on('error', (err) => {
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          done({ ok: false });
          return;
        }
        const errCode = (err as NodeJS.ErrnoException).code;
        if (errCode === 'ETIMEDOUT') {
          console.error('[attestation] parser timeout');
          done({
            ok: false,
            hint: 'Загрузка данных заняла слишком много времени. Запустите на сервере: python3 scripts/parser_attestation.py (или настройте cron в 06:00).',
          });
          return;
        }
        console.error('[attestation] parser spawn error:', err);
        done({ ok: false });
      });

      const timeoutId = setTimeout(() => {
        try {
          child.kill('SIGTERM');
          console.error('[attestation] parser killed (timeout %d min)', PARSER_TIMEOUT_MS / 60000);
        } catch {
          // ignore
        }
        done({
          ok: false,
          hint: 'Загрузка данных заняла слишком много времени. Запустите на сервере: python3 scripts/parser_attestation.py (или настройте cron в 06:00).',
        });
      }, PARSER_TIMEOUT_MS);

      child.on('close', (code, signal) => {
        clearTimeout(timeoutId);
        if (code === 0 && !signal) {
          done({ ok: true });
          return;
        }
        if (resolved) return;
        const lastStderr = stderrChunks.join('').slice(0, 1000);
        console.error('[attestation] parser exit', code, signal, lastStderr);
        const isMissingModule =
          /ModuleNotFoundError|No module named|ImportError/i.test(lastStderr);
        done({
          ok: false,
          hint: isMissingModule
            ? 'На сервере установите Python-зависимости: apt install python3-pip && pip3 install -r scripts/requirements-attestation.txt'
            : undefined,
        });
      });
    });
  }

  return (async () => {
    for (const cmd of pythonCommands) {
      const result = await run(cmd);
      if (result.ok) return result;
      if (result.hint) return result;
      // ENOENT (cmd not found), try next
    }
    console.error('[attestation] python not found (tried python3, python)');
    return { ok: false };
  })();
}

async function getDataCoverageMessage(): Promise<string | null> {
  const rows = await prisma.attestationPerson.findMany({
    select: { publishedDate: true },
    distinct: ['publishedDate'],
    where: { publishedDate: { not: null } },
    orderBy: { publishedDate: 'desc' },
    take: 30,
  });
  if (rows.length === 0) return null;
  const dates = rows
    .map((r) => r.publishedDate)
    .filter((d): d is NonNullable<typeof d> => d != null)
    .map((d) => d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }));
  return `ФИО не встречается в данных за следующие даты публикаций: ${dates.join(', ')}.`;
}

router.get('/search', async (req: Request, res: Response) => {
  const raw = typeof req.query.name === 'string' ? req.query.name : '';
  const name = raw.trim();
  if (name.length < 3) {
    return res.status(400).json({
      ok: false,
      error: 'Минимум 3 символа для поиска',
    });
  }
  const normalized = normalizeName(name);
  const searchQuery = firstThreeWords(name);
  const searchPattern = searchQuery.length >= 3 ? searchQuery : normalized;
  console.log('[attestation/search] query:', { name: name.slice(0, 50), searchPattern: searchPattern.slice(0, 50) });
  try {
    const total = await prisma.attestationPerson.count();
    console.log('[attestation/search] attestation_people count:', total);
    if (total === 0) {
      console.log('[attestation/search] DB empty, running parser...');
      const result = await runParserOnce();
      if (!result.ok) {
        console.error('[attestation/search] parser failed, hint:', result.hint);
        const message = result.hint
          ? `База данных аттестаций пуста. ${result.hint}`
          : 'База данных аттестаций пуста. Не удалось загрузить данные с сайта. Попробуйте позже.';
        return res.status(503).json({ ok: false, error: message });
      }
      console.log('[attestation/search] parser finished, re-querying count');
    }

    const rows = await prisma.attestationPerson.findMany({
      where: {
        fullNameNormalized: { contains: searchPattern, mode: 'insensitive' },
      },
      orderBy: [
        { examDate: { sort: 'desc', nulls: 'last' } },
        { publishedDate: { sort: 'desc', nulls: 'last' } },
      ],
      take: 50,
      select: {
        fullName: true,
        specialty: true,
        region: true,
        stage: true,
        profession: true,
        examDate: true,
        examTime: true,
        sourceUrl: true,
        publishedDate: true,
      },
    });
    console.log('[attestation/search] found rows:', rows.length);
    const list = rows.map((r) => ({
      full_name: r.fullName,
      specialty: r.specialty,
      region: r.region,
      stage: r.stage,
      profession: r.profession,
      exam_date: r.examDate,
      exam_time: r.examTime,
      source_url: r.sourceUrl,
      published_date: r.publishedDate ? r.publishedDate.toISOString().slice(0, 10) : null,
    }));

    let dataCoverage: string | undefined;
    if (list.length === 0) {
      const msg = await getDataCoverageMessage();
      if (msg) dataCoverage = msg;
    }

    return res.status(200).json({ items: list, dataCoverage });
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    console.error('[attestation/search] error:', err.message);
    console.error('[attestation/search] stack:', err.stack);
    return res.status(500).json({ ok: false, error: 'Ошибка поиска' });
  }
});

export default router;
