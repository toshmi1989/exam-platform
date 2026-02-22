'use client';

import type { OralEvaluationResult, OralCoverageItem } from '../../../../../lib/types';

interface FeedbackPanelProps {
  transcript: string | null;
  score: number;
  maxScore?: number;
  feedback: OralEvaluationResult | null;
  lang?: 'ru' | 'uz' | 'en';
}

const STATUS_LABELS: Record<OralCoverageItem['status'], Record<string, string>> = {
  full: { ru: 'Полностью', uz: "To'liq", en: 'Full' },
  partial: { ru: 'Частично', uz: 'Qisman', en: 'Partial' },
  missing: { ru: 'Не упомянуто', uz: "Aytilmagan", en: 'Missing' },
};

const STATUS_COLORS: Record<OralCoverageItem['status'], string> = {
  full: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  partial: 'bg-amber-100 text-amber-800 border-amber-200',
  missing: 'bg-rose-100 text-rose-800 border-rose-200',
};

const COPY = {
  ru: {
    score: 'Балл',
    transcript: 'Ваш ответ (транскрипция)',
    noTranscript: 'Ответ не был распознан.',
    coverage: 'Покрытие тем',
    missedPoints: 'Пропущенные пункты',
    summary: 'Комментарий',
  },
  uz: {
    score: 'Ball',
    transcript: 'Sizning javobingiz (transkripsiya)',
    noTranscript: "Javob tanilmadi.",
    coverage: "Mavzular qamrovi",
    missedPoints: "O'tkazib yuborilgan nuqtalar",
    summary: 'Izoh',
  },
  en: {
    score: 'Score',
    transcript: 'Your answer (transcript)',
    noTranscript: 'Answer was not recognized.',
    coverage: 'Topic coverage',
    missedPoints: 'Missed points',
    summary: 'Comment',
  },
};

export default function FeedbackPanel({
  transcript,
  score,
  maxScore = 10,
  feedback,
  lang = 'ru',
}: FeedbackPanelProps) {
  const copy = COPY[lang] ?? COPY.ru;
  const langKey = lang === 'en' ? 'en' : lang === 'uz' ? 'uz' : 'ru';

  const scorePercent = Math.round((score / maxScore) * 100);
  const scoreColor =
    scorePercent >= 70
      ? 'text-emerald-700'
      : scorePercent >= 40
      ? 'text-amber-700'
      : 'text-rose-700';
  const barColor =
    scorePercent >= 70
      ? 'bg-emerald-500'
      : scorePercent >= 40
      ? 'bg-amber-400'
      : 'bg-rose-400';

  return (
    <div className="mt-4 flex flex-col gap-4">
      {/* Score bar */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">{copy.score}</span>
          <span className={`text-2xl font-bold ${scoreColor}`}>
            {score} <span className="text-base font-normal text-slate-400">/ {maxScore}</span>
          </span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
          <div
            className={`h-full rounded-full transition-all duration-500 ${barColor}`}
            style={{ width: `${scorePercent}%` }}
          />
        </div>
      </div>

      {/* Transcript */}
      <div className="rounded-xl border border-slate-200 p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {copy.transcript}
        </p>
        <p className="text-sm text-slate-700 italic">
          {transcript ? `"${transcript}"` : copy.noTranscript}
        </p>
      </div>

      {feedback && (
        <>
          {/* Coverage chips */}
          {feedback.coverage.length > 0 && (
            <div className="rounded-xl border border-slate-200 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {copy.coverage}
              </p>
              <div className="flex flex-wrap gap-2">
                {feedback.coverage.map((item, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_COLORS[item.status]}`}
                  >
                    <span>
                      {item.status === 'full' ? '✓' : item.status === 'partial' ? '~' : '✗'}
                    </span>
                    <span>{item.topic}</span>
                    <span className="opacity-70">
                      — {STATUS_LABELS[item.status][langKey]}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Missed points */}
          {feedback.missedPoints.length > 0 && (
            <div className="rounded-xl border border-rose-100 bg-rose-50 p-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-rose-600">
                {copy.missedPoints}
              </p>
              <ul className="flex flex-col gap-1">
                {feedback.missedPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-rose-800">
                    <span className="mt-0.5 text-rose-400">•</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Summary */}
          {feedback.summary && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {copy.summary}
              </p>
              <p className="text-sm text-slate-700">{feedback.summary}</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
