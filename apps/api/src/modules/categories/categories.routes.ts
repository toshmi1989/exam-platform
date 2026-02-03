// src/modules/categories/categories.routes.ts
import { Router } from 'express';
import { prisma } from '../../db/prisma';

const router = Router();

router.get('/', async (_req, res) => {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: {
      exams: {
        orderBy: { title: 'asc' },
        select: { id: true, title: true },
      },
    },
  });

  res.json({
    categories: categories.map((category) => ({
      id: category.id,
      name: category.name,
      exams: category.exams,
    })),
  });
});

export default router;
