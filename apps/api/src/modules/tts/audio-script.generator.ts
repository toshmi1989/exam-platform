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

interface GenerateScriptOutput {
  script: string;
  actualLang: 'ru' | 'uz';
}

/**
 * Clean AI explanation: remove markdown, emojis, lists.
 * Do NOT filter by language - Azure can handle mixed text.
 */
function cleanExplanation(text: string): string {
  return text
    .replace(/^#+\s+/gm, '') // headers
    .replace(/#{2,}\s*/g, '') // any multiple # symbols
    .replace(/\*\*(.+?)\*\*/g, '$1') // bold
    .replace(/\*(.+?)\*/g, '$1') // italic
    .replace(/^[-*+]\s+/gm, '') // list bullets
    .replace(/^\d+\.\s+/gm, '') // numbered lists
    .replace(/```[\s\S]*?```/g, '') // code blocks
    .replace(/`([^`]+)`/g, '$1') // inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // links
    .replace(/[🤖🟢🔴📌💡✅❌]/g, '') // emojis
    .replace(/\n{3,}/g, '\n\n') // multiple newlines
    .replace(/Ziyoda tushuntiradi/gi, '')
    .replace(/Savol qisqacha mazmuni/gi, '')
    .replace(/To'g'ri javob/gi, '')
    .replace(/Tibbiy tushuntirish/gi, '')
    .replace(/🤖 Зиёда объясняет/gi, '')
    .replace(/🤖 Ziyoda tushuntiradi/gi, '')
    .replace(/Зиёда объясняет/gi, '')
    .replace(/Краткий смысл/gi, '')
    .replace(/Правильный ответ/gi, '')
    .replace(/Медицинское объяснение/gi, '')
    .replace(/##\s*/g, '')
    .replace(/#\s*/g, '')
    .trim();
}

/**
 * Detect language from text (for logging only, not for filtering).
 */
function detectLanguage(text: string): 'ru' | 'uz' {
  const hasCyrillic = /[А-Яа-яЁё]/.test(text);
  const hasUzbek = /[ЎўҚқҒғҲҳ]/.test(text) || /\b(tushuntiradi|Savol|javob|rentgen|tasvirlarini|qo'llaniladigan)\b/i.test(text);
  
  // If has Uzbek-specific markers, prefer Uzbek
  if (hasUzbek) return 'uz';
  // If has Cyrillic, prefer Russian
  if (hasCyrillic) return 'ru';
  // Default to requested language (will be handled by caller)
  return 'ru';
}

/**
 * Build Russian teacher-style script.
 */
function buildRussianScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];
  
  // Teacher-style opening
  parts.push('Давайте разберём этот вопрос.');
  
  // Main explanation - use as-is, no filtering
  const cleaned = explanation.trim();
  if (cleaned.length > 0) {
    // Split into sentences and add natural flow
    const sentences = cleaned
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 5)
      .slice(0, 8); // Limit to 8 sentences
    
    if (sentences.length > 0) {
      parts.push(...sentences.map(s => {
        // Ensure sentence ends with punctuation
        if (!/[.!?]$/.test(s)) {
          return s + '.';
        }
        return s;
      }));
    } else {
      // Fallback: use first 300 chars
      parts.push(cleaned.slice(0, 300).trim() + '.');
    }
  }
  
  // Closing with emphasis
  if (correctAnswer && correctAnswer.trim().length > 0) {
    parts.push(`Итак, важно запомнить: ${correctAnswer}.`);
  } else {
    parts.push('Это основные моменты, которые важно запомнить.');
  }
  
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build Uzbek teacher-style script.
 */
function buildUzbekScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];
  
  // Teacher-style opening
  parts.push('Keling, bu savolni birgalikda ko\'rib chiqamiz.');
  
  // Main explanation - use as-is, no filtering
  const cleaned = explanation.trim();
  if (cleaned.length > 0) {
    const sentences = cleaned
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 5)
      .slice(0, 8);
    
    if (sentences.length > 0) {
      parts.push(...sentences.map(s => {
        if (!/[.!?]$/.test(s)) {
          return s + '.';
        }
        return s;
      }));
    } else {
      parts.push(cleaned.slice(0, 300).trim() + '.');
    }
  }
  
  // Closing with emphasis
  if (correctAnswer && correctAnswer.trim().length > 0) {
    parts.push(`Demak, muhim narsa: ${correctAnswer}.`);
  } else {
    parts.push('Bu asosiy nuqtalar, ularni eslab qolish kerak.');
  }
  
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation, lang } = input;
  
  // Clean explanation (remove markdown, etc.) but DO NOT filter by language
  const clean = cleanExplanation(aiExplanation);
  
  // Detect language for logging (but don't filter)
  const detectedLang = detectLanguage(clean);
  
  // If detected language differs, log but use detected language for generation
  const actualLang = detectedLang !== lang ? detectedLang : lang;
  if (detectedLang !== lang) {
    console.log(`[Audio Script] Language mismatch: requested ${lang}, detected ${detectedLang}, using ${actualLang}`);
  }
  
  // Build teacher-style script
  let script: string;
  if (actualLang === 'ru') {
    script = buildRussianScript(question, correctAnswer, clean);
  } else {
    script = buildUzbekScript(question, correctAnswer, clean);
  }
  
  // Ensure minimum length
  if (script.length < 30) {
    script = (actualLang === 'ru' 
      ? 'Это важный вопрос, который требует внимательного изучения. ' 
      : 'Bu muhim savol bo\'lib, diqqat bilan o\'rganishni talab qiladi. ') + script;
  }
  
  // Limit maximum length
  if (script.length > 1500) {
    script = script.slice(0, 1500);
    const lastPeriod = script.lastIndexOf('.');
    if (lastPeriod > 1200) {
      script = script.slice(0, lastPeriod + 1);
    }
  }
  
  return { script, actualLang };
}
