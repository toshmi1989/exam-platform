/**
 * Premium academic-level TTS script generator.
 * Output is plain TEXT with paragraph breaks.
 */

interface GenerateScriptInput {
  question: string;
  correctAnswer: string;
  aiExplanation: string;
  lang: 'ru' | 'uz'; // ignored (lang is derived from question)
}

interface GenerateScriptOutput {
  script: string;
  actualLang: 'ru' | 'uz';
}

function detectLang(question: string): 'ru' | 'uz' {
  const cyrillic = /[А-Яа-яЁё]/;
  return cyrillic.test(question) ? 'ru' : 'uz';
}

function removeDuplicateSentences(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const key = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

function cleanText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[🤖🟢🔴📌💡✅❌]/g, '')
    .replace(/Ziyoda tushuntiradi/gi, '')
    .replace(/Savol qisqacha mazmuni/gi, '')
    .replace(/To'g'ri javob/gi, '')
    .replace(/Tibbiy tushuntirish/gi, '')
    .replace(/Зиёда объясняет/gi, '')
    .replace(/Краткий смысл/gi, '')
    .replace(/Правильный ответ/gi, '')
    .replace(/Медицинское объяснение/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function parseListItems(text: string): string[] {
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const items: string[] = [];

  for (const line of lines) {
    const m1 = line.match(/^(\d+)\.\s+(.*)$/);
    if (m1) {
      items.push(m1[2].trim());
      continue;
    }
    const m2 = line.match(/^[-–—]\s+(.*)$/);
    if (m2) {
      items.push(m2[1].trim());
      continue;
    }
  }

  if (items.length >= 2) return items;

  // Comma-separated list heuristic
  const single = text.replace(/\n+/g, ' ').trim();
  const parts = single.split(',').map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 4 && parts.length <= 10) {
    const shortish = parts.every((p) => p.split(/\s+/).length <= 6);
    if (shortish) return parts;
  }
  return [];
}

function detectTerms(text: string): string[] {
  const raw = text;
  const endings = /\b[\p{L}]+(?:itis|osis|oma|logiya|grafiya|skopiya)\b/giu;
  // Match words: letter followed by letters, hyphens, or apostrophes
  const words = raw.match(/\b\p{L}[\p{L}\-']{2,}\b/gu) || [];
  const out: string[] = [];

  for (const w of words) {
    const norm = w.replace(/[-']/g, '');
    if (norm.length > 9) out.push(w);
    if ((/^[A-ZА-ЯЁ]/.test(w) && norm.length > 6) || endings.test(w)) out.push(w);
  }
  out.push(...(raw.match(endings) || []));

  const stop = new Set(['вопрос', 'ответ', 'важно', 'главное', 'основное', 'muhim', 'asosiy', 'savol', 'javob', 'bu', 'это']);
  const uniq = new Set<string>();
  for (const t of out) {
    const key = t.toLowerCase();
    if (stop.has(key)) continue;
    uniq.add(t);
  }
  return Array.from(uniq).slice(0, 5);
}

function insertTermExplanations(text: string, lang: 'ru' | 'uz'): string {
  const terms = detectTerms(text);
  if (!terms.length) return text;

  let out = text;
  let inserted = 0;
  for (const term of terms) {
    if (inserted >= 3) break;
    const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    const m = out.match(re);
    if (!m || m.index == null) continue;

    const idx = m.index + m[0].length;
    const before = out.slice(0, idx);
    const after = out.slice(idx);

    const expl =
      lang === 'ru'
        ? ` ${term}. Это термин, обозначающий важное медицинское понятие.`
        : ` ${term}. Bu atama muhim tibbiy tushunchani bildiradi.`;

    out = before + expl + after;
    inserted++;
  }
  return out;
}

function buildScript(question: string, answer: string, explanation: string, lang: 'ru' | 'uz'): string {
  const q = question.trim().replace(/[.!?]+$/, '');
  const answerClean = cleanText(answer);
  const explanationClean = cleanText(explanation);

  const dedupAnswer = removeDuplicateSentences(answerClean);
  const dedupExplanation = removeDuplicateSentences(explanationClean);

  const listItems = parseListItems(answerClean);

  const blocks: string[] = [];

  // 1) Intro
  blocks.push(
    lang === 'ru'
      ? 'Давайте внимательно разберём этот вопрос.'
      : "Keling, bu savolni bosqichma-bosqich tahlil qilamiz."
  );

  // 2) Clarify question
  blocks.push(
    lang === 'ru'
      ? `Что именно спрашивают: ${q}.`
      : `Savol nimani so'raydi: ${q}.`
  );

  // 3) Core concept explanation (use explanation support)
  const core = (dedupExplanation || '').split(/\n+/).join(' ').trim();
  if (core) {
    blocks.push(
      lang === 'ru'
        ? `Суть понятия в этом вопросе следующая: ${core}`
        : `Bu savolda asosiy tushuncha quyidagicha: ${core}`
    );
  } else {
    blocks.push(
      lang === 'ru'
        ? 'Сначала вспомним базовый механизм и определение, а затем перейдём к признакам и деталям.'
        : "Avval asosiy mexanizm va ta'rifni eslaymiz, keyin esa belgilarga o'tamiz."
    );
  }

  // 4) Key answer points expanded (preserve list)
  if (listItems.length >= 2) {
    const title = lang === 'ru' ? 'Ключевые пункты ответа:' : 'Javobning asosiy bandlari:';
    const formatted = listItems.slice(0, 6).map((it, i) => `${i + 1}. ${it.replace(/[.!?]+$/, '')}.`).join('\n');
    blocks.push(`${title}\n${formatted}`);
  } else if (dedupAnswer) {
    blocks.push(
      lang === 'ru'
        ? `Теперь разберём ключевые элементы ответа: ${dedupAnswer}`
        : `Endi javobning asosiy jihatlarini ko'rib chiqamiz: ${dedupAnswer}`
    );
  }

  // 5) Term clarification (insert immediately after first appearance)
  const joined = blocks.join('\n\n');
  const withTerms = insertTermExplanations(joined, lang);
  const termBlock =
    lang === 'ru'
      ? 'Если встречаются сложные термины, важно понимать их смысл — это помогает выбрать правильную тактику рассуждения.'
      : "Murakkab atamalar uchrasa, ularning ma'nosini tushunish muhim — bu to'g'ri xulosa chiqarishga yordam beradi.";
  blocks.push(termBlock);

  // 6) Final emphasis
  blocks.push(
    lang === 'ru'
      ? 'Запомните — это ключевой принцип.'
      : 'Shuni esda tuting — bu asosiy tamoyil.'
  );

  let script = withTerms;

  // Minimum length 500 chars: expand with example/comparison if needed
  if (script.length < 500) {
    const extra =
      lang === 'ru'
        ? 'Пример: сравните два близких состояния и спросите себя, какой признак действительно отличает их. Такая проверка помогает отвечать уверенно и системно.'
        : "Masalan: yaqin tushunchalarni solishtirib, qaysi belgi ularni ajratishini o'zingizdan so'rang. Bu usul javobni tizimli qiladi.";
    script = script + '\n\n' + extra;
  }

  // Keep within 500–900 chars
  if (script.length > 900) {
    // remove the core-concept paragraph if it's too long
    const parts = script.split('\n\n');
    const compact = [parts[0], parts[1], parts[3], parts[parts.length - 2], parts[parts.length - 1]].filter(Boolean).join('\n\n');
    script = compact.length <= 900 ? compact : compact.slice(0, 880).trimEnd() + '…';
  }

  return script.trim();
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation } = input;
  const lang = detectLang(question);
  const script = buildScript(question, correctAnswer, aiExplanation, lang);
  return { script, actualLang: lang };
}
