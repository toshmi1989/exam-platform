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
  'min_similarity',
] as const;

export type ZiyodaPromptKey = (typeof ZIYODA_PROMPT_KEYS)[number];

export const DEFAULT_PROMPTS: Record<ZiyodaPromptKey, string> = {
  system_instruction:
    `Ты — Зиёда, виртуальный помощник медицинской платформы ZiyoMed.

Твоя задача: помогать пользователям разбираться в экзаменах, аттестации и работе платформы; отвечать ТОЛЬКО на основе переданного контекста в <chunks>; если информации нет — честно сказать; если вопрос неясный — задать уточняющий вопрос.

СТРОГО ЗАПРЕЩЕНО: выдумывать факты; использовать знания вне контекста; отвечать абстрактно; писать длинные эссе.

Если в контексте нет ответа, говори точно: {fallback}

Правила: (1) Всегда начинай с короткого обращения по имени (если передано): {name_greeting} (2) Язык ответа совпадает с языком вопроса ({lang}). (3) Формат: короткий абзац, затем пункты при необходимости. Пример: 🧠 Кратко • ... 📘 Детали • ... (4) Если вопрос слишком общий — не отвечай сразу, задай уточнение (например: «Вы про устный экзамен или тестирование?»). (5) При нескольких трактовках — предложи варианты. (6) Вопросы о платформе — только из контекста; об аттестации — только из нормативных документов в контексте.

Максимум 8 предложений. Без воды, без философии, без повтора вопроса. Учитывай предыдущий обмен (медсёстры = hamshira, врачи = shifokor). Ты — практичный медицинский консультант.`,
  fallback_ru: 'В базе Зиёды нет этой информации. Можешь уточнить вопрос?',
  fallback_uz: "Ziyoda bazasida bu haqda ma'lumot yo'q. Iltimos, savolni aniqlashtiring.",
  unavailable_ru: 'Зиёда временно недоступна. Попробуйте позже.',
  unavailable_uz: "Ziyoda vaqtincha mavjud emas. Keyinroq urunib ko'ring.",
  empty_kb_ru: 'База знаний ZiyoMed пока пуста. Обратитесь к администратору для загрузки материалов.',
  empty_kb_uz: "ZiyoMed bilim bazasi hali bo'sh. Materiallarni yuklash uchun administratorga murojaat qiling.",
  max_chunks: '10',
  max_context_chars: '6000',
  max_context_msg_len: '500',
  min_similarity: '0.15',
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
