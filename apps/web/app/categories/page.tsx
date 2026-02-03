'use client';

import { useEffect, useMemo, useState } from 'react';
import Button from '../../components/Button';
import Card from '../../components/Card';
import PageHeader from '../../components/PageHeader';
import { getCategories } from '../../lib/api/categories';
import { readSettings, Language } from '../../lib/uiSettings';

type Category = {
  id: string;
  name: string;
  exams: { id: string; title: string }[];
};

export default function CategoriesPage() {
  const [language, setLanguage] = useState<Language>(readSettings().language);
  const [categories, setCategories] = useState<Category[]>([]);
  const [hasError, setHasError] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const update = () => setLanguage(readSettings().language);
    window.addEventListener('ui-settings-changed', update);
    return () => window.removeEventListener('ui-settings-changed', update);
  }, []);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setHasError(false);
      try {
        const data = await getCategories();
        setCategories(data.categories ?? []);
      } catch {
        setHasError(true);
      } finally {
        setIsLoading(false);
      }
    };
    void load();
  }, []);

  const copy = useMemo(() => {
    if (language === 'Английский') {
      return {
        title: 'Categories',
        subtitle: 'Pick a category to start.',
        error: 'We could not load categories right now. Please try again later.',
        empty: 'No categories available yet. Please check back soon.',
        loading: 'Loading categories...',
      };
    }
    if (language === 'Узбекский') {
      return {
        title: 'Kategoriyalar',
        subtitle: 'Boshlash uchun kategoriya tanlang.',
        error: 'Hozircha kategoriyalarni yuklab bo‘lmadi. Keyinroq urinib ko‘ring.',
        empty: 'Hozircha kategoriyalar yo‘q. Keyinroq qayta tekshiring.',
        loading: 'Kategoriyalar yuklanmoqda...',
      };
    }
    return {
      title: 'Категории',
      subtitle: 'Выберите категорию для старта.',
      error: 'Не удалось загрузить категории. Попробуйте позже.',
      empty: 'Категорий пока нет. Загляните чуть позже.',
      loading: 'Загружаем категории...',
    };
  }, [language]);

  return (
    <main className="flex flex-col gap-8">
      <PageHeader title={copy.title} subtitle={copy.subtitle} />

      {isLoading ? (
        <Card>
          <p className="text-sm text-slate-600">{copy.loading}</p>
        </Card>
      ) : hasError ? (
        <Card>
          <p className="text-sm text-slate-600">
            {copy.error}
          </p>
        </Card>
      ) : categories.length === 0 ? (
        <Card>
          <p className="text-sm text-slate-600">
            {copy.empty}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {categories.map((category) => (
            <Card key={category.id} title={category.name}>
              <div className="space-y-3">
                {category.exams.map((exam) => (
                  <Button
                    key={exam.id}
                    href={`/exam/${exam.id}`}
                    variant="secondary"
                    size="lg"
                  >
                    {exam.title}
                  </Button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
