/**
 * Editable prompts for Ziyoda RAG (stored in DB, editable in admin).
 */

import { prisma } from '../../db/prisma';

export const ZIYODA_PROMPT_KEYS = [
  'system_instruction',
  'fallback_ru',
  'fallback_uz',
  'unavailable_ru',
  'unavailable_uz',
  'empty_kb_ru',
  'empty_kb_uz',
  'max_chunks',
  'max_context_chars',
  'max_context_msg_len',
] as const;

export type ZiyodaPromptKey = (typeof ZIYODA_PROMPT_KEYS)[number];

export const DEFAULT_PROMPTS: Record<ZiyodaPromptKey, string> = {
  system_instruction:
    'Ziyoda, ассистент ZiyoMed. Отвечай ТОЛЬКО на основе фрагментов в <chunks>. Если ответа в контексте нет — ответь точно этой фразой: {fallback}. Язык ответа: {lang}. Кратко, без приветствия, если пользователь не поздоровался. При наличии предыдущего обмена учитывай контекст (например, медсёстры = hamshira, врачи = shifokor).',
  fallback_ru: 'К сожалению, в официальных материалах ZiyoMed это не указано.',
  fallback_uz: "Afsuski, ZiyoMed rasmiy materiallarida bu ko'rsatilmagan.",
  unavailable_ru: 'Зиёда временно недоступна. Попробуйте позже.',
  unavailable_uz: "Ziyoda vaqtincha mavjud emas. Keyinroq urunib ko'ring.",
  empty_kb_ru: 'База знаний ZiyoMed пока пуста. Обратитесь к администратору для загрузки материалов.',
  empty_kb_uz: "ZiyoMed bilim bazasi hali bo'sh. Materiallarni yuklash uchun administratorga murojaat qiling.",
  max_chunks: '6',
  max_context_chars: '4000',
  max_context_msg_len: '500',
};

export async function getZiyodaPrompts(): Promise<Record<string, string>> {
  const rows = await prisma.ziyodaPrompt.findMany();
  const out: Record<string, string> = { ...DEFAULT_PROMPTS };
  for (const row of rows) {
    if (ZIYODA_PROMPT_KEYS.includes(row.key as ZiyodaPromptKey)) {
      out[row.key] = row.value;
    }
  }
  return out;
}

export async function setZiyodaPrompts(prompts: Record<string, string>): Promise<void> {
  for (const key of ZIYODA_PROMPT_KEYS) {
    const value = prompts[key];
    if (typeof value === 'string' && value.trim() !== '') {
      await prisma.ziyodaPrompt.upsert({
        where: { key },
        create: { key, value: value.trim() },
        update: { value: value.trim() },
      });
    }
  }
}
