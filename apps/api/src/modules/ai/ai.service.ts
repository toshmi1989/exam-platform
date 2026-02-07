import { createHash } from 'crypto';
import { prisma } from '../../db/prisma';
import { generateZiyodaExplanation } from './ziyoda.generator';
import type { ZiyodaLang } from './ziyoda.generator';

export type AiLang = ZiyodaLang;

export interface GetOrCreateResult {
  success: true;
  content: string;
}
export interface GetOrCreateError {
  success: false;
  reasonCode: string;
  message?: string;
}

/** Stable hash for cache invalidation: questionText + options (by order) + correctAnswer */
function computeHash(questionText: string, options: { id: string; label: string }[], correctAnswer: string): string {
  const payload = questionText + JSON.stringify(options) + correctAnswer;
  return createHash('sha256').update(payload, 'utf8').digest('hex');
}

/** Обращение по имени (если есть) — разные варианты при каждой выдаче */
const GREETINGS_RU = [
  (n: string) => `${n}, вот объяснение:\n\n`,
  (n: string) => `${n}, разберём:\n\n`,
  (n: string) => `${n}, смотри, что важно:\n\n`,
  (n: string) => `${n}, держи объяснение:\n\n`,
  (n: string) => `${n}, вот что здесь ключевое:\n\n`,
  (n: string) => `${n}, коротко по сути:\n\n`,
  (n: string) => `${n}, вот как это устроено:\n\n`,
  (n: string) => `${n}, обрати внимание:\n\n`,
];

const GREETINGS_UZ = [
  (n: string) => `${n}, mana tushuntirish:\n\n`,
  (n: string) => `${n}, keling ko'ramiz:\n\n`,
  (n: string) => `${n}, mana javob:\n\n`,
  (n: string) => `${n}, qisqacha:\n\n`,
  (n: string) => `${n}, diqqat qiling:\n\n`,
  (n: string) => `${n}, mana muhim qism:\n\n`,
  (n: string) => `${n}, shuni bilish kerak:\n\n`,
  (n: string) => `${n}, mana tushuntirish:\n\n`,
];

/** Нейтральные приветствия без имени — когда имени нет в профиле */
const NEUTRAL_RU = [
  'Вот объяснение:\n\n',
  'Разберём:\n\n',
  'Смотри, что важно:\n\n',
  'Держи объяснение:\n\n',
  'Вот что здесь ключевое:\n\n',
  'Коротко по сути:\n\n',
  'Вот как это устроено:\n\n',
  'Обрати внимание:\n\n',
];

const NEUTRAL_UZ = [
  "Mana tushuntirish:\n\n",
  "Keling ko'ramiz:\n\n",
  "Mana javob:\n\n",
  "Qisqacha:\n\n",
  "Diqqat qiling:\n\n",
  "Mana muhim qism:\n\n",
  "Shuni bilish kerak:\n\n",
  "Mana tushuntirish:\n\n",
];

/** При выдаче всегда добавляем одно из приветствий; с именем — персональное, без — нейтральное. Вариант выбирается случайно. */
function addPersonalGreeting(content: string, lang: AiLang, userName?: string): string {
  const name = (userName ?? '').trim();
  if (name) {
    const list = lang === 'uz' ? GREETINGS_UZ : GREETINGS_RU;
    const greeting = list[Math.floor(Math.random() * list.length)](name);
    return greeting + content;
  }
  const neutral = lang === 'uz' ? NEUTRAL_UZ : NEUTRAL_RU;
  const greeting = neutral[Math.floor(Math.random() * neutral.length)];
  return greeting + content;
}

/**
 * Get explanation from QuestionAIExplanation (by questionId, hash match) or generate via Ziyoda and upsert.
 * Language is taken from the question's exam — one explanation per question.
 */
export async function getOrCreateExplanation(
  questionId: string,
  userName?: string
): Promise<GetOrCreateResult | GetOrCreateError> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      options: { orderBy: { order: 'asc' } },
      exam: { select: { language: true } },
    },
  });

  if (!question) {
    return { success: false, reasonCode: 'QUESTION_NOT_FOUND', message: 'Вопрос не найден.' };
  }

  const lang: AiLang = question.exam.language === 'UZ' ? 'uz' : 'ru';
  const options = question.options.map((o) => ({ id: o.id, label: o.label }));
  const correctOption = question.options.find((o) => o.isCorrect);
  const correctAnswer = correctOption?.label ?? '';
  const hash = computeHash(question.prompt, options, correctAnswer);

  const existing = await prisma.questionAIExplanation.findUnique({
    where: { questionId },
  });

  const cachedContent = existing?.hash === hash ? existing.content : null;
  if (cachedContent) {
    return { success: true, content: addPersonalGreeting(cachedContent, lang, userName) };
  }

  try {
    const content = await generateZiyodaExplanation({
      lang,
      question: question.prompt,
      options: options.map((o) => ({ label: o.label })),
      correctAnswer,
    });

    await prisma.questionAIExplanation.upsert({
      where: { questionId },
      create: { questionId, lang, hash, content },
      update: { hash, content, lang },
    });

    return { success: true, content: addPersonalGreeting(content, lang, userName) };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось сгенерировать объяснение.';
    return { success: false, reasonCode: 'GENERATION_FAILED', message };
  }
}

export interface PrewarmProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentQuestionId: string | null;
  done?: boolean;
}

/**
 * Pre-generate explanations for questions in the language of each question's exam.
 * One explanation per question (lang = exam language). Skip when hash matches.
 */
export async function* prewarm(
  examId?: string,
  langFilter?: AiLang
): AsyncGenerator<PrewarmProgress, void, unknown> {
  const where: { examId?: string; exam?: { language: 'RU' | 'UZ' } } = examId ? { examId } : {};
  if (langFilter) {
    where.exam = { language: langFilter === 'uz' ? 'UZ' : 'RU' };
  }
  const questions = await prisma.question.findMany({
    where,
    include: {
      options: { orderBy: { order: 'asc' } },
      exam: { select: { language: true } },
    },
    orderBy: { order: 'asc' },
  });

  const work: { question: (typeof questions)[0]; lang: AiLang }[] = questions.map((q) => ({
    question: q,
    lang: q.exam.language === 'UZ' ? 'uz' : 'ru',
  }));
  const total = work.length;

  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const { question, lang: l } of work) {
    const options = question.options.map((o) => ({ id: o.id, label: o.label }));
    const correctOption = question.options.find((o) => o.isCorrect);
    const correctAnswer = correctOption?.label ?? '';
    const hash = computeHash(question.prompt, options, correctAnswer);

    const existing = await prisma.questionAIExplanation.findUnique({
      where: { questionId: question.id },
    });

    if (existing && existing.hash === hash) {
      skipped += 1;
    } else {
      try {
        const content = await generateZiyodaExplanation({
          question: question.prompt,
          options: options.map((o) => ({ label: o.label })),
          correctAnswer,
          lang: l,
        });
        await prisma.questionAIExplanation.upsert({
          where: { questionId: question.id },
          create: { questionId: question.id, lang: l, hash, content },
          update: { hash, content, lang: l },
        });
        generated += 1;
      } catch {
        errors += 1;
      }
    }

    processed += 1;
    yield {
      total,
      processed,
      generated,
      skipped,
      errors,
      currentQuestionId: question.id,
    };
  }

  yield {
    total,
    processed,
    generated,
    skipped,
    errors,
    currentQuestionId: null,
    done: true,
  };
}

export interface AiStats {
  totalQuestions: number;
  withExplanation: number;
  missing: number;
}

export async function getAiStats(): Promise<AiStats> {
  const totalQuestions = await prisma.question.count();
  const withExplanation = await prisma.questionAIExplanation.count();
  const missing = Math.max(0, totalQuestions - withExplanation);
  return { totalQuestions, withExplanation, missing };
}
