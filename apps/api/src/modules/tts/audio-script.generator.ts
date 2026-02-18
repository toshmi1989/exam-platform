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
  actualLang: 'ru' | 'uz'; // Actual language used for generation
}

// Uzbek-specific Cyrillic letters pattern (shared)
const uzbekCyrillic = /[ЎўҚқҒғҲҳ]/;

// Common Uzbek Latin words pattern (expanded list, shared)
const uzbekLatinWords = /\b(tushuntiradi|Savol|javob|Tibbiy|mazmuni|orasidagi|farq|shovqinlar|qattiq|baland|nafas|chiqarish|eshitiladi|yumshoq|past|kuchliroq|traxeya|bronxlarda|bo'lib|paytida|anik|teng|kichik|havo|yo'llaridan|keladi|tonli|olish|rentgen|tasvirlarini|qo'llaniladigan|fizik|asoslar|haqida|nurlari|orqali|tana|ichidagi|strukturalarni|ko'rsatish|uchun|ularning|turli|to'siqlarga|duch|kelishi|va|so'rilishi|prinsipiga|asoslanadi|elektromagnit|to'lqinlarning|yuqori|chastotali|turi|bo'lib|to'qimalaridan|o'tishi|asosida|tasvir|hosil|qilinadi|suv|yog'|kabi|yumshoq|to'qimalar|kamroq|so'radi|suyak|zich|to'qimalar|esa|ko'proq|so'rib|tasvirda|oq|rangda|ko'rinadi|bu|jarayon|kontrastini|yaratadi|ichki|organlar|suyaklar|holatini|baholash|imkonini|beradi)\b/i;

/**
 * Filter text by language - keep only sentences in target language.
 * STRICT: Azure TTS does not support mixed languages in one SSML without <lang> tags.
 */
function filterByLanguage(text: string, targetLang: 'ru' | 'uz'): string {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean);
  const filtered: string[] = [];

  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) continue;

    if (targetLang === 'ru') {
      // STRICT: For Russian, reject ANY Uzbek content
      const hasCyrillic = /[А-Яа-яЁё]/.test(trimmed);
      const hasUzbekCyrillic = uzbekCyrillic.test(trimmed);
      const hasUzbekLatin = uzbekLatinWords.test(trimmed);
      
      // Only keep if: has Russian Cyrillic AND no Uzbek content
      if (hasCyrillic && !hasUzbekCyrillic && !hasUzbekLatin) {
        // Additional check: count Russian vs non-Russian characters
        const russianChars = (trimmed.match(/[А-Яа-яЁё]/g) || []).length;
        const totalChars = trimmed.replace(/\s+/g, '').length;
        const russianRatio = totalChars > 0 ? russianChars / totalChars : 0;
        
        // Keep if at least 60% of content is Russian
        if (russianRatio >= 0.6) {
          filtered.push(trimmed);
        }
      }
    } else {
      // For Uzbek: keep if has Uzbek-specific characters or Uzbek words
      const hasUzbekCyrillic = uzbekCyrillic.test(trimmed);
      const hasUzbekLatin = uzbekLatinWords.test(trimmed);
      const hasAnyCyrillic = /[А-Яа-яЁё]/.test(trimmed);
      
      // Keep if has Uzbek markers OR (has Cyrillic AND Uzbek-specific letters)
      if (hasUzbekLatin || (hasAnyCyrillic && hasUzbekCyrillic)) {
        filtered.push(trimmed);
      } else if (hasAnyCyrillic && !hasUzbekCyrillic) {
        // Has Cyrillic but no Uzbek-specific letters - might be Russian, skip
        continue;
      }
    }
  }

  return filtered.join('. ') + (filtered.length > 0 ? '.' : '');
}

/**
 * Detect the actual language of text.
 * Returns 'ru', 'uz', or 'mixed'.
 */
function detectLanguage(text: string): 'ru' | 'uz' | 'mixed' {
  const sentences = text.split(/[.!?]\s+/).filter(Boolean);
  let russianCount = 0;
  let uzbekCount = 0;
  
  for (const sentence of sentences) {
    const trimmed = sentence.trim();
    if (trimmed.length < 10) continue;
    
    const hasCyrillic = /[А-Яа-яЁё]/.test(trimmed);
    const hasUzbekCyrillic = uzbekCyrillic.test(trimmed);
    const hasUzbekLatin = uzbekLatinWords.test(trimmed);
    
    if (hasCyrillic && !hasUzbekCyrillic && !hasUzbekLatin) {
      russianCount++;
    } else if (hasUzbekCyrillic || hasUzbekLatin) {
      uzbekCount++;
    }
  }
  
  if (russianCount > 0 && uzbekCount === 0) return 'ru';
  if (uzbekCount > 0 && russianCount === 0) return 'uz';
  return 'mixed';
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation, lang } = input;

  // Clean AI explanation: remove markdown, emojis, lists
  let clean = aiExplanation
    .replace(/^#+\s+/gm, '') // headers (including ##, ###, etc.)
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
    .trim();

  // Remove language-specific headers and footers (more aggressive)
  clean = clean
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
    .replace(/##\s*/g, '') // remove markdown headers
    .replace(/#\s*/g, '') // remove single # headers
    .trim();

  // Detect actual language of the explanation
  const detectedLang = detectLanguage(clean);
  
  // If requested language doesn't match detected language, adjust
  let actualLang = lang;
  if (detectedLang !== 'mixed' && detectedLang !== lang) {
    console.warn('[Audio Script] Language mismatch detected:', {
      requested: lang,
      detected: detectedLang,
      preview: clean.slice(0, 200),
    });
    
    // If explanation is completely in another language (not mixed), use that language
    if (detectedLang === 'uz' && lang === 'ru') {
      actualLang = 'uz';
      console.warn('[Audio Script] Switching to Uzbek language for generation');
    } else if (detectedLang === 'ru' && lang === 'uz') {
      actualLang = 'ru';
      console.warn('[Audio Script] Switching to Russian language for generation');
    }
  }
  
  // Filter by target language - STRICT: Azure TTS doesn't support mixed languages
  const filtered = filterByLanguage(clean, actualLang);
  
  // STRICT: If filtered is empty or too short, check if original has mixed languages
  let finalExplanation = filtered;
  
  if (filtered.length < 50) {
    // Check if original has mixed languages
    const hasMixedLang = actualLang === 'ru' 
      ? (uzbekCyrillic.test(clean) || uzbekLatinWords.test(clean))
      : (!uzbekCyrillic.test(clean) && !uzbekLatinWords.test(clean) && /[А-Яа-яЁё]/.test(clean));
    
    if (hasMixedLang || filtered.length === 0) {
      // Original has mixed languages OR filtered is empty
      console.error('[Audio Script] ERROR: Cannot generate script - mixed languages detected:', {
        originalLength: clean.length,
        filteredLength: filtered.length,
        requestedLang: lang,
        actualLang,
        detectedLang,
        originalPreview: clean.slice(0, 200),
        filteredPreview: filtered.slice(0, 100),
      });
      
      // Try one more aggressive filter pass
      const sentences = clean.split(/[.!?]\s+/).filter(Boolean);
      const strictFiltered = sentences
        .filter((s) => {
          const trimmed = s.trim();
          if (trimmed.length < 10) return false;
          
          if (actualLang === 'ru') {
            const hasCyrillic = /[А-Яа-яЁё]/.test(trimmed);
            const hasUzbek = uzbekCyrillic.test(trimmed) || uzbekLatinWords.test(trimmed);
            return hasCyrillic && !hasUzbek;
          } else {
            const hasUzbek = uzbekCyrillic.test(trimmed) || uzbekLatinWords.test(trimmed);
            const hasOnlyRussian = /[А-Яа-яЁё]/.test(trimmed) && !uzbekCyrillic.test(trimmed);
            return hasUzbek || (hasOnlyRussian && !/[А-Яа-яЁё]/.test(trimmed.replace(/[ЎўҚқҒғҲҳ]/g, '')));
          }
        })
        .join('. ') + '.';
      
      if (strictFiltered.length > 50) {
        finalExplanation = strictFiltered;
        console.warn('[Audio Script] Using strict filtered result:', strictFiltered.slice(0, 100));
      } else {
        // Still too short - throw error with helpful message
        throw new Error(`Cannot generate audio script: explanation is in ${detectedLang === 'mixed' ? 'mixed languages' : detectedLang === 'uz' ? 'Uzbek' : 'Russian'} but ${lang} was requested. Filtering resulted in empty/short text (${strictFiltered.length} chars)`);
      }
    } else {
      // No mixed languages, safe to use original
      finalExplanation = clean;
    }
  }
  
  // Final validation: ensure no mixed languages in final explanation
  if (actualLang === 'ru') {
    const hasUzbek = uzbekCyrillic.test(finalExplanation) || uzbekLatinWords.test(finalExplanation);
    if (hasUzbek) {
      console.error('[Audio Script] ERROR: Final explanation still contains Uzbek text for Russian SSML!');
      // Remove Uzbek sentences one more time
      const sentences = finalExplanation.split(/[.!?]\s+/).filter(Boolean);
      finalExplanation = sentences
        .filter((s) => {
          const trimmed = s.trim();
          return !uzbekCyrillic.test(trimmed) && !uzbekLatinWords.test(trimmed);
        })
        .join('. ') + '.';
      
      // If still has Uzbek after filtering, throw error
      if (uzbekCyrillic.test(finalExplanation) || uzbekLatinWords.test(finalExplanation)) {
        throw new Error('Cannot generate Russian audio script: explanation contains Uzbek text that cannot be filtered out');
      }
    }
  }

  // Build teacher-style explanation using actual language
  let script: string;
  if (actualLang === 'ru') {
    script = buildRussianScript(question, correctAnswer, finalExplanation);
  } else {
    script = buildUzbekScript(question, correctAnswer, finalExplanation);
  }
  
  return { script, actualLang };
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
  // First try: split by punctuation
  let sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 10) // filter very short fragments
    .slice(0, 10);

  // If no sentences found, try splitting by commas or just take chunks
  if (sentences.length === 0) {
    const trimmed = explanation.trim();
    if (trimmed.length > 20) {
      // Try splitting by commas
      const commaSplit = trimmed.split(/,\s+/).filter((s) => s.trim().length > 15);
      if (commaSplit.length > 0) {
        sentences = commaSplit.slice(0, 5).map((s) => s.trim() + '.');
      } else {
        // Last resort: split by length
        const chunks = [];
        let remaining = trimmed;
        while (remaining.length > 50 && chunks.length < 5) {
          const chunk = remaining.slice(0, 150).trim();
          const lastPeriod = chunk.lastIndexOf('.');
          if (lastPeriod > 50) {
            chunks.push(chunk.slice(0, lastPeriod + 1));
            remaining = remaining.slice(lastPeriod + 1).trim();
          } else {
            chunks.push(chunk + '.');
            remaining = remaining.slice(150).trim();
          }
        }
        if (chunks.length > 0) {
          sentences = chunks;
        } else {
          // Absolute fallback: use first 200 chars
          sentences = [trimmed.slice(0, 200).trim() + '.'];
        }
      }
    } else {
      // If explanation is too short, use it as-is
      sentences = [explanation.trim() + '.'];
    }
  }

  if (sentences.length > 0) {
    // Add natural flow between sentences
    for (let i = 0; i < sentences.length; i++) {
      let sentence = sentences[i].trim();
      if (!sentence || sentence.length < 5) continue;
      
      // Ensure sentence ends with punctuation
      if (!sentence.match(/[.!?]$/)) {
        sentence += '.';
      }
      
      if (i === 0) {
        parts.push(sentence);
      } else if (i === Math.floor(sentences.length / 2) && sentences.length > 3) {
        // Middle transition
        parts.push('Теперь важно понимать, что', sentence);
      } else {
        parts.push(sentence);
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

  // Join parts with proper spacing
  let script = parts
    .filter((p) => p && p.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?])/g, '$1') // Remove space before punctuation
    .replace(/([.!?])([А-Яа-яA-Za-z])/g, '$1 $2') // Add space after punctuation
    .trim();

  // Validate minimum length
  if (script.length < 30) {
    console.error('[Audio Script] Generated script is too short:', {
      script,
      partsCount: parts.length,
      parts,
    });
    // Fallback: add generic explanation
    script = 'Это важный вопрос, который требует внимательного изучения. ' + script;
  }

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

  let sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((s) => s.length > 10)
    .slice(0, 10);

  // If no sentences found, try alternative splitting
  if (sentences.length === 0) {
    const trimmed = explanation.trim();
    if (trimmed.length > 20) {
      const commaSplit = trimmed.split(/,\s+/).filter((s) => s.trim().length > 15);
      if (commaSplit.length > 0) {
        sentences = commaSplit.slice(0, 5).map((s) => s.trim() + '.');
      } else {
        const chunks = [];
        let remaining = trimmed;
        while (remaining.length > 50 && chunks.length < 5) {
          const chunk = remaining.slice(0, 150).trim();
          const lastPeriod = chunk.lastIndexOf('.');
          if (lastPeriod > 50) {
            chunks.push(chunk.slice(0, lastPeriod + 1));
            remaining = remaining.slice(lastPeriod + 1).trim();
          } else {
            chunks.push(chunk + '.');
            remaining = remaining.slice(150).trim();
          }
        }
        if (chunks.length > 0) {
          sentences = chunks;
        } else {
          sentences = [trimmed.slice(0, 200).trim() + '.'];
        }
      }
    } else {
      sentences = [explanation.trim() + '.'];
    }
  }

  if (sentences.length > 0) {
    for (let i = 0; i < sentences.length; i++) {
      let sentence = sentences[i].trim();
      if (!sentence || sentence.length < 5) continue;
      
      if (!sentence.match(/[.!?]$/)) {
        sentence += '.';
      }
      
      if (i === 0) {
        parts.push(sentence);
      } else if (i === Math.floor(sentences.length / 2) && sentences.length > 3) {
        parts.push('Endi muhim narsa shuki,', sentence);
      } else {
        parts.push(sentence);
      }
    }
  }

  const closings = [
    `Demak, asosiy nuqta shuki — bu ${correctAnswer}.`,
    `Shunday qilib, eslab qolish kerak bo\'lgan asosiy narsa — ${correctAnswer}.`,
    `Xulosa qilib aytganda, ${correctAnswer} — bu savoldagi eng muhim narsa.`,
  ];
  parts.push(closings[Math.floor(Math.random() * closings.length)]);

  // Join parts with proper spacing
  let script = parts
    .filter((p) => p && p.trim().length > 0)
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([.!?])/g, '$1')
    .replace(/([.!?])([А-Яа-яA-Za-zЎўҚқҒғҲҳ])/g, '$1 $2')
    .trim();

  // Validate minimum length
  if (script.length < 30) {
    console.error('[Audio Script] Generated Uzbek script is too short:', {
      script,
      partsCount: parts.length,
      parts,
    });
    script = 'Bu muhim savol bo\'lib, diqqat bilan o\'rganishni talab qiladi. ' + script;
  }

  if (script.length > 1500) {
    script = script.slice(0, 1500);
    const lastPeriod = script.lastIndexOf('.');
    if (lastPeriod > 1200) {
      script = script.slice(0, lastPeriod + 1);
    }
  }

  return script;
}
