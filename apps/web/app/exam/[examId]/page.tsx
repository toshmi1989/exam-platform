import { cookies } from 'next/headers';
import Button from '../../../components/Button';
import Card from '../../../components/Card';
import PageHeader from '../../../components/PageHeader';
import Section from '../../../components/Section';
import { LANGUAGE_COOKIE_KEY, languages, Language } from '../../../lib/uiSettings';

interface ExamPageProps {
  params: { examId: string };
}

export default function ExamPage({ params }: ExamPageProps) {
  const langCookie = cookies().get(LANGUAGE_COOKIE_KEY)?.value ?? 'Русский';
  const language = (languages as readonly string[]).includes(langCookie)
    ? (langCookie as Language)
    : 'Русский';
  const copy =
    language === 'Английский'
      ? {
          title: 'Exam overview',
          subtitle: 'A quick snapshot before you begin your attempt.',
          examId: 'Exam ID:',
          time: 'Time:',
          questions: 'Questions:',
          start: 'Start exam',
        }
      : language === 'Узбекский'
        ? {
            title: 'Imtihon haqida',
            subtitle: 'Boshlashdan oldin qisqa ma’lumot.',
            examId: 'Imtihon ID:',
            time: 'Vaqt:',
            questions: 'Savollar:',
            start: 'Imtihonni boshlash',
          }
        : {
            title: 'Обзор экзамена',
            subtitle: 'Короткая информация перед началом.',
            examId: 'ID экзамена:',
            time: 'Время:',
            questions: 'Вопросов:',
            start: 'Начать экзамен',
          };
  return (
    <main className="flex flex-col gap-8">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      <Card>
        <div className="space-y-3 text-sm text-slate-600">
          <div>
            <span className="font-semibold text-slate-800">{copy.examId}</span>{' '}
            {params.examId}
          </div>
          <div>
            <span className="font-semibold text-slate-800">{copy.time}</span> ~45 min
          </div>
          <div>
            <span className="font-semibold text-slate-800">{copy.questions}</span>{' '}
            20
          </div>
        </div>
      </Card>

      <Button href={`/exam/${params.examId}/start`} size="lg">
        {copy.start}
      </Button>
    </main>
  );
}
