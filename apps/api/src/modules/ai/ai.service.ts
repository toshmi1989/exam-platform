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

/**
 * Get explanation from QuestionAIExplanation (by questionId + lang, hash match) or generate via Ziyoda and upsert.
 */
export async function getOrCreateExplanation(
  questionId: string,
  lang: AiLang,
  userName?: string
): Promise<GetOrCreateResult | GetOrCreateError> {
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { order: 'asc' } } },
  });

  if (!question) {
    return { success: false, reasonCode: 'QUESTION_NOT_FOUND', message: 'Вопрос не найден.' };
  }

  const options = question.options.map((o) => ({ id: o.id, label: o.label }));
  const correctOption = question.options.find((o) => o.isCorrect);
  const correctAnswer = correctOption?.label ?? '';
  const hash = computeHash(question.prompt, options, correctAnswer);

  const existing = await prisma.questionAIExplanation.findUnique({
    where: { questionId_lang: { questionId, lang } },
  });

  if (existing && existing.hash === hash) {
    return { success: true, content: existing.content };
  }

  try {
    const content = await generateZiyodaExplanation({
      userName,
      lang,
      question: question.prompt,
      options: options.map((o) => ({ label: o.label })),
      correctAnswer,
    });

    await prisma.questionAIExplanation.upsert({
      where: { questionId_lang: { questionId, lang } },
      create: { questionId, lang, hash, content },
      update: { hash, content },
    });

    return { success: true, content };
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
 * Pre-generate explanations for questions; use QuestionAIExplanation with hash. Skip when hash matches.
 */
export async function* prewarm(
  examId?: string,
  lang?: AiLang
): AsyncGenerator<PrewarmProgress, void, unknown> {
  const where = examId ? { examId } : {};
  const questions = await prisma.question.findMany({
    where,
    include: { options: { orderBy: { order: 'asc' } } },
    orderBy: { order: 'asc' },
  });

  const langs: AiLang[] = lang ? [lang] : ['ru', 'uz'];
  const work: { question: (typeof questions)[0]; lang: AiLang }[] = [];
  for (const q of questions) {
    for (const l of langs) {
      work.push({ question: q, lang: l });
    }
  }
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
      where: { questionId_lang: { questionId: question.id, lang: l } },
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
          where: { questionId_lang: { questionId: question.id, lang: l } },
          create: { questionId: question.id, lang: l, hash, content },
          update: { hash, content },
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
  const targetSlots = totalQuestions * 2;
  const missing = Math.max(0, targetSlots - withExplanation);
  return { totalQuestions, withExplanation, missing };
}
