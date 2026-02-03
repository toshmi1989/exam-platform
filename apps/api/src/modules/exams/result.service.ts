import { getExamById } from './exam.repository';
import { ExamResultDTO } from './result.dto';

export async function buildResult(
  examId: string,
  answers: Record<string, unknown>,
  includeDetails: boolean,
  questionIds?: string[]
): Promise<ExamResultDTO | null> {
  const exam = await getExamById(examId);
  if (!exam) return null;

  let score = 0;
  let maxScore = 0;
  const details: ExamResultDTO['details'] = [];
  const allowedIds =
    questionIds && questionIds.length > 0 ? new Set(questionIds) : null;

  for (const q of exam.questions) {
    if (q.type !== 'test') continue;
    if (allowedIds && !allowedIds.has(q.id)) continue;
    maxScore += 1;
    const correct = q.options.find(o => o.isCorrect)?.id;
    const given = answers[q.id];

    if (given && given === correct) {
      score += 1;
    }

    if (includeDetails && correct) {
      details.push({
        questionId: q.id,
        correctOptionId: correct,
        explanation: q.explanationHtml ?? '—',
      });
    }
  }

  return {
    score,
    maxScore,
    ...(includeDetails ? { details } : {}),
  };
}
