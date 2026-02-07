// Oral answer generation (Ziyoda). Same LLM as test explanations.

import OpenAI from 'openai';
import type { ZiyodaLang } from './ziyoda.generator';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
if (!OPENAI_API_KEY) {
  console.warn('[oralAnswer] OPENAI_API_KEY is not set; oral answer generation will fail.');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 20000,
  maxRetries: 2,
});

function getSystemPrompt(lang: ZiyodaLang): string {
  const linkRule =
    lang === 'uz'
      ? "Asosiy tibbiy atamalarni Markdown formatida Wikipedia havolalari bilan yozing, masalan: [atama](https://uz.wikipedia.org/wiki/Atama). Bir nechta muhim atamalarni havola qiling."
      : "Ключевые медицинские термины оформляйте в Markdown как ссылки на Wikipedia, например: [термин](https://ru.wikipedia.org/wiki/Термин). Сделайте ссылками несколько важных терминов.";
  if (lang === 'uz') {
    return `Siz "Ziyoda" tibbiy og'zaki savollar yordamchisisiz. Savol matni beriladi. Javobingiz qisqa, tushunarli va strukturali bo'lsin (Markdown).
1) Qisqa javob yoki asosiy fikr
2) Batafsil tushuntirish
${linkRule}
Barcha matn o'zbek tilida.`;
  }
  return `Вы — помощник "Зиёда" по устным медицинским вопросам. Дан только текст вопроса. Ваш ответ должен быть кратким, понятным и структурированным (Markdown).
1) Краткий ответ или основная мысль
2) Подробное объяснение
${linkRule}
Весь текст на русском языке.`;
}

export interface OralAnswerGeneratorInput {
  lang: ZiyodaLang;
  question: string;
}

export async function generateOralAnswer(input: OralAnswerGeneratorInput): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Генерация устных ответов недоступна.');
  }

  const { lang, question } = input;
  const label = lang === 'uz' ? 'Savol' : 'Вопрос';

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: getSystemPrompt(lang) },
        { role: 'user', content: `${label}: ${question}` },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error('Пустой ответ от модели');
    }

    return raw;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('OPENAI') || message.includes('API')) {
      throw new Error('Сервис временно недоступен. Попробуйте позже.');
    }
    throw new Error('Не удалось сгенерировать ответ. Попробуйте позже.');
  }
}
