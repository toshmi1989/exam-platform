/**
 * Зиёда — AI explanations via OpenAI GPT-4.1-mini.
 * All AI logic isolated here for future provider swap.
 */

import OpenAI from 'openai';

export type ZiyadaLang = 'ru' | 'uz';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
const MODEL = 'gpt-4.1-mini';
const MAX_TOKENS = 600;
const TEMPERATURE = 0.6;

if (!OPENAI_API_KEY) {
  console.warn('[ziyada] OPENAI_API_KEY is not set; explanation generation will fail.');
}

export interface GenerateExplanationParams {
  question: string;
  options: { label: string }[];
  correctAnswer: string;
  lang: ZiyadaLang;
  userName?: string;
}

function buildSystemPrompt(lang: ZiyadaLang): string {
  if (lang === 'uz') {
    return `Siz "Зиёда" (Ziyoda) tibbiy savol yo'riqnomasi yordamchisisiz.
Javobingiz quyidagi strukturada bo'lsin (Markdown):
1. 🧠 Savol qisqacha mazmuni
2. ✅ To'g'ri javob
3. 🔍 Nima uchun aynan shunday (tibbiy tushuntirish)
4. 📌 Qisqa xulosa
Barcha matn o'zbek tilida. Qisqa, tushunarli, tibbiy ton.`;
  }
  return `Вы — помощник "Зиёда" по медицинским вопросам.
Ответ должен быть в формате (Markdown):
1. 🧠 Коротко о вопросе
2. ✅ Правильный ответ
3. 🔍 Почему именно так (медицинское объяснение)
4. 📌 Краткий вывод
Весь текст на русском. Коротко, понятно, медицинский тон.`;
}

function buildUserPrompt(params: GenerateExplanationParams): string {
  const { question, options, correctAnswer, lang, userName } = params;
  const name = (userName ?? '').trim() || (lang === 'uz' ? 'Foydalanuvchi' : 'Пользователь');
  const optionsText = options.map((o) => o.label).join('\n');

  if (lang === 'uz') {
    return `${name}, keling bu savolni ko'rib chiqamiz 👇

Savol: ${question}

Variantlar:
${optionsText}

To'g'ri javob: ${correctAnswer}

Yuqoridagi strukturada (1–4) javob bering.`;
  }

  return `${name}, давайте разберём этот вопрос 👇

Вопрос: ${question}

Варианты ответов:
${optionsText}

Правильный ответ: ${correctAnswer}

Ответьте по структуре выше (пункты 1–4).`;
}

export async function generateExplanation(params: GenerateExplanationParams): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Объяснения Зиёды недоступны.');
  }

  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
  const systemPrompt = buildSystemPrompt(params.lang);
  const userPrompt = buildUserPrompt(params);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: MAX_TOKENS,
    temperature: TEMPERATURE,
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('Пустой ответ от модели');
  }

  return raw;
}
