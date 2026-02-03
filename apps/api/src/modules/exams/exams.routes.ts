import { Router } from 'express';
import { prisma } from '../../db/prisma';

const router = Router();

router.get('/directions', async (req, res) => {
  const profession = String(req.query.profession ?? '').toUpperCase();
  const language = String(req.query.language ?? '').toUpperCase();
  const type = String(req.query.type ?? '').toUpperCase();

  if (!profession || !language || !type) {
    return res.status(400).json({ ok: false });
  }

  const exams = await prisma.exam.findMany({
    where: {
      profession: profession as 'DOCTOR' | 'NURSE',
      language: language as 'UZ' | 'RU',
      type: type as 'TEST' | 'ORAL',
    },
    select: {
      id: true,
      direction: true,
      title: true,
    },
    orderBy: { direction: 'asc' },
  });

  res.json({
    directions: exams.map((exam) => ({
      id: exam.id,
      label: exam.direction || exam.title,
    })),
  });
});

export default router;
