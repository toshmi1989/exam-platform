import { getExamById } from './exam.repository';
import { QuestionDTO } from './question.dto';

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

  return orderedQuestions.map((q) => ({
    id: q.id,
    type: q.type,
    text: q.text,
    options:
      q.type === 'test'
        ? q.options.map((o) => ({
            id: o.id,
            text: o.text,
          }))
        : undefined,
    correctOptionId:
      includeCorrect && q.type === 'test'
        ? q.options.find((o) => o.isCorrect)?.id
        : undefined,
  }));
}
