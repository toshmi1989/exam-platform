// modules/exams/exam.model.ts

import { Question } from './question.model';

export type ExamType = 'test' | 'oral';
export type ExamProfession = 'doctor' | 'nurse';
export type ExamLanguage = 'uz' | 'ru';

export interface Exam {
  id: string;
  title: string;
  profession: ExamProfession;
  language: ExamLanguage;
  direction: string;
  categoryId: string;
  type: ExamType;
  timeLimitSeconds: number;
  questions: Question[];
}
  