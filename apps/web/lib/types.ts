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
  examId?: string;
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

export interface SubscriptionPlanOption {
  index: 1 | 2 | 3;
  name: string;
  price: number;
  durationDays: number;
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
  subscriptionPlans?: SubscriptionPlanOption[];
  dismissedBroadcastIds?: string[];
}

export interface AttemptHistoryItem {
  id: string;
  examId: string;
  status: string;
  score?: number;
}

// ─── Oral Exam Session ───────────────────────────────────────────────────────

export interface OralSessionQuestion {
  id: string;
  text: string;
  order: number;
}

export interface OralSession {
  sessionId: string;
  questions: OralSessionQuestion[];
  expiresAt: string; // ISO date string
}

export interface OralCoverageItem {
  topic: string;
  status: 'full' | 'partial' | 'missing';
}

export interface OralEvaluationResult {
  score: number;
  maxScore: 10;
  coverage: OralCoverageItem[];
  missedPoints: string[];
  summary: string;
}

export interface OralAnswerResult {
  transcript: string;
  score: number;
  maxScore: 10;
  feedback: OralEvaluationResult;
}

export interface OralSessionAnswerSummary {
  questionId: string;
  questionText: string;
  transcript: string | null;
  score: number;
  feedback: OralEvaluationResult | null;
}

export interface OralSessionResult {
  sessionId: string;
  score: number;
  maxScore: number;
  passed: boolean;
  passThreshold: number;
  status: string;
  answers: OralSessionAnswerSummary[];
}

export interface OralSessionStatus {
  status: string;
  ttl: number;
  answeredCount: number;
  totalQuestions: number;
}
