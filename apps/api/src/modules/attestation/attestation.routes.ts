import { Router, Request, Response } from 'express';
import { prisma } from '../../db/prisma';
import { normalizeName } from './normalize';

const router = Router();

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
  try {
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
    return res.status(200).json(list);
  } catch (e) {
    console.error('[attestation/search]', e);
    return res.status(500).json({ ok: false, error: 'Ошибка поиска' });
  }
});

export default router;
