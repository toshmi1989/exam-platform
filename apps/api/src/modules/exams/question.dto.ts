// modules/exams/question.dto.ts

export interface QuestionDTO {
  id: string;
  type: 'test' | 'oral';
  text: string;
  options?: {
    id: string;
    text: string;
  }[];
  correctOptionId?: string;
}
  