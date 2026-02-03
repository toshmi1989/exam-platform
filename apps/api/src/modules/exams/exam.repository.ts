// modules/exams/exam.repository.ts

import { prisma } from '../../db/prisma';
import { Exam, ExamLanguage, ExamProfession, ExamType } from './exam.model';
import { QuestionType } from './question.model';

function mapExamType(type: string): ExamType {
  return type === 'ORAL' ? 'oral' : 'test';
}

function mapQuestionType(type: string): QuestionType {
  return type === 'ORAL' ? 'oral' : 'test';
}

function mapExamProfession(value: string): ExamProfession {
  return value === 'NURSE' ? 'nurse' : 'doctor';
}

function mapExamLanguage(value: string): ExamLanguage {
  return value === 'RU' ? 'ru' : 'uz';
}

export async function getExamById(examId: string): Promise<Exam | null> {
  const exam = await prisma.exam.findUnique({
    where: { id: examId },
    include: {
      questions: {
        orderBy: { order: 'asc' },
        include: {
          options: { orderBy: { order: 'asc' } },
          oralAnswer: true,
        },
      },
    },
  });

  if (!exam) return null;

  return {
    id: exam.id,
    title: exam.title,
    profession: mapExamProfession(exam.profession),
    language: mapExamLanguage(exam.language),
    direction: exam.direction,
    categoryId: exam.categoryId,
    type: mapExamType(exam.type),
    timeLimitSeconds: exam.timeLimitSeconds,
    questions: exam.questions.map((question) => ({
      id: question.id,
      type: mapQuestionType(question.type),
      text: question.prompt,
      options: question.options.map((option) => ({
        id: option.id,
        text: option.label,
        isCorrect: option.isCorrect,
      })),
      oralAnswerHtml: question.oralAnswer?.answerHtml ?? undefined,
      explanationHtml: question.explanationHtml ?? undefined,
    })),
  };
}
