import { getExamById } from './exam.repository';
import { QuestionDTO } from './question.dto';

/** Перемешивает массив (Fisher–Yates), не меняя исходный. */
function shuffle<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export async function getQuestionsForExam(
  examId: string,
  options?: { questionIds?: string[]; includeCorrect?: boolean }
): Promise<QuestionDTO[] | null> {
  const exam = await getExamById(examId);
  if (!exam) return null;

  const includeCorrect = options?.includeCorrect === true;
  const questionIds = options?.questionIds;

  const questionMap = new Map(exam.questions.map((q) => [q.id, q]));
  const orderedQuestions =
    questionIds && questionIds.length > 0
      ? questionIds
          .map((id) => questionMap.get(id))
          .filter(Boolean)
      : exam.questions;

  return orderedQuestions.map((q) => {
    const correctOptionId =
      includeCorrect && q.type === 'test'
        ? q.options.find((o) => o.isCorrect)?.id
        : undefined;
    const optionsShuffled =
      q.type === 'test'
        ? shuffle(q.options).map((o) => ({ id: o.id, text: o.text }))
        : undefined;
    return {
      id: q.id,
      type: q.type,
      text: q.text,
      options: optionsShuffled,
      correctOptionId,
    };
  });
}
