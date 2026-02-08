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
  // Для узбекского: uz.wikipedia.org часто пустой — ссылки ведём на ru.wikipedia.org с русским термином в URL; текст ссылки в ответе остаётся на узбекском.
  const linkRule =
    lang === 'uz'
      ? "Asosiy tibbiy atamalarni Markdown havolalari bilan yozing. O'zbekcha Wikipedia ko'p atamalar uchun bo'sh — shuning uchun havolalar har doim RUSCHA Wikipedia ga bo'lsin: https://ru.wikipedia.org/wiki/... URL da atamani RUSCHA yozing (masalan: [Spondiloz](https://ru.wikipedia.org/wiki/Спондилёз)). Javob matnida atama o'zbekcha qolsin, faqat URL ruscha bo'lsin. Bir nechta muhim atamalarni shunday havola qiling."
      : "Ключевые медицинские термины оформляйте в Markdown как ссылки на Wikipedia, например: [термин](https://ru.wikipedia.org/wiki/Термин). Сделайте ссылками несколько важных терминов.";
  const emojiTableRule =
    lang === 'uz'
      ? "Javobni tushunarli qilish uchun emodzilardan foydalaning: 📌 asosiy fikr, 📋 ro'yxat, ⚠️ muhim, 💡 maslahat, ✅ xulosa. Taqqoslash yoki ro'yxat (belgilar, bosqichlar va h.k.) kerak bo'lsa — Markdown jadval ishlating (| ustun | ustun |). Agar foydali bo'lsa, diagramma yoki sxema uchun rasmlarga havola qo'shing: ![tavsif](https://...). Barcha matn o'zbek tilida."
      : "Используйте эмодзи для наглядности: 📌 главное, 📋 список, ⚠️ важно, 💡 совет, ✅ вывод. При необходимости сравнения или перечня (симптомы, стадии и т.д.) — используйте Markdown-таблицу (| столбец | столбец |). При необходимости добавьте ссылку на изображение (схема, диаграмма): ![описание](https://...). Весь текст на русском языке.";
  if (lang === 'uz') {
    return `Siz "Ziyoda" tibbiy og'zaki savollar yordamchisisiz. Savol matni beriladi. Javobingiz qisqa, tushunarli va strukturali bo'lsin (Markdown).
1) 📌 Qisqa javob yoki asosiy fikr
2) Batafsil tushuntirish (bulleted/numbered list, bo'lishi mumkin)
3) Kerak bo'lsa jadval yoki ro'yxat
${linkRule}
${emojiTableRule}`;
  }
  return `Вы — помощник "Зиёда" по устным медицинским вопросам. Дан только текст вопроса. Ваш ответ должен быть кратким, понятным и структурированным (Markdown).
1) 📌 Краткий ответ или основная мысль
2) Подробное объяснение (списки, при необходимости)
3) При необходимости — таблица или структурированный перечень
${linkRule}
${emojiTableRule}`;
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
      max_tokens: 1200,
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

/** Stream oral answer chunk by chunk for lower perceived latency. */
export async function* generateOralAnswerStream(
  input: OralAnswerGeneratorInput
): AsyncGenerator<string, void, unknown> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Генерация устных ответов недоступна.');
  }

  const { lang, question } = input;
  const label = lang === 'uz' ? 'Savol' : 'Вопрос';

  const stream = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: getSystemPrompt(lang) },
      { role: 'user', content: `${label}: ${question}` },
    ],
    temperature: 0.5,
    max_tokens: 1200,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      yield delta;
    }
  }
}
