import fs from 'fs';
import path from 'path';
import XLSX from 'xlsx';
import { prisma } from '../db/prisma';

type ExamRow = {
  category?: string;
  exam_title?: string;
  exam_type?: string;
  time_limit_seconds?: number | string;
};

type QuestionRow = {
  exam_title?: string;
  question_type?: string;
  prompt?: string;
  options?: string;
  correct?: number | string;
  oral_answer_html?: string;
  explanation_html?: string;
  order?: number | string;
};

function normalizeText(value: unknown): string {
  return String(value ?? '').trim();
}

function parseExamType(value: string): 'TEST' | 'ORAL' {
  const v = value.toLowerCase();
  return v === 'oral' ? 'ORAL' : 'TEST';
}

function parseQuestionType(value: string): 'TEST' | 'ORAL' {
  const v = value.toLowerCase();
  return v === 'oral' ? 'ORAL' : 'TEST';
}

function parseNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Number(String(value ?? '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function parseOptions(raw: string): string[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.map((entry) => String(entry).trim()).filter(Boolean);
    }
  } catch {
    // fall through to delimiter parsing
  }
  return trimmed
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean);
}

function resolveCorrectIndex(value: number | null, optionCount: number): number | null {
  if (value === null || optionCount === 0) return null;
  if (value >= 0 && value < optionCount) return value;
  const oneBased = value - 1;
  if (oneBased >= 0 && oneBased < optionCount) return oneBased;
  return null;
}

async function run() {
  const fileArg = process.argv[2];
  if (!fileArg) {
    console.error('Usage: npm run import:questions -- <path-to-xlsx>');
    process.exit(1);
  }

  const filePath = path.resolve(process.cwd(), fileArg);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }

  const workbook = XLSX.readFile(filePath);
  const examsSheet = workbook.Sheets.exams;
  const questionsSheet = workbook.Sheets.questions;

  if (!examsSheet || !questionsSheet) {
    console.error('XLSX must contain sheets: "exams" and "questions".');
    process.exit(1);
  }

  const examsRows = XLSX.utils.sheet_to_json<ExamRow>(examsSheet, {
    defval: '',
  });
  const questionRows = XLSX.utils.sheet_to_json<QuestionRow>(questionsSheet, {
    defval: '',
  });

  const errors: string[] = [];
  const examIndex = new Map<string, ExamRow>();

  examsRows.forEach((row, idx) => {
    const category = normalizeText(row.category);
    const title = normalizeText(row.exam_title);
    const type = normalizeText(row.exam_type);
    if (!category || !title || !type) {
      errors.push(`exams row ${idx + 2}: missing category/exam_title/exam_type`);
      return;
    }
    examIndex.set(title, row);
  });

  if (errors.length) {
    console.error(errors.join('\n'));
    process.exit(1);
  }

  const importBatch = await prisma.importBatch.create({
    data: { sourceFile: path.basename(filePath) },
  });

  let createdQuestions = 0;

  for (const [examTitle, examRow] of examIndex.entries()) {
    const categoryName = normalizeText(examRow.category);
    const examType = parseExamType(normalizeText(examRow.exam_type));
    const timeLimit = parseNumber(examRow.time_limit_seconds) ?? 1800;

    const category = await prisma.category.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName },
    });

    const exam = await prisma.exam.upsert({
      where: { title_categoryId: { title: examTitle, categoryId: category.id } },
      update: { type: examType, timeLimitSeconds: timeLimit },
      create: {
        title: examTitle,
        type: examType,
        timeLimitSeconds: timeLimit,
        categoryId: category.id,
      },
    });

    const rowsForExam = questionRows.filter(
      (row) => normalizeText(row.exam_title) === examTitle
    );

    await prisma.$transaction(async (tx) => {
      await tx.question.deleteMany({ where: { examId: exam.id } });

      for (let index = 0; index < rowsForExam.length; index += 1) {
        const row = rowsForExam[index];
        const questionType = parseQuestionType(normalizeText(row.question_type));
        const prompt = normalizeText(row.prompt);
        if (!prompt) {
          errors.push(
            `questions row ${index + 2}: missing prompt for exam "${examTitle}"`
          );
          continue;
        }

        if (questionType === 'TEST') {
          const options = parseOptions(normalizeText(row.options));
          const correctIndex = resolveCorrectIndex(
            parseNumber(row.correct),
            options.length
          );
          if (options.length === 0 || correctIndex === null) {
            errors.push(
              `questions row ${index + 2}: invalid options/correct for exam "${examTitle}"`
            );
            continue;
          }

          const question = await tx.question.create({
            data: {
              examId: exam.id,
              type: 'TEST',
              prompt,
              order: parseNumber(row.order) ?? index + 1,
              explanationHtml: normalizeText(row.explanation_html) || null,
              options: {
                create: options.map((label, optionIndex) => ({
                  label,
                  isCorrect: optionIndex === correctIndex,
                  order: optionIndex + 1,
                })),
              },
            },
          });

          createdQuestions += 1;
          if (!question) continue;
        } else {
          const oralAnswerHtml = normalizeText(row.oral_answer_html);
          if (!oralAnswerHtml) {
            errors.push(
              `questions row ${index + 2}: missing oral_answer_html for exam "${examTitle}"`
            );
            continue;
          }

          await tx.question.create({
            data: {
              examId: exam.id,
              type: 'ORAL',
              prompt,
              order: parseNumber(row.order) ?? index + 1,
              explanationHtml: normalizeText(row.explanation_html) || null,
              oralAnswer: { create: { answerHtml: oralAnswerHtml } },
            },
          });

          createdQuestions += 1;
        }
      }
    });
  }

  const stats = {
    exams: examIndex.size,
    questions: createdQuestions,
    errors: errors.length,
  };

  await prisma.importBatch.update({
    where: { id: importBatch.id },
    data: { stats },
  });

  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('Import completed with errors.');
  } else {
    console.log('Import completed successfully.');
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
