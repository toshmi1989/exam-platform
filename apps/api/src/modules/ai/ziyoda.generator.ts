// Isolated LLM logic for Ziyoda explanations. FUTURE: support multiple LLM providers.

import OpenAI from 'openai';

export type ZiyodaLang = 'ru' | 'uz';

export interface ZiyodaGeneratorInput {
  /** Не передаём в генератор — текст в БД универсальный; обращение по имени добавляется при выдаче пользователю */
  lang: ZiyodaLang;
  question: string;
  options: { label: string }[];
  correctAnswer: string;
  /** Направление/специальность экзамена — чтобы объяснение было в контексте этой области. */
  direction?: string;
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

function getSystemPrompt(lang: ZiyodaLang, direction?: string): string {
  const directionContext =
    direction && direction.trim()
      ? lang === 'uz'
        ? `\n\nMuhim: Savol berilgan yo'nalish/speziallik — "${direction.trim()}". Tushuntirishingiz STRICT shu yo'nalish doirasida bo'lsin. Boshqa sohalarga o'tmang.`
        : `\n\nВажно: вопрос задан в рамках направления/специальности — «${direction.trim()}». Объясняйте СТРОГО в контексте этой специальности. Не уходите в другие области.`
      : '';
  if (lang === 'uz') {
    return `Siz "Ziyoda" tibbiy savol-yo'riqnomasi yordamchisisiz. Savol matni, variantlar va to'g'ri javob beriladi. Javobingiz quyidagi strukturada bo'lsin (Markdown ishlating, sarlavhalarda emoji ishlating):
1) 🧠 Savol qisqacha mazmuni
2) ✅ To'g'ri javob
3) 🔍 Tibbiy tushuntirish
Har bir blok sarlavhasini emoji bilan bosing, masalan: ## 🧠 Savol qisqacha mazmuni, ## ✅ To'g'ri javob, ## 🔍 Tibbiy tushuntirish. Bloklar orasida bo'sh qator, tibbiy tushuntirishda qisqa abzatslar. Barcha matn o'zbek tilida. Qisqa va tushunarli yozing.${directionContext}`;
  }
  return `Вы — помощник "Зиёда" по медицинским вопросам. Даны текст вопроса, варианты ответов и правильный ответ. Ваш ответ должен быть в формате (обязательно используйте Markdown и эмодзи в заголовках для удобства чтения):
1) 🧠 Краткий смысл вопроса
2) ✅ Правильный ответ
3) 🔍 Медицинское объяснение
Обязательно начинайте каждый блок с эмодзи в заголовке, например: ## 🧠 Краткий смысл вопроса, ## ✅ Правильный ответ, ## 🔍 Медицинское объяснение. Между блоками — пустая строка, внутри медицинского объяснения — короткие абзацы. Весь текст на русском языке. Пишите кратко и понятно.${directionContext}`;
}

function getHeader(lang: ZiyodaLang): string {
  return lang === 'uz' ? '👩 Ziyoda tushuntiradi' : '👩 Зиёда объясняет';
}

export async function generateZiyodaExplanation(input: ZiyodaGeneratorInput): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error(
      'OPENAI_API_KEY не настроен. Объяснения Зиёды недоступны.'
    );
  }

  const { lang, question, options, correctAnswer, direction } = input;
  const optionsText = options.map((o) => o.label).join('\n');
  const userContent = `${lang === 'uz' ? 'Savol' : 'Вопрос'}: ${question}\n\n${lang === 'uz' ? 'Variantlar' : 'Варианты ответов'}:\n${optionsText}\n\n${lang === 'uz' ? "To'g'ri javob" : 'Правильный ответ'}: ${correctAnswer}`;

  // gpt-4.1-mini, temperature 0.5, max_tokens 600–800 (streaming: false)
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4.1-mini',
      messages: [
        { role: 'system', content: getSystemPrompt(lang, direction) },
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

/** Stream explanation chunk by chunk for lower perceived latency. */
export async function* generateZiyodaExplanationStream(
  input: ZiyodaGeneratorInput
): AsyncGenerator<string, void, unknown> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Объяснения Зиёды недоступны.');
  }

  const { lang, question, options, correctAnswer, direction } = input;
  const optionsText = options.map((o) => o.label).join('\n');
  const userContent = `${lang === 'uz' ? 'Savol' : 'Вопрос'}: ${question}\n\n${lang === 'uz' ? 'Variantlar' : 'Варианты ответов'}:\n${optionsText}\n\n${lang === 'uz' ? "To'g'ri javob" : 'Правильный ответ'}: ${correctAnswer}`;
  const header = getHeader(lang);

  yield `${header}\n\n`;

  const stream = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: getSystemPrompt(lang, direction) },
      { role: 'user', content: userContent },
    ],
    temperature: 0.5,
    max_tokens: 800,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (typeof delta === 'string' && delta) {
      yield delta;
    }
  }
}
