import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: (process.env.OPENAI_API_KEY ?? '').trim(),
  timeout: 30000,
  maxRetries: 2,
});

export interface CoverageItem {
  topic: string;
  status: 'full' | 'partial' | 'missing';
}

export interface EvaluationResult {
  score: number;
  maxScore: 10;
  coverage: CoverageItem[];
  missedPoints: string[];
  summary: string;
}

const SYSTEM_PROMPT_RU = `Ты — строгий экзаменатор медицинского университета. Твоя задача — оценить устный ответ студента на вопрос.

Тебе будет предоставлено:
1. Текст вопроса
2. Эталонный ответ (правильный академический ответ)
3. Транскрипция ответа студента

Оцени ответ студента по шкале от 0 до 10 и верни строго JSON (без markdown, без пояснений вне JSON).

Критерии оценки:
- 9–10: Полный, точный, структурированный ответ. Студент охватил все ключевые темы.
- 7–8: Хороший ответ. Пропущены незначительные детали.
- 5–6: Частичный ответ. Основная суть понята, но важные пункты пропущены.
- 3–4: Слабый ответ. Понимание поверхностное, много ошибок.
- 1–2: Ответ почти неверный. Очень мало правильной информации.
- 0: Нет ответа или полностью неверный ответ.

Формат ответа (строго JSON):
{
  "score": <число 0-10>,
  "maxScore": 10,
  "coverage": [
    { "topic": "<тема>", "status": "full" | "partial" | "missing" }
  ],
  "missedPoints": ["<пропущенный пункт>"],
  "summary": "<краткое резюме оценки на русском>"
}`;

const SYSTEM_PROMPT_UZ = `Siz tibbiyot universitetining qat'iy ekzaminatoriсиз. Vazifangiz — talabaning og'zaki javobini baholash.

Sizga quyidagilar beriladi:
1. Savol matni
2. Namunali javob (to'g'ri akademik javob)
3. Talabaning javob transkripsiyasi

Talabaning javobini 0 dan 10 gacha baholang va faqat JSON qaytaring (markdown yo'q, JSON dan tashqari tushuntirish yo'q).

Baholash mezonlari:
- 9–10: To'liq, aniq, tuzilgan javob.
- 7–8: Yaxshi javob. Kichik detallar o'tkazib yuborilgan.
- 5–6: Qisman javob. Asosiy ma'no tushunilgan, lekin muhim nuqtalar yo'q.
- 3–4: Zaif javob. Yuzaki tushunish, ko'p xatolar.
- 1–2: Deyarli noto'g'ri javob.
- 0: Javob yo'q yoki mutlaqo noto'g'ri.

Javob formati (faqat JSON):
{
  "score": <0-10 raqam>,
  "maxScore": 10,
  "coverage": [
    { "topic": "<mavzu>", "status": "full" | "partial" | "missing" }
  ],
  "missedPoints": ["<o'tkazib yuborilgan nuqta>"],
  "summary": "<o'zbek tilida qisqa baho xulosasi>"
}`;

export async function evaluateAnswer(
  questionText: string,
  referenceAnswer: string,
  transcript: string,
  lang: 'ru' | 'uz'
): Promise<EvaluationResult> {
  const systemPrompt = lang === 'uz' ? SYSTEM_PROMPT_UZ : SYSTEM_PROMPT_RU;

  const userContent =
    lang === 'ru'
      ? `Вопрос:\n${questionText}\n\nЭталонный ответ:\n${referenceAnswer}\n\nОтвет студента:\n${transcript || '(студент ничего не сказал)'}`
      : `Savol:\n${questionText}\n\nNamunali javob:\n${referenceAnswer}\n\nTalabaning javobi:\n${transcript || "(talaba hech narsa aytmadi)"}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4.1',
      temperature: 0.2,
      max_tokens: 800,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      response_format: { type: 'json_object' },
    });

    const raw = response.choices[0]?.message?.content ?? '{}';
    const parsed = JSON.parse(raw) as Partial<EvaluationResult>;

    return {
      score: typeof parsed.score === 'number' ? Math.min(10, Math.max(0, parsed.score)) : 0,
      maxScore: 10,
      coverage: Array.isArray(parsed.coverage) ? parsed.coverage : [],
      missedPoints: Array.isArray(parsed.missedPoints) ? parsed.missedPoints : [],
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    };
  } catch (err) {
    console.error('[oral.evaluator] GPT evaluation failed:', err);
    return {
      score: 0,
      maxScore: 10,
      coverage: [],
      missedPoints: [],
      summary: lang === 'ru' ? 'Не удалось оценить ответ.' : "Javobni baholab bo'lmadi.",
    };
  }
}
