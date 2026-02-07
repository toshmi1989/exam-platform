import { createHash } from 'crypto';
import { prisma } from '../../db/prisma';
import { generateZiyodaExplanation } from './ziyoda.generator';
import { generateOralAnswer } from './oralAnswer.generator';
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

export interface AiStatsByExam {
  examId: string;
  title: string;
  total: number;
  withExplanation: number;
}

export interface AiStats {
  totalQuestions: number;
  withExplanation: number;
  missing: number;
  byExam: AiStatsByExam[];
}

export async function getAiStats(): Promise<AiStats> {
  const [questions, withExplList, exams] = await Promise.all([
    prisma.question.findMany({ select: { id: true, examId: true } }),
    prisma.questionAIExplanation.findMany({ select: { questionId: true } }),
    prisma.exam.findMany({ select: { id: true, title: true }, orderBy: { title: 'asc' } }),
  ]);
  const withExplSet = new Set(withExplList.map((e) => e.questionId));
  const totalQuestions = questions.length;
  const withExplanation = withExplSet.size;
  const missing = Math.max(0, totalQuestions - withExplanation);

  const byExam: AiStatsByExam[] = exams.map((exam) => {
    const examQuestions = questions.filter((q) => q.examId === exam.id);
    const total = examQuestions.length;
    const withExpl = examQuestions.filter((q) => withExplSet.has(q.id)).length;
    return { examId: exam.id, title: exam.title, total, withExplanation: withExpl };
  });

  return { totalQuestions, withExplanation, missing, byExam };
}

/** Get oral answer from DB or generate via AI and save. Language from question's exam. */
export async function getOrCreateOralAnswer(
  questionId: string
): Promise<GetOrCreateResult | GetOrCreateError> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      exam: { select: { language: true } },
      oralAnswer: true,
    },
  });

  if (!question) {
    return { success: false, reasonCode: 'QUESTION_NOT_FOUND', message: 'Вопрос не найден.' };
  }

  if (question.type !== 'ORAL') {
    return { success: false, reasonCode: 'NOT_ORAL', message: 'Вопрос не устный.' };
  }

  const existing = question.oralAnswer?.answerHtml?.trim();
  if (existing) {
    return { success: true, content: existing };
  }

  const lang: AiLang = question.exam.language === 'UZ' ? 'uz' : 'ru';

  try {
    const content = await generateOralAnswer({
      lang,
      question: question.prompt,
    });

    await prisma.oralAnswer.upsert({
      where: { questionId },
      create: { questionId, answerHtml: content },
      update: { answerHtml: content },
    });

    return { success: true, content };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Не удалось сгенерировать ответ.';
    return { success: false, reasonCode: 'GENERATION_FAILED', message };
  }
}

export interface OralStatsByExam {
  examId: string;
  title: string;
  total: number;
  withAnswer: number;
}

export interface OralStats {
  totalOralQuestions: number;
  withAnswer: number;
  missing: number;
  byExam: OralStatsByExam[];
}

export async function getOralStats(): Promise<OralStats> {
  const [questions, exams] = await Promise.all([
    prisma.question.findMany({
      where: { type: 'ORAL' },
      select: { id: true, examId: true },
    }),
    prisma.exam.findMany({
      where: { type: 'ORAL' },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    }),
  ]);
  const withAnswerIds = await prisma.oralAnswer.findMany({
    where: { questionId: { in: questions.map((q) => q.id) } },
    select: { questionId: true },
  });
  const withAnswerSet = new Set(withAnswerIds.map((o) => o.questionId));
  const totalOralQuestions = questions.length;
  const withAnswer = withAnswerSet.size;
  const missing = Math.max(0, totalOralQuestions - withAnswer);

  const byExam: OralStatsByExam[] = exams.map((exam) => {
    const examQuestions = questions.filter((q) => q.examId === exam.id);
    const total = examQuestions.length;
    const withA = examQuestions.filter((q) => withAnswerSet.has(q.id)).length;
    return { examId: exam.id, title: exam.title, total, withAnswer: withA };
  });

  return { totalOralQuestions, withAnswer, missing, byExam };
}

export interface OralPrewarmProgress {
  total: number;
  processed: number;
  generated: number;
  skipped: number;
  errors: number;
  currentQuestionId: string | null;
  done?: boolean;
}

export async function* prewarmOral(
  examId?: string
): AsyncGenerator<OralPrewarmProgress, void, unknown> {
  const where = examId ? { examId, type: 'ORAL' as const } : { type: 'ORAL' as const };
  const questions = await prisma.question.findMany({
    where,
    include: { exam: { select: { language: true } } },
    orderBy: { order: 'asc' },
  });

  const total = questions.length;
  let processed = 0;
  let generated = 0;
  let skipped = 0;
  let errors = 0;

  for (const question of questions) {
    const existing = await prisma.oralAnswer.findUnique({
      where: { questionId: question.id },
    });
    if (existing?.answerHtml?.trim()) {
      skipped += 1;
    } else {
      try {
        const lang: AiLang = question.exam.language === 'UZ' ? 'uz' : 'ru';
        const content = await generateOralAnswer({ lang, question: question.prompt });
        await prisma.oralAnswer.upsert({
          where: { questionId: question.id },
          create: { questionId: question.id, answerHtml: content },
          update: { answerHtml: content },
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
