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

export type ImportMode = 'overwrite' | 'add';

export async function importQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
  mode?: ImportMode;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const categoryName = resolveCategory(params.profession);
  const mode = params.mode ?? 'overwrite';

  const category = await prisma.category.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  });

  if (mode === 'overwrite') {
    const deleteFilter =
      sheetNames.length === 0
        ? { categoryId: category.id, profession: params.profession }
        : {
            categoryId: category.id,
            profession: params.profession,
            title: { notIn: sheetNames },
          };
    await prisma.exam.deleteMany({ where: deleteFilter });
  }

  let importedQuestions = 0;
  let skippedExams = 0;

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

    const existingExam = await prisma.exam.findUnique({
      where: { title_categoryId: { title: sheetName, categoryId: category.id } },
    });

    if (mode === 'add' && existingExam) {
      skippedExams += 1;
      await yieldEventLoop();
      continue;
    }

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

    if (mode === 'overwrite') {
      await prisma.question.deleteMany({ where: { examId: exam.id } });
    }

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
    mode,
    totalDirections: sheetNames.length,
    importedQuestions,
    skippedExams: mode === 'add' ? skippedExams : undefined,
  };
}

// ——— Oral import ———
// Excel: each sheet = direction name. First sheet = UZ, second = RU, third = UZ, fourth = RU, ... (as in test import).
// Columns = categories (doctors: 4 cols = 3, 2, 1, высшая; nurses: 3 cols = 2, 1, высшая). Each row = one question per column (cell = question text).

const ORAL_CATEGORY_NAMES_DOCTOR = ['3', '2', '1', 'Высшая'] as const;
const ORAL_CATEGORY_NAMES_NURSE = ['2', '1', 'Высшая'] as const;

function getOralCategoryNames(profession: Profession): readonly string[] {
  return profession === 'DOCTOR' ? ORAL_CATEGORY_NAMES_DOCTOR : ORAL_CATEGORY_NAMES_NURSE;
}

export async function previewOralQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const categoryNames = getOralCategoryNames(params.profession);

  const directions: {
    name: string;
    language: Language;
    categories: { categoryLabel: string; questionCount: number }[];
  }[] = [];

  for (let index = 0; index < sheetNames.length; index += 1) {
    const sheetName = sheetNames[index];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const lang = resolveLanguage(index);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });

    const categories: { categoryLabel: string; questionCount: number }[] = [];
    for (let colIndex = 0; colIndex < categoryNames.length; colIndex += 1) {
      let count = 0;
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] as unknown[] | undefined;
        const cell = row?.[colIndex];
        if (normalizeText(cell)) count += 1;
      }
      categories.push({
        categoryLabel: categoryNames[colIndex],
        questionCount: count,
      });
    }

    directions.push({ name: sheetName, language: lang, categories });
  }

  return {
    profession: params.profession,
    directions,
    totalDirections: directions.length,
  };
}

// Unique exam key: (title, categoryId). One sheet produces one exam per column (category),
// so the same direction name appears in multiple exams (e.g. nurses: 3 categories = 3 exams per sheet).
// overwrite: upsert exam, delete existing ORAL questions, create new — no duplicate exams.
// add: skip (title, categoryId) if exam already exists; only create new directions.
export async function importOralQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
  mode?: ImportMode;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;
  const categoryNames = getOralCategoryNames(params.profession);
  const mode = params.mode ?? 'overwrite';

  // Ensure categories exist
  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  let totalQuestions = 0;

  for (let sheetIndex = 0; sheetIndex < sheetNames.length; sheetIndex += 1) {
    const sheetName = sheetNames[sheetIndex];
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;

    const language = resolveLanguage(sheetIndex);

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });

    for (let colIndex = 0; colIndex < categoryNames.length; colIndex += 1) {
      const categoryName = categoryNames[colIndex];
      const category = await prisma.category.findUnique({
        where: { name: categoryName },
      });
      if (!category) continue;

      const existingExam = await prisma.exam.findUnique({
        where: {
          title_categoryId: { title: sheetName, categoryId: category.id },
        },
      });

      if (mode === 'add' && existingExam) {
        await yieldEventLoop();
        continue;
      }

      const exam = await prisma.exam.upsert({
        where: {
          title_categoryId: { title: sheetName, categoryId: category.id },
        },
        update: {
          type: 'ORAL',
          profession: params.profession,
          language,
          direction: sheetName,
        },
        create: {
          title: sheetName,
          type: 'ORAL',
          profession: params.profession,
          language,
          direction: sheetName,
          categoryId: category.id,
        },
      });

      await prisma.question.deleteMany({ where: { examId: exam.id, type: 'ORAL' } });

      const questionsData: { examId: string; type: 'ORAL'; prompt: string; order: number }[] = [];
      for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
        const row = rows[rowIndex] as unknown[] | undefined;
        const cell = row?.[colIndex];
        const text = normalizeText(cell);
        if (!text) continue;
        questionsData.push({
          examId: exam.id,
          type: 'ORAL',
          prompt: text,
          order: rowIndex + 1,
        });
      }

      if (questionsData.length > 0) {
        await prisma.question.createMany({ data: questionsData });
        totalQuestions += questionsData.length;
      }

      await yieldEventLoop();
    }
  }

  return {
    profession: params.profession,
    totalDirections: sheetNames.length,
    importedQuestions: totalQuestions,
  };
}
