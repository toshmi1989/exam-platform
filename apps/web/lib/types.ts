export interface ApiError {
  reasonCode?: string;
  message?: string;
}

export interface AttemptRef {
  attemptId: string;
  raw: unknown;
}

export interface ExamQuestion {
  id: string;
  text: string;
  options?: {
    id: string;
    text: string;
  }[];
  correctOptionId?: string;
}

export interface ExamResult {
  score: number;
  maxScore: number;
  mode?: 'exam' | 'practice';
  details?: {
    questionId: string;
    correctOptionId: string;
    explanation?: string;
  }[];
}

export interface ExamReview {
  questions: ExamQuestion[];
  answers: Record<string, string>;
}

export interface UserProfile {
  telegramId: string;
  acceptedTerms?: boolean;
  acceptedAt?: string | null;
  agreementVersion?: string | null;
  subscriptionActive?: boolean;
  subscriptionEndsAt?: string;
  oneTimePrice?: number;
  subscriptionPrice?: number;
  dismissedBroadcastIds?: string[];
}

export interface AttemptHistoryItem {
  id: string;
  examId: string;
  status: string;
  score?: number;
}
