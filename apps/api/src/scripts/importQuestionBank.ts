import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { prisma } from '../db/prisma';

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

function resolveProfession(fileName: string): Profession | null {
  const lower = fileName.toLowerCase();
  if (lower.includes('vrach')) return 'DOCTOR';
  if (lower.includes('medsestra')) return 'NURSE';
  return null;
}

async function importWorkbook(filePath: string) {
  const baseName = path.basename(filePath);
  const profession = resolveProfession(baseName);
  if (!profession) {
    throw new Error(`Cannot detect profession for file: ${baseName}`);
  }

  const workbook = XLSX.readFile(filePath);
  const sheetNames = workbook.SheetNames;
  const categoryName = resolveCategory(profession);
  const category = await prisma.category.upsert({
    where: { name: categoryName },
    update: {},
    create: { name: categoryName },
  });

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
        profession,
        language,
        direction: sheetName,
      },
      create: {
        title: sheetName,
        type: 'TEST',
        profession,
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
      }
    });
  }
}

async function run() {
  const doctorFile = process.argv[2];
  const nurseFile = process.argv[3];
  if (!doctorFile || !nurseFile) {
    console.error('Usage: npm run import:question-bank -- <doctor.xlsx> <nurse.xlsx>');
    process.exit(1);
  }

  const doctorPath = path.resolve(process.cwd(), doctorFile);
  const nursePath = path.resolve(process.cwd(), nurseFile);

  if (!fs.existsSync(doctorPath) || !fs.existsSync(nursePath)) {
    console.error('Missing XLSX file. Check paths and try again.');
    process.exit(1);
  }

  await prisma.importBatch.create({
    data: { sourceFile: `${path.basename(doctorPath)},${path.basename(nursePath)}` },
  });

  await importWorkbook(doctorPath);
  await importWorkbook(nursePath);

  console.log('Question bank import completed.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
