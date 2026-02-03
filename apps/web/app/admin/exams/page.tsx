'use client';

import { useEffect, useMemo, useState } from 'react';
import AnimatedPage from '../../../components/AnimatedPage';
import BottomNav from '../../../components/BottomNav';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import AdminGuard from '../components/AdminGuard';
import AdminNav from '../components/AdminNav';
import Button from '../../../components/Button';
import { readSettings, Language } from '../../../lib/uiSettings';
import { apiFetch } from '../../../lib/api/client';

type ExamSummary = {
  id: string;
  title: string;
  direction: string;
  category: string;
  profession: string;
  language: string;
  type: string;
  questionCount: number;
};

type ExamQuestion = {
  id: string;
  prompt: string;
  options: { id: string; label: string; isCorrect: boolean }[];
};

type ExamDetail = {
  id: string;
  title: string;
  direction: string;
  category: string;
  profession: string;
  language: string;
  type: string;
  questions: ExamQuestion[];
};

export default function AdminExamsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [query, setQuery] = useState('');
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedExam, setSelectedExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Exams',
        subtitle: 'Manage categories and exams.',
        selectExam: 'Select exam',
        search: 'Search by title or direction',
        questions: 'Questions',
        save: 'Save changes',
        correct: 'Correct',
        loading: 'Loading...',
        saveError: 'Unable to save changes.',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Imtihonlar',
        subtitle: 'Bo‘limlar va imtihonlarni boshqaring.',
        selectExam: 'Imtihonni tanlang',
        search: 'Sarlavha yoki yo‘nalish bo‘yicha qidiring',
        questions: 'Savollar',
        save: 'Saqlash',
        correct: 'To‘g‘ri',
        loading: 'Yuklanmoqda...',
        saveError: 'Saqlab bo‘lmadi.',
      };
    }
    return {
      title: 'Экзамены',
      subtitle: 'Управление категориями и экзаменами.',
      selectExam: 'Выберите экзамен',
      search: 'Поиск по названию или направлению',
      questions: 'Вопросы',
      save: 'Сохранить',
      correct: 'Правильный',
      loading: 'Загружаем...',
      saveError: 'Не удалось сохранить.',
    };
  }, [language]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadExams();
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  async function loadExams() {
    const { response, data } = await apiFetch(
      `/admin/exams?search=${encodeURIComponent(query)}`
    );
    if (!response.ok) return;
    const payload = data as { items?: ExamSummary[] } | null;
    setExams(payload?.items ?? []);
  }

  async function openExam(examId: string) {
    const prevId = selectedExam?.id ?? '';
    setSelectedExamId(examId);
    setLoading(true);
    setErrorMessage(null);
    try {
      const { response, data } = await apiFetch(`/admin/exams/${examId}`);
      if (!response.ok) {
        setSelectedExamId(prevId);
        return;
      }
      const payload = data as { exam?: ExamDetail } | null;
      const exam = payload?.exam ?? null;
      setSelectedExam(exam);
      setSelectedExamId(exam?.id ?? '');
    } finally {
      setLoading(false);
    }
  }

  function updateQuestion(
    questionId: string,
    updater: (question: ExamQuestion) => ExamQuestion
  ) {
    if (!selectedExam) return;
    setSelectedExam({
      ...selectedExam,
      questions: selectedExam.questions.map((question) =>
        question.id === questionId ? updater(question) : question
      ),
    });
  }

  async function saveQuestion(question: ExamQuestion) {
    if (!selectedExam) return;
    const correctOptionId = question.options.find((opt) => opt.isCorrect)?.id;
    if (!correctOptionId) {
      setErrorMessage(copy.saveError);
      return;
    }
    setSavingId(question.id);
    setErrorMessage(null);
    try {
      const { response, data } = await apiFetch(
        `/admin/exams/${selectedExam.id}/questions/${question.id}`,
        {
          method: 'PATCH',
          json: {
            prompt: question.prompt,
            options: question.options.map((opt) => ({
              id: opt.id,
              label: opt.label,
            })),
            correctOptionId,
          },
        }
      );
      if (!response.ok) {
        setErrorMessage(copy.saveError);
        setSavingId(null);
        return;
      }
      const payload = data as { question?: ExamQuestion } | null;
      if (payload?.question) {
        updateQuestion(question.id, () => payload.question as ExamQuestion);
      }
    } catch {
      setErrorMessage(copy.saveError);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              className="rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
            />

            <select
              value={selectedExamId}
              onChange={(event) => {
                const id = event.target.value;
                if (id) openExam(id);
                else {
                  setSelectedExamId('');
                  setSelectedExam(null);
                }
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
            >
              <option value="">{copy.selectExam}</option>
              {exams.map((exam) => (
                <option key={exam.id} value={exam.id}>
                  {exam.title} · {exam.category} · {exam.direction} · {exam.questionCount}
                </option>
              ))}
            </select>

            {errorMessage ? (
              <Card>
                <p className="text-sm text-rose-500">{errorMessage}</p>
              </Card>
            ) : null}

            {loading ? (
              <Card>
                <p className="text-sm text-slate-600">{copy.loading}</p>
              </Card>
            ) : null}

            {selectedExam ? (
              <Card title={`${selectedExam.title} · ${copy.questions}`}>
                <div className="flex flex-col gap-4">
                  {selectedExam.questions.map((question, index) => (
                    <div key={question.id} className="rounded-xl border border-slate-200 p-4">
                      <div className="text-xs text-slate-500">
                        #{index + 1}
                      </div>
                      <textarea
                        value={question.prompt}
                        onChange={(event) =>
                          updateQuestion(question.id, (q) => ({
                            ...q,
                            prompt: event.target.value,
                          }))
                        }
                        className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                        rows={3}
                      />
                      <div className="mt-3 grid gap-2">
                        {question.options.map((option) => (
                          <div key={option.id} className="flex items-center gap-2">
                            <input
                              type="radio"
                              checked={option.isCorrect}
                              onChange={() =>
                                updateQuestion(question.id, (q) => ({
                                  ...q,
                                  options: q.options.map((opt) => ({
                                    ...opt,
                                    isCorrect: opt.id === option.id,
                                  })),
                                }))
                              }
                            />
                            <input
                              value={option.label}
                              onChange={(event) =>
                                updateQuestion(question.id, (q) => ({
                                  ...q,
                                  options: q.options.map((opt) =>
                                    opt.id === option.id
                                      ? { ...opt, label: event.target.value }
                                      : opt
                                  ),
                                }))
                              }
                              className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                            />
                            <span className="text-xs text-slate-500">
                              {option.isCorrect ? copy.correct : ''}
                            </span>
                          </div>
                        ))}
                      </div>
                      <div className="mt-3">
                        <Button
                          size="md"
                          onClick={() => saveQuestion(question)}
                          disabled={savingId === question.id}
                        >
                          {copy.save}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : null}
          </AdminGuard>
        </main>
      </AnimatedPage>
      <BottomNav />
    </>
  );
}
