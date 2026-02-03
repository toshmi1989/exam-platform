// modules/exams/grading.service.ts

import { Exam } from './exam.model';

export interface ExamResult {
  score: number;
  maxScore: number;
}

export function gradeExam(
  exam: Exam,
  answers: Record<string, string>, // questionId → optionId
  questionIds?: string[]
): ExamResult {
  let score = 0;
  let maxScore = 0;
  const allowedIds =
    questionIds && questionIds.length > 0 ? new Set(questionIds) : null;

  for (const q of exam.questions) {
    if (q.type !== 'test') continue;
    if (allowedIds && !allowedIds.has(q.id)) continue;
    maxScore += 1;
    const selected = answers[q.id];
    const correct = q.options.find(o => o.isCorrect)?.id;

    if (selected && selected === correct) {
      score += 1;
    }
  }

  return {
    score,
    maxScore,
  };
}
