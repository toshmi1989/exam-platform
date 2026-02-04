export interface ExamAttempt {
  id: string;
  userId: string;
  examId: string;
  status: 'created' | 'inProgress' | 'submitted' | 'completed' | 'expired';
  mode: 'exam' | 'practice';
  questionIds: string[];
  answers: Record<string, string>;
  createdAt: number;
  startedAt?: number;
  expiresAt?: number;
  submittedAt?: number;
  score?: number;
  maxScore?: number;
}
  