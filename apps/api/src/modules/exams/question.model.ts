// modules/exams/question.model.ts

export type QuestionType = 'test' | 'oral';

export interface QuestionOption {
  id: string;
  text: string;
  isCorrect: boolean; // ⚠️ сервер знает, UI — нет
}

export interface Question {
  id: string;
  type: QuestionType;
  text: string;
  options: QuestionOption[];
  oralAnswerHtml?: string;
  explanationHtml?: string;
}
