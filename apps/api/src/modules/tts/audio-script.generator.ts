/**
 * Generates premium professor-style audio script from question and answer.
 * Based on QUESTION (primary) + ANSWER (key points) + explanation (support).
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
 * Deterministic language detection based on QUESTION.
 * Cyrillic → RU, Latin → UZ.
 */
function detectLang(question: string): 'ru' | 'uz' {
  const cyrillic = /[А-Яа-яЁё]/;
  if (cyrillic.test(question)) return 'ru';
  return 'uz';
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
 * Extract key points from answer text.
 */
function extractKeyPoints(text: string, lang: 'ru' | 'uz'): string[] {
  const cleaned = cleanText(text);
  if (!cleaned) return [];
  
  // Split into sentences and filter meaningful ones
  const sentences = cleaned
    .split(/[.!?]\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 15 && s.length < 200)
    .slice(0, 5); // Take up to 5 key sentences
  
  return sentences;
}

/**
 * Build Russian professor-style script.
 */
function buildRussianScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];
  
  // Premium intro
  parts.push('Давайте внимательно разберём этот вопрос.');
  
  // Clarify what is being asked
  const questionClean = question.trim().replace(/[.!?]+$/, '');
  if (questionClean.length > 0 && questionClean.length < 150) {
    parts.push(`Вопрос звучит так: ${questionClean}.`);
  }
  
  // Extract key points from answer
  const answerPoints = extractKeyPoints(correctAnswer, 'ru');
  const explanationPoints = extractKeyPoints(explanation, 'ru');
  
  // Combine answer and explanation points
  const allPoints = [...answerPoints, ...explanationPoints].slice(0, 6);
  
  // Explain the concept
  if (allPoints.length > 0) {
    // Add transition
    parts.push('Обратите внимание на следующие важные моменты.');
    
    // Add key points
    for (let i = 0; i < allPoints.length; i++) {
      const point = allPoints[i];
      if (i === 0) {
        parts.push(`Во-первых, ${point.toLowerCase()}`);
      } else if (i === allPoints.length - 1) {
        parts.push(`И наконец, ${point.toLowerCase()}`);
      } else {
        parts.push(point);
      }
    }
  } else {
    // Fallback: use explanation directly
    const cleaned = cleanText(explanation);
    if (cleaned.length > 0) {
      const sentences = cleaned
        .split(/[.!?]\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 5);
      
      if (sentences.length > 0) {
        parts.push(...sentences.map(s => {
          if (!/[.!?]$/.test(s)) return s + '.';
          return s;
        }));
      }
    }
  }
  
  // Strong emphasis ending
  if (correctAnswer && correctAnswer.trim().length > 0) {
    const shortAnswer = correctAnswer.trim().slice(0, 100);
    parts.push(`Запомните — это ключевой принцип: ${shortAnswer}.`);
  } else {
    parts.push('Запомните — это ключевой принцип.');
  }
  
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

/**
 * Build Uzbek professor-style script.
 */
function buildUzbekScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];
  
  // Premium intro
  parts.push('Keling, bu savolni diqqat bilan ko\'rib chiqamiz.');
  
  // Clarify what is being asked
  const questionClean = question.trim().replace(/[.!?]+$/, '');
  if (questionClean.length > 0 && questionClean.length < 150) {
    parts.push(`Savol quyidagicha: ${questionClean}.`);
  }
  
  // Extract key points from answer
  const answerPoints = extractKeyPoints(correctAnswer, 'uz');
  const explanationPoints = extractKeyPoints(explanation, 'uz');
  
  // Combine answer and explanation points
  const allPoints = [...answerPoints, ...explanationPoints].slice(0, 6);
  
  // Explain the concept
  if (allPoints.length > 0) {
    // Add transition
    parts.push('Quyidagi muhim nuqtalarga e\'tibor bering.');
    
    // Add key points
    for (let i = 0; i < allPoints.length; i++) {
      const point = allPoints[i];
      if (i === 0) {
        parts.push(`Birinchidan, ${point.toLowerCase()}`);
      } else if (i === allPoints.length - 1) {
        parts.push(`Va nihoyat, ${point.toLowerCase()}`);
      } else {
        parts.push(point);
      }
    }
  } else {
    // Fallback: use explanation directly
    const cleaned = cleanText(explanation);
    if (cleaned.length > 0) {
      const sentences = cleaned
        .split(/[.!?]\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 10)
        .slice(0, 5);
      
      if (sentences.length > 0) {
        parts.push(...sentences.map(s => {
          if (!/[.!?]$/.test(s)) return s + '.';
          return s;
        }));
      }
    }
  }
  
  // Strong emphasis ending
  if (correctAnswer && correctAnswer.trim().length > 0) {
    const shortAnswer = correctAnswer.trim().slice(0, 100);
    parts.push(`Shuni esda tuting — bu asosiy tamoyil: ${shortAnswer}.`);
  } else {
    parts.push('Shuni esda tuting — bu asosiy tamoyil.');
  }
  
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation } = input;
  
  // DETERMINISTIC: Detect language from QUESTION only
  const detectedLang = detectLang(question);
  
  // Build professor-style script based on QUESTION + ANSWER + explanation
  let script: string;
  if (detectedLang === 'ru') {
    script = buildRussianScript(question, correctAnswer, aiExplanation);
  } else {
    script = buildUzbekScript(question, correctAnswer, aiExplanation);
  }
  
  // Ensure minimum length
  if (script.length < 50) {
    script = (detectedLang === 'ru' 
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
  
  return { script, actualLang: detectedLang };
}
