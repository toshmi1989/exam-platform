/**
 * Generates teacher-style audio script from AI explanation.
 * Conversational tone, natural flow, no markdown, no lists.
 * Max 1200-1500 chars, 60-90 seconds speech.
 */

interface GenerateScriptInput {
  question: string;
  correctAnswer: string;
  aiExplanation: string;
  lang: 'ru' | 'uz';
}

/**
 * Filter text by language - keep only sentences in target language.
 */
function filterByLanguage(text: string, targetLang: 'ru' | 'uz'): string {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean);
  const filtered: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) continue;

    if (targetLang === 'ru') {
      // Keep Russian: has Cyrillic, no Uzbek Latin patterns
      const hasCyrillic = /[А-Яа-яЁё]/.test(trimmed);
      const hasUzbekLatin = /\b(tushuntiradi|Savol|javob|Tibbiy|mazmuni|orasidagi|farq|shovqinlar|qattiq|baland|nafas|chiqarish|eshitiladi|yumshoq|past|kuchliroq|traxeya|bronxlarda|bo'lib|paytida|anik|teng|kichik|havo|yo'llaridan|keladi|tonli|olish)\b/i.test(trimmed);
      if (hasCyrillic && !hasUzbekLatin) {
        filtered.push(trimmed);
      }
    } else {
      // Keep Uzbek: has Uzbek Latin or Cyrillic patterns
      const hasUzbek = /[А-Яа-яЁёЎўҚқҒғҲҳ]/.test(trimmed) || /\b(tushuntiradi|Savol|javob|Tibbiy|mazmuni|orasidagi|farq|shovqinlar|qattiq|baland|nafas|chiqarish|eshitiladi|yumshoq|past|kuchliroq|traxeya|bronxlarda|bo'lib|paytida|anik|teng|kichik|havo|yo'llaridan|keladi|tonli|olish)\b/i.test(trimmed);
      const hasOnlyRussian = /[А-Яа-яЁё]/.test(trimmed) && !/[ЎўҚқҒғҲҳ]/.test(trimmed) && !/\b(tushuntiradi|Savol|javob|Tibbiy|mazmuni|orasidagi|farq|shovqinlar|qattiq|baland|nafas|chiqarish|eshitiladi|yumshoq|past|kuchliroq|traxeya|bronxlarda|bo'lib|paytida|anik|teng|kichik|havo|yo'llaridan|keladi|tonli|olish)\b/i.test(trimmed);
      if (hasUzbek && !hasOnlyRussian) {
        filtered.push(trimmed);
      }
    }
  }

  return filtered.join('. ') + (filtered.length > 0 ? '.' : '');
}

export function generateAudioScript(input: GenerateScriptInput): string {
  const { question, correctAnswer, aiExplanation, lang } = input;

  // Clean AI explanation: remove markdown, emojis, lists
  let clean = aiExplanation
    .replace(/^#+\s+/gm, '') // headers
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/^[-*+]\s+/gm, '') // list bullets
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[🤖🟢🔴📌💡✅❌]/g, '') // emojis
    .replace(/\n{3,}/g, '\n\n') // multiple newlines
    .trim();

  // Remove language-specific headers and footers
  clean = clean
    .replace(/Ziyoda tushuntiradi/gi, '')
    .replace(/Savol qisqacha mazmuni/gi, '')
    .replace(/To'g'ri javob/gi, '')
    .replace(/Tibbiy tushuntirish/gi, '')
    .replace(/🤖 Зиёда объясняет/gi, '')
    .replace(/🤖 Ziyoda tushuntiradi/gi, '')
    .trim();

  // Filter by target language
  clean = filterByLanguage(clean, lang);

  // Build teacher-style explanation
  if (lang === 'ru') {
    return buildRussianScript(question, correctAnswer, clean);
  } else {
    return buildUzbekScript(question, correctAnswer, clean);
  }
}

function buildRussianScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];

  // Teacher-style opening - natural, warm
  const openings = [
    'Давайте разберём этот вопрос вместе.',
    'Это интересный вопрос, давайте его обсудим.',
    'Хороший вопрос! Давайте разберёмся.',
  ];
  parts.push(openings[Math.floor(Math.random() * openings.length)]);

  // Main explanation - convert to conversational flow with natural transitions
  const sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 10) // filter very short fragments
    .slice(0, 10);

  if (sentences.length > 0) {
    // Add natural flow between sentences
    for (let i = 0; i < sentences.length; i++) {
      if (i === 0) {
        parts.push(sentences[i] + '.');
      } else if (i === Math.floor(sentences.length / 2)) {
        // Middle transition
        parts.push('Теперь важно понимать, что', sentences[i] + '.');
      } else {
        parts.push(sentences[i] + '.');
      }
    }
  }

  // Natural closing with emphasis on key concept (only if we have an answer)
  if (correctAnswer && correctAnswer.trim().length > 0) {
    const closings = [
      `Итак, ключевой момент здесь — это ${correctAnswer}.`,
      `Таким образом, главное, что нужно запомнить — ${correctAnswer}.`,
      `Подводя итог, важно понимать, что ${correctAnswer} — это основное в данном вопросе.`,
    ];
    parts.push(closings[Math.floor(Math.random() * closings.length)]);
  } else {
    // If no specific answer, use generic closing
    const closings = [
      'Итак, это основные моменты, которые важно запомнить.',
      'Таким образом, мы разобрали ключевые аспекты этого вопроса.',
      'Подводя итог, важно понимать основные принципы, о которых мы говорили.',
    ];
    parts.push(closings[Math.floor(Math.random() * closings.length)]);
  }

  let script = parts.join(' ').replace(/\s+/g, ' ').trim();

  // Ensure length limit
  if (script.length > 1500) {
    script = script.slice(0, 1500);
    const lastPeriod = script.lastIndexOf('.');
    if (lastPeriod > 1200) {
      script = script.slice(0, lastPeriod + 1);
    }
  }

  return script;
}

function buildUzbekScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];

  // Teacher-style opening
  const openings = [
    'Keling, bu savolni birga ko\'rib chiqamiz.',
    'Bu qiziqarli savol, keling muhokama qilamiz.',
    'Yaxshi savol! Keling, tushunib olamiz.',
  ];
  parts.push(openings[Math.floor(Math.random() * openings.length)]);

  const sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 10)
    .slice(0, 10);

  if (sentences.length > 0) {
    for (let i = 0; i < sentences.length; i++) {
      if (i === 0) {
        parts.push(sentences[i] + '.');
      } else if (i === Math.floor(sentences.length / 2)) {
        parts.push('Endi muhim narsa shuki,', sentences[i] + '.');
      } else {
        parts.push(sentences[i] + '.');
      }
    }
  }

  const closings = [
    `Demak, asosiy nuqta shuki — bu ${correctAnswer}.`,
    `Shunday qilib, eslab qolish kerak bo\'lgan asosiy narsa — ${correctAnswer}.`,
    `Xulosa qilib aytganda, ${correctAnswer} — bu savoldagi eng muhim narsa.`,
  ];
  parts.push(closings[Math.floor(Math.random() * closings.length)]);

  let script = parts.join(' ').replace(/\s+/g, ' ').trim();

  if (script.length > 1500) {
    script = script.slice(0, 1500);
    const lastPeriod = script.lastIndexOf('.');
    if (lastPeriod > 1200) {
      script = script.slice(0, lastPeriod + 1);
    }
  }

  return script;
}
