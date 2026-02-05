import XLSX from 'xlsx';
import { prisma } from '../../db/prisma';

type Profession = 'DOCTOR' | 'NURSE';
type Language = 'UZ' | 'RU';

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function resolveLanguage(sheetIndex: number): Language {
  return sheetIndex % 2 === 0 ? 'UZ' : 'RU';
}

function resolveCategory(profession: Profession): string {
  return profession === 'DOCTOR' ? 'Doctors' : 'Nurses';
}

function decodeBase64(fileBase64: string): Buffer {
  const base64 = fileBase64.includes(',')
    ? fileBase64.split(',')[1]
    : fileBase64;
  return Buffer.from(base64, 'base64');
}

function yieldEventLoop(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

export async function previewQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  const directions: { name: string; language: Language; questionCount: number }[] = [];
  for (let index = 0; index < sheetNames.length; index += 1) {
    await yieldEventLoop();
    const name = sheetNames[index];
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    const cleanedRows = rows.filter((row) => normalizeText(row[0]));
    directions.push({
      name,
      language: resolveLanguage(index),
      questionCount: cleanedRows.length,
    });
  }

  return {
    profession: params.profession,
    directions,
    totalDirections: directions.length,
  };
}

export async function importQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const categoryName = resolveCategory(params.profession);

  const category = await prisma.category.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  });
  const deleteFilter =
    sheetNames.length === 0
      ? { categoryId: category.id, profession: params.profession }
      : {
          categoryId: category.id,
          profession: params.profession,
          title: { notIn: sheetNames },
        };
  await prisma.exam.deleteMany({ where: deleteFilter });

  let importedQuestions = 0;

  for (let i = 0; i < sheetNames.length; i += 1) {
    const sheetName = sheetNames[i];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const language = resolveLanguage(i);
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });

    const cleanedRows = rows.filter((row) => normalizeText(row[0]));
    if (!cleanedRows.length) continue;

    const exam = await prisma.exam.upsert({
      where: { title_categoryId: { title: sheetName, categoryId: category.id } },
      update: {
        type: 'TEST',
        profession: params.profession,
        language,
        direction: sheetName,
      },
      create: {
        title: sheetName,
        type: 'TEST',
        profession: params.profession,
        language,
        direction: sheetName,
        categoryId: category.id,
      },
    });

    await prisma.question.deleteMany({ where: { examId: exam.id } });

    const BATCH_SIZE = 150;
    for (let start = 0; start < cleanedRows.length; start += BATCH_SIZE) {
      const batch = cleanedRows.slice(start, start + BATCH_SIZE);
      const questionsData: { examId: string; type: 'TEST'; prompt: string; order: number }[] = [];
      const optionsPerQuestion: { labels: string[]; correctIndex: number }[] = [];

      for (let i = 0; i < batch.length; i += 1) {
        const row = batch[i];
        const rowIndex = start + i;
        const questionText = normalizeText(row[0]);
        const rawOptions = row.slice(1, row.length - 1);
        const correctText = normalizeText(row[row.length - 1]);
        const options = rawOptions
          .map((cell) => normalizeText(cell))
          .filter(Boolean);

        if (!questionText || options.length === 0 || !correctText) continue;
        const correctIndex = options.findIndex((option) => option === correctText);
        if (correctIndex === -1) continue;

        questionsData.push({
          examId: exam.id,
          type: 'TEST',
          prompt: questionText,
          order: rowIndex + 1,
        });
        optionsPerQuestion.push({ labels: options, correctIndex });
      }

      if (questionsData.length === 0) {
        await yieldEventLoop();
        continue;
      }

      await prisma.$transaction(async (tx) => {
        const created = await tx.question.createManyAndReturn({
          data: questionsData,
        });
        const byOrder = [...created].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        const optionsData: { questionId: string; label: string; isCorrect: boolean; order: number }[] = [];
        for (let i = 0; i < byOrder.length; i += 1) {
          const q = byOrder[i];
          const { labels, correctIndex } = optionsPerQuestion[i];
          for (let j = 0; j < labels.length; j += 1) {
            optionsData.push({
              questionId: q.id,
              label: labels[j],
              isCorrect: j === correctIndex,
              order: j + 1,
            });
          }
        }
        if (optionsData.length > 0) {
          await tx.questionOption.createMany({ data: optionsData });
        }
      });

      importedQuestions += questionsData.length;
      await yieldEventLoop();
    }
  }

  return {
    profession: params.profession,
    totalDirections: sheetNames.length,
    importedQuestions,
  };
}
