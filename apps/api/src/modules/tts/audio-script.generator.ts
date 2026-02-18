/**
 * Generates premium professor-style audio script from question and answer.
 * Based on QUESTION (primary) + ANSWER (key points) + explanation (support).
 * Minimum 500 chars, structured in 4-6 blocks.
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
 * Deterministic language detection based on QUESTION.
 * Cyrillic → RU, Latin → UZ.
 */
function detectLang(question: string): 'ru' | 'uz' {
  const cyrillic = /[А-Яа-яЁё]/;
  return cyrillic.test(question) ? 'ru' : 'uz';
}

/**
 * Remove duplicate sentences from text.
 */
function removeDuplicateSentences(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])/)
    .map(s => s.trim())
    .filter(s => {
      if (!s || s.length < 10) return false;
      const normalized = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(normalized)) return false;
      seen.add(normalized);
      return true;
    })
    .join(' ');
}

/**
 * Clean text: remove markdown, emojis, lists.
 */
function cleanText(text: string): string {
  return text
    .replace(/^#+\s+/gm, '') // headers
    .replace(/#{2,}\s*/g, '') // multiple # symbols
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
 * Detect medical terms in text (capitalized nouns or long words).
 */
function detectMedicalTerms(text: string, lang: 'ru' | 'uz'): string[] {
  const terms: string[] = [];
  
  // Russian medical terms pattern
  if (lang === 'ru') {
    // Capitalized words (likely medical terms)
    const capitalized = text.match(/\b[А-ЯЁ][а-яё]{8,}\b/g) || [];
    // Long words (>10 chars)
    const longWords = text.match(/\b[А-Яа-яЁё]{11,}\b/g) || [];
    
    terms.push(...capitalized);
    terms.push(...longWords.filter(w => !terms.includes(w)));
  } else {
    // Uzbek medical terms pattern
    const capitalized = text.match(/\b[A-Z][a-z]{8,}\b/g) || [];
    const longWords = text.match(/\b[A-Za-z]{11,}\b/g) || [];
    
    terms.push(...capitalized);
    terms.push(...longWords.filter(w => !terms.includes(w)));
  }
  
  // Remove duplicates and common words
  const commonWords = lang === 'ru' 
    ? ['это', 'этот', 'этого', 'этом', 'который', 'которого', 'котором', 'которые']
    : ['bu', 'bu', 'shu', 'qaysi', 'qanday'];
  
  return [...new Set(terms)]
    .filter(term => !commonWords.includes(term.toLowerCase()))
    .slice(0, 5); // Limit to 5 terms
}

/**
 * Expand medical terms with explanations.
 */
function expandTerms(text: string, lang: 'ru' | 'uz'): string {
  const terms = detectMedicalTerms(text, lang);
  if (terms.length === 0) return text;
  
  let expanded = text;
  const explained = new Set<string>();
  
  for (const term of terms) {
    if (explained.has(term.toLowerCase())) continue;
    explained.add(term.toLowerCase());
    
    // Find first occurrence
    const regex = new RegExp(`\\b${term}\\b`, 'i');
    const match = expanded.match(regex);
    if (!match) continue;
    
    const index = match.index!;
    const before = expanded.slice(0, index + term.length);
    const after = expanded.slice(index + term.length);
    
    // Add explanation
    let explanation = '';
    if (lang === 'ru') {
      explanation = ` ${term} — это метод диагностики, который позволяет получить детальную информацию о состоянии органов и тканей.`;
    } else {
      explanation = ` ${term} — bu diagnostika usuli bo'lib, u organlar va to'qimalar holatini batafsil ko'rsatadi.`;
    }
    
    expanded = before + explanation + after;
  }
  
  return expanded;
}

/**
 * Extract key points from text.
 */
function extractKeyPoints(text: string, lang: 'ru' | 'uz'): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  
  // Remove duplicates first
  const deduplicated = removeDuplicateSentences(cleaned);
  
  // Split into sentences and filter meaningful ones
  const sentences = deduplicated
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 20 && s.length < 250)
    .slice(0, 8); // Take up to 8 key sentences
  
  return sentences;
}

/**
 * Build Russian professor-style script (4-6 blocks).
 */
function buildRussianScript(question: string, correctAnswer: string, explanation: string): string {
  const blocks: string[] = [];
  
  // Block 1: Premium intro
  blocks.push('Давайте внимательно разберём этот вопрос.');
  
  // Block 2: What the question asks
  const questionClean = question.trim().replace(/[.!?]+$/, '');
  if (questionClean.length > 0 && questionClean.length < 200) {
    blocks.push(`Вопрос звучит следующим образом: ${questionClean}.`);
  }
  
  // Block 3: Core concept explanation
  const explanationPoints = extractKeyPoints(explanation, 'ru');
  const answerPoints = extractKeyPoints(correctAnswer, 'ru');
  
  if (explanationPoints.length > 0 || answerPoints.length > 0) {
    blocks.push('Обратите внимание на ключевые аспекты этого вопроса.');
    
    // Combine and deduplicate points
    const allPoints = [...answerPoints, ...explanationPoints];
    const uniquePoints = removeDuplicateSentences(allPoints.join('. '))
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15)
      .slice(0, 6);
    
    if (uniquePoints.length > 0) {
      blocks.push(...uniquePoints.map((point, i) => {
        const p = point.endsWith('.') ? point : point + '.';
        if (i === 0) {
          return `Во-первых, ${p.toLowerCase()}`;
        } else if (i === uniquePoints.length - 1) {
          return `И наконец, ${p.toLowerCase()}`;
        }
        return p;
      }));
    }
  }
  
  // Block 4: Expand terms
  const combinedText = [correctAnswer, explanation].join(' ');
  const withTerms = expandTerms(combinedText, 'ru');
  if (withTerms !== combinedText) {
    // Extract new sentences from expanded text
    const newSentences = withTerms
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !blocks.some(b => b.includes(s.slice(0, 50))))
      .slice(0, 2);
    
    if (newSentences.length > 0) {
      blocks.push(...newSentences.map(s => s.endsWith('.') ? s : s + '.'));
    }
  }
  
  // Block 5: Final emphasis
  if (correctAnswer && correctAnswer.trim().length > 0) {
    const shortAnswer = correctAnswer.trim().slice(0, 120);
    blocks.push(`Запомните — это ключевой принцип: ${shortAnswer}.`);
  } else {
    blocks.push('Запомните — это ключевой принцип, который необходимо усвоить.');
  }
  
  // Join blocks with paragraph breaks
  let script = blocks.join('\n\n');
  
  // Ensure minimum length (500 chars)
  if (script.length < 500) {
    const additional = 'Это важный вопрос, который требует детального изучения. Необходимо понимать все нюансы и особенности данного медицинского понятия.';
    script = blocks[0] + '\n\n' + additional + '\n\n' + blocks.slice(1).join('\n\n');
  }
  
  return script.trim();
}

/**
 * Build Uzbek professor-style script (4-6 blocks).
 */
function buildUzbekScript(question: string, correctAnswer: string, explanation: string): string {
  const blocks: string[] = [];
  
  // Block 1: Premium intro
  blocks.push('Keling, bu savolni bosqichma-bosqich tahlil qilamiz.');
  
  // Block 2: What the question asks
  const questionClean = question.trim().replace(/[.!?]+$/, '');
  if (questionClean.length > 0 && questionClean.length < 200) {
    blocks.push(`Savol quyidagicha: ${questionClean}.`);
  }
  
  // Block 3: Core concept explanation
  const explanationPoints = extractKeyPoints(explanation, 'uz');
  const answerPoints = extractKeyPoints(correctAnswer, 'uz');
  
  if (explanationPoints.length > 0 || answerPoints.length > 0) {
    blocks.push('Bu savolning asosiy nuqtalariga e\'tibor bering.');
    
    // Combine and deduplicate points
    const allPoints = [...answerPoints, ...explanationPoints];
    const uniquePoints = removeDuplicateSentences(allPoints.join('. '))
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15)
      .slice(0, 6);
    
    if (uniquePoints.length > 0) {
      blocks.push(...uniquePoints.map((point, i) => {
        const p = point.endsWith('.') ? point : point + '.';
        if (i === 0) {
          return `Birinchidan, ${p.toLowerCase()}`;
        } else if (i === uniquePoints.length - 1) {
          return `Va nihoyat, ${p.toLowerCase()}`;
        }
        return p;
      }));
    }
  }
  
  // Block 4: Expand terms
  const combinedText = [correctAnswer, explanation].join(' ');
  const withTerms = expandTerms(combinedText, 'uz');
  if (withTerms !== combinedText) {
    // Extract new sentences from expanded text
    const newSentences = withTerms
      .split(/[.!?]\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 30 && !blocks.some(b => b.includes(s.slice(0, 50))))
      .slice(0, 2);
    
    if (newSentences.length > 0) {
      blocks.push(...newSentences.map(s => s.endsWith('.') ? s : s + '.'));
    }
  }
  
  // Block 5: Final emphasis
  if (correctAnswer && correctAnswer.trim().length > 0) {
    const shortAnswer = correctAnswer.trim().slice(0, 120);
    blocks.push(`Shuni esda tuting — bu asosiy tamoyil: ${shortAnswer}.`);
  } else {
    blocks.push('Shuni esda tuting — bu asosiy tamoyil, uni o\'zlashtirish kerak.');
  }
  
  // Join blocks with paragraph breaks
  let script = blocks.join('\n\n');
  
  // Ensure minimum length (500 chars)
  if (script.length < 500) {
    const additional = 'Bu muhim savol bo\'lib, batafsil o\'rganishni talab qiladi. Bu tibbiy tushunchaning barcha nuanslari va xususiyatlarini tushunish kerak.';
    script = blocks[0] + '\n\n' + additional + '\n\n' + blocks.slice(1).join('\n\n');
  }
  
  return script.trim();
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation } = input;
  
  // DETERMINISTIC: Detect language from QUESTION only
  const detectedLang = detectLang(question);
  
  // Remove duplicates from explanation before processing
  const cleanedExplanation = removeDuplicateSentences(cleanText(aiExplanation));
  const cleanedAnswer = removeDuplicateSentences(cleanText(correctAnswer));
  
  // Build professor-style script based on QUESTION + ANSWER + explanation
  let script: string;
  if (detectedLang === 'ru') {
    script = buildRussianScript(question, cleanedAnswer, cleanedExplanation);
  } else {
    script = buildUzbekScript(question, cleanedAnswer, cleanedExplanation);
  }
  
  // Final validation: ensure minimum length
  if (script.length < 500) {
    const fallback = detectedLang === 'ru'
      ? 'Это важный вопрос, который требует детального изучения. Необходимо понимать все нюансы и особенности данного медицинского понятия. Рассмотрим основные аспекты более подробно.'
      : 'Bu muhim savol bo\'lib, batafsil o\'rganishni talab qiladi. Bu tibbiy tushunchaning barcha nuanslari va xususiyatlarini tushunish kerak. Asosiy jihatlarni batafsil ko\'rib chiqamiz.';
    script = script + '\n\n' + fallback;
  }
  
  // Limit maximum length
  if (script.length > 2000) {
    script = script.slice(0, 2000);
    const lastPeriod = script.lastIndexOf('.');
    if (lastPeriod > 1800) {
      script = script.slice(0, lastPeriod + 1);
    }
  }
  
  return { script, actualLang: detectedLang };
}
