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

export async function previewQuestionBank(params: {
  profession: Profession;
  fileBase64: string;
}) {
  const buffer = decodeBase64(params.fileBase64);
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetNames = workbook.SheetNames;

  const directions = sheetNames.map((name, index) => {
    const sheet = workbook.Sheets[name];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      defval: '',
    });
    const cleanedRows = rows.filter((row) => normalizeText(row[0]));
    return {
      name,
      language: resolveLanguage(index),
      questionCount: cleanedRows.length,
    };
  });

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

    await prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { examId: exam.id } });

      for (let rowIndex = 0; rowIndex < cleanedRows.length; rowIndex += 1) {
        const row = cleanedRows[rowIndex];
        const questionText = normalizeText(row[0]);
        const rawOptions = row.slice(1, row.length - 1);
        const correctText = normalizeText(row[row.length - 1]);
        const options = rawOptions
          .map((cell) => normalizeText(cell))
          .filter(Boolean);

        if (!questionText || options.length === 0 || !correctText) {
          continue;
        }

        const correctIndex = options.findIndex(
          (option) => option === correctText
        );
        if (correctIndex === -1) {
          continue;
        }

        await tx.question.create({
          data: {
            examId: exam.id,
            type: 'TEST',
            prompt: questionText,
            order: rowIndex + 1,
            options: {
              create: options.map((label, index) => ({
                label,
                isCorrect: index === correctIndex,
                order: index + 1,
              })),
            },
          },
        });

        importedQuestions += 1;
      }
    });
  }

  return {
    profession: params.profession,
    totalDirections: sheetNames.length,
    importedQuestions,
  };
}
