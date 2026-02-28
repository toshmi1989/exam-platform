import { Router, Request, Response } from 'express';
import path from 'path';
import { spawnSync } from 'child_process';
import { prisma } from '../../db/prisma';
import { normalizeName } from './normalize';

const router = Router();

/** Project root (exam-platform): from .../modules/attestation up to repo root */
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');

async function runParserOnce(): Promise<{ ok: boolean; hint?: string }> {
  const scriptPath = path.join(PROJECT_ROOT, 'scripts', 'parser_attestation.py');
  const pythonCommands = ['python3', 'python'];
  let lastStderr = '';
  for (const cmd of pythonCommands) {
    try {
      const r = spawnSync(cmd, [scriptPath], {
        cwd: PROJECT_ROOT,
        env: process.env,
        timeout: 120_000,
        maxBuffer: 10 * 1024 * 1024,
        encoding: 'utf8',
      });
      if (r.error) {
        if ((r.error as NodeJS.ErrnoException).code === 'ENOENT') continue;
        console.error('[attestation] parser spawn error:', r.error);
        return { ok: false };
      }
      if (r.status !== 0) {
        lastStderr = (r.stderr || r.stdout || '').slice(0, 1000);
        console.error('[attestation] parser exit', r.status, lastStderr);
        const isMissingModule =
          /ModuleNotFoundError|No module named|ImportError/i.test(lastStderr);
        return {
          ok: false,
          hint: isMissingModule
            ? 'На сервере установите Python-зависимости: apt install python3-pip && pip3 install -r scripts/requirements-attestation.txt'
            : undefined,
        };
      }
      return { ok: true };
    } catch (e) {
      console.error('[attestation] parser run failed:', e);
      return { ok: false };
    }
  }
  console.error('[attestation] python not found (tried python3, python)');
  return { ok: false };
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
  console.log('[attestation/search] query:', { name: name.slice(0, 50), normalized: normalized.slice(0, 50) });
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
        fullNameNormalized: { contains: normalized, mode: 'insensitive' },
      },
      orderBy: [
        { examDate: { sort: 'desc', nulls: 'last' } },
        { publishedDate: { sort: 'desc', nulls: 'last' } },
      ],
      take: 20,
      select: {
        fullName: true,
        specialty: true,
        region: true,
        stage: true,
        profession: true,
        examDate: true,
        examTime: true,
        sourceUrl: true,
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
