'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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
  directionGroupId?: string;
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
  directionGroupId?: string;
  category: string;
  profession: string;
  language: string;
  type: string;
  questions: ExamQuestion[];
};

export default function AdminExamsPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'TEST' | 'ORAL' | ''>('');
  const [professionFilter, setProfessionFilter] = useState<'DOCTOR' | 'NURSE' | ''>('');
  const [exams, setExams] = useState<ExamSummary[]>([]);
  const [selectedExamId, setSelectedExamId] = useState<string>('');
  const [selectedExam, setSelectedExam] = useState<ExamDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteSuccess, setDeleteSuccess] = useState<string | null>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
        deleteDirection: 'Delete direction (both languages)',
        deleteDirectionConfirm: 'Delete direction "{name}" (RU and UZ)? All questions will be removed.',
        deleteDone: 'Direction deleted.',
        deleteError: 'Could not delete.',
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
        deleteDirection: "Yo'nalishni o'chirish (ikki til)",
        deleteDirectionConfirm: '«{name}» yo‘nalishini (RU va UZ) o‘chirish? Savollar o‘chiriladi.',
        deleteDone: "Yo'nalish o'chirildi.",
        deleteError: "O'chirib bo'lmadi.",
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
      deleteDirection: 'Удалить направление (оба языка)',
      deleteDirectionConfirm: 'Удалить направление «{name}» (RU и UZ)? Вопросы будут удалены.',
      deleteDone: 'Направление удалено.',
      deleteError: 'Не удалось удалить.',
    };
  }, [language]);

  const copyFilters = useMemo(() => {
    if (language === 'Английский') {
      return { profession: 'Profession', all: 'All', doctor: 'Doctor', nurse: 'Nurse', type: 'Type', test: 'Test', oral: 'Oral' };
    }
    if (language === 'Узбекский') {
      return { profession: 'Kasb', all: 'Barchasi', doctor: 'Shifokor', nurse: 'Hamshira', type: 'Turi', test: 'Test', oral: 'Og\'zaki' };
    }
    return { profession: 'Профессия', all: 'Все', doctor: 'Врачи', nurse: 'Медсёстры', type: 'Тип', test: 'Тест', oral: 'Устный' };
  }, [language]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadExams();
    }, 250);
    return () => clearTimeout(timeout);
  }, [query, typeFilter, professionFilter]);

  async function loadExams() {
    const params = new URLSearchParams();
    if (query) params.set('search', query);
    if (typeFilter) params.set('type', typeFilter);
    if (professionFilter) params.set('profession', professionFilter);
    const { response, data } = await apiFetch(
      `/admin/exams?${params.toString()}`
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

  async function deleteDirection() {
    if (!selectedExam) return;
    const message = copy.deleteDirectionConfirm.replace('{name}', selectedExam.direction);
    if (!window.confirm(message)) return;
    setDeleting(true);
    setErrorMessage(null);
    setDeleteSuccess(null);
    try {
      const params = new URLSearchParams();
      if (selectedExam.directionGroupId) {
        params.set('directionGroupId', selectedExam.directionGroupId);
      } else {
        params.set('profession', selectedExam.profession);
        params.set('type', selectedExam.type);
        params.set('direction', selectedExam.direction);
      }
      const { response } = await apiFetch(`/admin/exams/by-direction?${params}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        setErrorMessage(copy.deleteError);
        return;
      }
      setDeleteSuccess(copy.deleteDone);
      setSelectedExam(null);
      setSelectedExamId('');
      setShowSuggestions(false);
      void loadExams();
    } catch {
      setErrorMessage(copy.deleteError);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <AnimatedPage>
        <main className="flex flex-col gap-6 pb-28 pt-[3.75rem]">
          <AdminGuard>
            <PageHeader title={copy.title} subtitle={copy.subtitle} />
            <AdminNav />

            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-xs text-slate-500">{copyFilters.profession}</p>
                <select
                  value={professionFilter}
                  onChange={(e) => setProfessionFilter((e.target.value || '') as 'DOCTOR' | 'NURSE' | '')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2AABEE]"
                >
                  <option value="">{copyFilters.all}</option>
                  <option value="DOCTOR">{copyFilters.doctor}</option>
                  <option value="NURSE">{copyFilters.nurse}</option>
                </select>
              </div>
              <div>
                <p className="mb-1 text-xs text-slate-500">{copyFilters.type}</p>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter((e.target.value || '') as 'TEST' | 'ORAL' | '')}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 outline-none focus:border-[#2AABEE]"
                >
                  <option value="">{copyFilters.all}</option>
                  <option value="TEST">{copyFilters.test}</option>
                  <option value="ORAL">{copyFilters.oral}</option>
                </select>
              </div>
            </div>

            <div ref={searchContainerRef} className="relative">
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShowSuggestions(true);
                }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={copy.search}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-700 outline-none transition focus:border-[#2AABEE]"
                autoComplete="off"
              />
              {showSuggestions && exams.length > 0 && (
                <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-60 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                  {exams.map((exam) => (
                    <li key={exam.id}>
                      <button
                        type="button"
                        onClick={() => {
                          openExam(exam.id);
                          setQuery(exam.title);
                          setShowSuggestions(false);
                        }}
                        className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                      >
                        {exam.title} · {exam.category} · {exam.direction} · {exam.language} · {exam.questionCount}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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

            {deleteSuccess ? (
              <Card>
                <p className="text-sm text-emerald-600">{deleteSuccess}</p>
              </Card>
            ) : null}
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
                <div className="mb-4 flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    size="md"
                    onClick={() => deleteDirection()}
                    disabled={deleting}
                  >
                    {copy.deleteDirection}
                  </Button>
                </div>
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
