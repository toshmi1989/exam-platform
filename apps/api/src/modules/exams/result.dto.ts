export interface ExamResultDTO {
    score: number;
    maxScore: number;
    details?: {
      questionId: string;
      correctOptionId: string;
      explanation?: string;
    }[];
  }
  