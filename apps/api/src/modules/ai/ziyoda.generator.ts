// Isolated LLM logic for Ziyoda explanations. FUTURE: support multiple LLM providers.

import OpenAI from 'openai';

export type ZiyodaLang = 'ru' | 'uz';

export interface ZiyodaGeneratorInput {
  userName?: string;
  lang: ZiyodaLang;
  question: string;
  options: { label: string }[];
  correctAnswer: string;
}

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
if (!OPENAI_API_KEY) {
  console.warn('[ziyoda] OPENAI_API_KEY is not set; explanation generation will fail.');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 20000,
  maxRetries: 2,
});

function getSystemPrompt(lang: ZiyodaLang): string {
  if (lang === 'uz') {
    return `Siz "Ziyoda" tibbiy savol-yo'riqnomasi yordamchisisiz. Savol matni, variantlar va to'g'ri javob beriladi. Javobingiz quyidagi strukturada bo'lsin (Markdown ishlating):
1) 🧠 Savol qisqacha mazmuni
2) ✅ To'g'ri javob
3) 🔍 Tibbiy tushuntirish
Barcha matn o'zbek tilida bo'lsin. Qisqa va tushunarli yozing.`;
  }
  return `Вы — помощник "Зиёда" по медицинским вопросам. Даны текст вопроса, варианты ответов и правильный ответ. Ваш ответ должен быть в формате (используйте Markdown):
1) 🧠 Краткий смысл вопроса
2) ✅ Правильный ответ
3) 🔍 Медицинское объяснение
Весь текст на русском языке. Пишите кратко и понятно.`;
}

function getHeader(lang: ZiyodaLang): string {
  return lang === 'uz' ? '🤖 Ziyoda tushuntiradi' : '🤖 Зиёда объясняет';
}

export async function generateZiyodaExplanation(input: ZiyodaGeneratorInput): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY не настроен. Объяснения Зиёды недоступны.'
    );
  }

  const { userName, lang, question, options, correctAnswer } = input;
  const optionsText = options.map((o) => o.label).join('\n');
  const greeting = (userName ?? '').trim()
    ? (lang === 'uz' ? `${userName}, keling bu savolni ko'rib chiqamiz.` : `${userName}, давайте разберём этот вопрос.`)
    : (lang === 'uz' ? 'Savol:' : 'Вопрос:');
  const userContent = `${greeting}\n\n${lang === 'uz' ? 'Savol' : 'Вопрос'}: ${question}\n\n${lang === 'uz' ? 'Variantlar' : 'Варианты ответов'}:\n${optionsText}\n\n${lang === 'uz' ? "To'g'ri javob" : 'Правильный ответ'}: ${correctAnswer}`;

  // gpt-4.1-mini, temperature 0.5, max_tokens 600–800 (streaming: false)
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: getSystemPrompt(lang) },
        { role: 'user', content: userContent },
      ],
      temperature: 0.5,
      max_tokens: 800,
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) {
      throw new Error('Пустой ответ от модели');
    }

    const header = getHeader(lang);
    return `${header}\n\n${raw}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('OPENAI') || message.includes('API')) {
      throw new Error('Сервис объяснений временно недоступен. Попробуйте позже.');
    }
    throw new Error('Не удалось сгенерировать объяснение. Попробуйте позже.');
  }
}
