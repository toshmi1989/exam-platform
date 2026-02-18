import OpenAI from 'openai';

export type SpeechLang = 'ru' | 'uz';

export interface SpeechRewriteInput {
  question: string;
  aiExplanation: string;
  correctAnswer: string;
  lang: SpeechLang;
}

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
if (!OPENAI_API_KEY) {
  console.warn('[tts:speech] OPENAI_API_KEY is not set; LLM rewrite will fallback.');
}

const openai = new OpenAI({
  apiKey: OPENAI_API_KEY,
  timeout: 20000,
  maxRetries: 2,
});

function detectLang(question: string): SpeechLang {
  return /[А-Яа-яЁё]/.test(question) ? 'ru' : 'uz';
}

function systemPrompt(): string {
  return `You are a senior medical university professor.
Rewrite the provided medical explanation into a natural academic oral lecture.

Rules:
- The user will specify the required output language. Use ONLY that language (Russian = Cyrillic, Uzbek = Latin). Do not mix languages.
- Do NOT repeat the question.
- Do NOT define secondary words outside the main topic.
- Focus strictly on the central medical condition.
- Follow the structure implied by the question (classification, clinical features, diagnosis, emergency care if present).
- Use natural academic transitions.
- Sound like a live university lecture.
- No emojis.
- No markdown.
- No headings.
- No bullet points.
- Produce continuous speech-ready text.
- Finish with a strong academic conclusion.

Target length:
800-1200 characters.`;
}

function userPrompt(input: SpeechRewriteInput): string {
  const langInstruction =
    input.lang === 'ru'
      ? 'Your entire response MUST be in Russian only. Use Cyrillic script. Do not use Uzbek or Latin.'
      : 'Your entire response MUST be in Uzbek only. Use Latin script. Do not use Russian or Cyrillic.';
  return `${langInstruction}

Question:
${input.question}

AI explanation:
${input.aiExplanation}

Correct answer:
${input.correctAnswer}

Task:
Rewrite the explanation as a speech-ready academic lecture.`;
}

function cleanSpeechText(raw: string): string {
  return raw
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export async function rewriteSpeechLecture(input: SpeechRewriteInput): Promise<{ content: string; lang: SpeechLang }> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const lang = detectLang(input.question);

  const completion = await openai.chat.completions.create({
    model: 'gpt-4.1-mini',
    messages: [
      { role: 'system', content: systemPrompt() },
      { role: 'user', content: userPrompt({ ...input, lang }) },
    ],
    temperature: 0.7,
    max_tokens: 1200,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    throw new Error('Empty rewrite result');
  }

  return { content: cleanSpeechText(content), lang };
}
