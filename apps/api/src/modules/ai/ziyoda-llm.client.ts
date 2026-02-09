/**
 * Isolated LLM client for Ziyoda Telegram bot (RAG).
 * Uses OpenAI GPT-4.1 mini for generation and OpenAI embeddings.
 * FUTURE: replace with Ollama or another provider by swapping this module.
 */

import OpenAI from 'openai';

const OPENAI_API_KEY = (process.env.OPENAI_API_KEY ?? '').trim();
const CHAT_MODEL = process.env.ZIYODA_CHAT_MODEL ?? 'gpt-4.1-mini';
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL ?? 'text-embedding-3-small';

let _openai: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY не настроен. Зиёда (бот) недоступна.');
  }
  if (!_openai) {
    _openai = new OpenAI({
      apiKey: OPENAI_API_KEY,
      timeout: 30000,
      maxRetries: 2,
    });
  }
  return _openai;
}

/**
 * Generate completion for Ziyoda RAG (single prompt as user message).
 * Only assistant content is returned; system role is ignored.
 */
export async function generateForZiyoda(prompt: string): Promise<string> {
  const openai = getOpenAI();
  const completion = await openai.chat.completions.create({
    model: CHAT_MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 512,
  });
  const msg = completion.choices[0]?.message;
  if (!msg) {
    throw new Error('Пустой ответ от модели');
  }
  const role = (msg as { role?: string }).role;
  if (role === 'system') {
    throw new Error('Получен ответ с role=system, не показываем пользователю');
  }
  if (role !== 'assistant' && role != null) {
    throw new Error('Ожидался ответ assistant');
  }
  const raw = msg.content?.trim();
  if (raw == null || raw === '') {
    throw new Error('Пустой ответ от модели');
  }
  return raw;
}

/**
 * Get embedding for one text. Returns array of numbers.
 */
export async function embedForZiyoda(input: string): Promise<number[]> {
  const openai = getOpenAI();
  const res = await openai.embeddings.create({
    model: EMBED_MODEL,
    input: input.trim() || ' ',
  });
  const embedding = res.data[0]?.embedding;
  if (!Array.isArray(embedding)) {
    throw new Error('Не удалось получить эмбеддинг');
  }
  return embedding;
}
