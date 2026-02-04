import { cookies } from 'next/headers';
import Button from '../../components/Button';
import Card from '../../components/Card';
import PageHeader from '../../components/PageHeader';
import Section from '../../components/Section';
import { LANGUAGE_COOKIE_KEY, languages, Language } from '../../lib/uiSettings';

export default async function HomePage() {
  const cookieStore = await cookies();
  const langCookie = cookieStore.get(LANGUAGE_COOKIE_KEY)?.value ?? 'Русский';
  const language = (languages as readonly string[]).includes(langCookie)
    ? (langCookie as Language)
    : 'Русский';
  const copy =
    language === 'Английский'
      ? {
          title: 'Welcome',
          subtitle: 'Start with a category and take a calm attempt.',
          note: 'CalmExam works best on mobile. Choose a category to begin.',
          open: 'Open categories',
        }
      : language === 'Узбекский'
        ? {
            title: 'Xush kelibsiz',
            subtitle: 'Bo‘limni tanlang va testni sokin boshlang.',
            note: 'CalmExam mobil qurilmada qulayroq. Bo‘lim tanlab boshlang.',
            open: 'Kategoriyalarni ochish',
          }
        : {
            title: 'Добро пожаловать',
            subtitle: 'Выберите категорию и начните спокойную попытку.',
            note: 'CalmExam удобнее на телефоне. Выберите категорию для старта.',
            open: 'Открыть категории',
          };

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      <Card>
        <p className="text-sm text-slate-600">
          {copy.note}
        </p>
      </Card>

      <Button href="/categories" size="lg">
        {copy.open}
      </Button>
    </main>
  );
}
