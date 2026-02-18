/**
 * Premium academic-level TTS script generator.
 * Generates lecture-style medical explanations.
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

/**
 * Clean question: remove leading numbers and extra spaces.
 */
function cleanQuestion(text: string): string {
  return text
    .replace(/^\d+\.\s*/, '') // Remove leading number like "5." or "12."
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Clean answer: remove template headers, emojis, markdown.
 */
function cleanAnswer(text: string, lang: 'ru' | 'uz'): string {
  let cleaned = text;
  
  // Remove emojis
  cleaned = cleaned.replace(/[📌📋✅🔴🟢💡🤖]/g, '');
  
  // Remove template headers
  if (lang === 'uz') {
    cleaned = cleaned
      .replace(/Qisqa javob\s*:?/gi, '')
      .replace(/Batafsil tushuntirish\s*:?/gi, '')
      .replace(/Xulosa\s*:?/gi, '')
      .replace(/Sabablari\s*:?/gi, '')
      .replace(/Belgilar\s*:?/gi, '')
      .replace(/Davolash\s*:?/gi, '')
      .replace(/Profilaktika\s*:?/gi, '')
      .replace(/Tashxis\s*:?/gi, '');
  } else {
    cleaned = cleaned
      .replace(/Краткий ответ\s*:?/gi, '')
      .replace(/Подробное объяснение\s*:?/gi, '')
      .replace(/Заключение\s*:?/gi, '')
      .replace(/Причины\s*:?/gi, '')
      .replace(/Симптомы\s*:?/gi, '')
      .replace(/Лечение\s*:?/gi, '')
      .replace(/Профилактика\s*:?/gi, '')
      .replace(/Диагностика\s*:?/gi, '');
  }
  
  // Remove markdown
  cleaned = cleaned
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return cleaned;
}

/**
 * Remove duplicate sentences.
 */
function removeDuplicateSentences(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s || s.length < 10) return false;
      const key = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

/**
 * Detect medical terms.
 */
function detectTerms(text: string): string[] {
  const endings = /\b[\p{L}]+(?:itis|osis|oma|logiya|grafiya|skopiya)\b/giu;
  const words = text.match(/\b\p{L}[\p{L}\-']{2,}\b/gu) || [];
  const out: string[] = [];

  for (const w of words) {
    const norm = w.replace(/[-']/g, '');
    if (norm.length > 9) out.push(w);
    if ((/^[A-ZА-ЯЁ]/.test(w) && norm.length > 6)) out.push(w);
  }
  out.push(...(text.match(endings) || []));

  const stop = new Set(['вопрос', 'ответ', 'важно', 'главное', 'основное', 'muhim', 'asosiy', 'savol', 'javob', 'bu', 'это']);
  const uniq = new Set<string>();
  for (const t of out) {
    const key = t.toLowerCase();
    if (stop.has(key)) continue;
    uniq.add(t);
  }
  return Array.from(uniq).slice(0, 8);
}

/**
 * Extract structured sections from answer (UZ).
 */
function extractSections(text: string): {
  definition?: string;
  pathogenesis?: string;
  clinical?: string;
  diagnosis?: string;
  treatment?: string;
  prevention?: string;
} {
  const sections: Record<string, string> = {};
  
  // Try to find section headers
  const patterns = [
    { key: 'definition', regex: /(?:Ta\'rif|Mazmuni|Nima)\s*:?\s*(.+?)(?=\n|Sabab|Belgi|Davolash|$)/is },
    { key: 'pathogenesis', regex: /(?:Sabab|Mexanizm|Patogenez)\s*:?\s*(.+?)(?=\n|Belgi|Davolash|$)/is },
    { key: 'clinical', regex: /(?:Belgi|Simptom|Klinik)\s*:?\s*(.+?)(?=\n|Davolash|Tashxis|$)/is },
    { key: 'diagnosis', regex: /(?:Tashxis|Diagnostika)\s*:?\s*(.+?)(?=\n|Davolash|Profilaktika|$)/is },
    { key: 'treatment', regex: /(?:Davolash|Terapiya)\s*:?\s*(.+?)(?=\n|Profilaktika|$)/is },
    { key: 'prevention', regex: /(?:Profilaktika|Oldini olish)\s*:?\s*(.+?)$/is },
  ];
  
  for (const { key, regex } of patterns) {
    const match = text.match(regex);
    if (match && match[1]) {
      sections[key] = match[1].trim();
    }
  }
  
  return sections as any;
}

/**
 * Build Uzbek lecture-style script (8 blocks).
 */
function buildUzbekLectureScript(question: string, answer: string, explanation: string): string {
  const blocks: string[] = [];
  const explainedTerms = new Set<string>();
  
  const cleanQ = cleanQuestion(question);
  const cleanA = cleanAnswer(answer, 'uz');
  const cleanE = cleanAnswer(explanation, 'uz');
  
  // Remove duplicates
  const dedupA = removeDuplicateSentences(cleanA);
  const dedupE = removeDuplicateSentences(cleanE);
  
  // Extract sections
  const sections = extractSections(dedupA);
  
  // Block 1: Introduction
  blocks.push('Keling, bugungi mavzuni tahlil qilamiz.');
  
  // Block 2: Definition
  if (sections.definition) {
    blocks.push(`Avval, bu tushunchaning ta'rifini ko'rib chiqamiz. ${sections.definition}`);
  } else if (cleanQ) {
    blocks.push(`Savol quyidagicha: ${cleanQ}. Bu tibbiy holatni tushunish uchun avval uning asosiy belgilarini ko'rib chiqamiz.`);
  }
  
  // Block 3: Pathogenesis/Mechanism
  if (sections.pathogenesis) {
    blocks.push(`Endi sabablarga to'xtalamiz. ${sections.pathogenesis}`);
  } else {
    const patho = dedupE.split(/[.!?]\s+/).find(s => 
      s.toLowerCase().includes('sabab') || 
      s.toLowerCase().includes('mexanizm') ||
      s.toLowerCase().includes('kelib chiqadi')
    );
    if (patho) blocks.push(`Sabablar va mexanizm quyidagicha: ${patho}`);
  }
  
  // Block 4: Clinical features
  if (sections.clinical) {
    blocks.push(`Klinik belgilar va simptomlar: ${sections.clinical}`);
  } else {
    const clinical = dedupE.split(/[.!?]\s+/).find(s => 
      s.toLowerCase().includes('belgi') || 
      s.toLowerCase().includes('simptom')
    );
    if (clinical) blocks.push(`Klinik ko'rinish: ${clinical}`);
  }
  
  // Block 5: Diagnosis
  if (sections.diagnosis) {
    blocks.push(`Tashxis qo'yish: ${sections.diagnosis}`);
  } else {
    const diag = dedupE.split(/[.!?]\s+/).find(s => 
      s.toLowerCase().includes('tashxis') || 
      s.toLowerCase().includes('diagnostika')
    );
    if (diag) blocks.push(`Tashxis usullari: ${diag}`);
  }
  
  // Block 6: Treatment
  if (sections.treatment) {
    blocks.push(`Davolash tamoyillari: ${sections.treatment}`);
  } else {
    const treat = dedupE.split(/[.!?]\s+/).find(s => 
      s.toLowerCase().includes('davolash') || 
      s.toLowerCase().includes('terapiya')
    );
    if (treat) blocks.push(`Davolash: ${treat}`);
  }
  
  // Block 7: Prevention
  if (sections.prevention) {
    blocks.push(`Profilaktika: ${sections.prevention}`);
  }
  
  // Block 8: Strong academic conclusion
  if (cleanQ) {
    blocks.push(`Xulosa qilib aytganda, ${cleanQ} — bu muhim tibbiy tushuncha bo'lib, uni to'g'ri tushunish va davolash kelajakdagi shifokorlar uchun zarur.`);
  } else {
    blocks.push('Bu mavzuni chuqur o\'rganish va amaliyotda qo\'llash kelajakdagi tibbiyot mutaxassislari uchun muhimdir.');
  }
  
  let script = blocks.join('\n\n');
  
  // Insert term explanations (only once per term)
  const allText = [script, dedupA, dedupE].join(' ');
  const terms = detectTerms(allText);
  
  for (const term of terms.slice(0, 4)) {
    if (explainedTerms.has(term.toLowerCase())) continue;
    explainedTerms.add(term.toLowerCase());
    
    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    const match = script.match(regex);
    if (!match || match.index == null) continue;
    
    const idx = match.index + match[0].length;
    const before = script.slice(0, idx);
    const after = script.slice(idx);
    
    // Brief explanation
    const expl = ` ${term}. Bu atama muhim tibbiy tushunchani bildiradi.`;
    script = before + expl + after;
  }
  
  // Remove consecutive repeated phrases
  const sentences = script.split(/[.!?]\s+/).filter(s => s.trim().length > 5);
  const uniqueSentences: string[] = [];
  const seen = new Set<string>();
  
  for (const s of sentences) {
    const key = s.toLowerCase().replace(/\s+/g, ' ').slice(0, 50);
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSentences.push(s.trim());
    }
  }
  
  script = uniqueSentences
    .map(s => s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.')
    .join(' ');
  
  // Ensure minimum 700 chars
  if (script.length < 700) {
    const additional = 'Bu mavzuni o\'rganishda diqqat qaratish kerak bo\'lgan asosiy nuqtalar: birinchi, patofiziologik mexanizmlarni tushunish; ikkinchi, klinik ko\'rinishlarni to\'g\'ri baholash; uchinchi, zamonaviy diagnostika usullarini qo\'llash; va to\'rtinchi, samarali davolash strategiyasini tanlash.';
    script = script + '\n\n' + additional;
  }
  
  // Limit to 1200 chars max
  if (script.length > 1200) {
    script = script.slice(0, 1200);
    const cut = Math.max(
      script.lastIndexOf('.'),
      script.lastIndexOf('!'),
      script.lastIndexOf('?')
    );
    if (cut > 1000) script = script.slice(0, cut + 1);
  }
  
  return script.trim();
}

/**
 * Build Russian lecture-style script (8 blocks).
+ */
function buildRussianLectureScript(question: string, answer: string, explanation: string): string {
+  const blocks: string[] = [];
+  const explainedTerms = new Set<string>();
+  
+  const cleanQ = cleanQuestion(question);
+  const cleanA = cleanAnswer(answer, 'ru');
+  const cleanE = cleanAnswer(explanation, 'ru');
+  
+  const dedupA = removeDuplicateSentences(cleanA);
+  const dedupE = removeDuplicateSentences(cleanE);
+  
+  // Extract sections (Russian patterns)
+  const sections: Record<string, string> = {};
+  const patterns = [
+    { key: 'definition', regex: /(?:Определение|Суть|Что такое)\s*:?\s*(.+?)(?=\n|Причина|Симптом|$)/is },
+    { key: 'pathogenesis', regex: /(?:Причина|Механизм|Патогенез)\s*:?\s*(.+?)(?=\n|Симптом|Диагностика|$)/is },
+    { key: 'clinical', regex: /(?:Симптом|Клиническая картина)\s*:?\s*(.+?)(?=\n|Диагностика|Лечение|$)/is },
+    { key: 'diagnosis', regex: /(?:Диагностика|Диагноз)\s*:?\s*(.+?)(?=\n|Лечение|Профилактика|$)/is },
+    { key: 'treatment', regex: /(?:Лечение|Терапия)\s*:?\s*(.+?)(?=\n|Профилактика|$)/is },
+    { key: 'prevention', regex: /(?:Профилактика)\s*:?\s*(.+?)$/is },
+  ];
+  
+  for (const { key, regex } of patterns) {
+    const match = dedupA.match(regex);
+    if (match && match[1]) sections[key] = match[1].trim();
+  }
+  
+  // Block 1: Introduction
+  blocks.push('Давайте разберём этот вопрос детально.');
+  
+  // Block 2: Definition
+  if (sections.definition) {
+    blocks.push(`Сначала определим суть понятия. ${sections.definition}`);
+  } else if (cleanQ) {
+    blocks.push(`Вопрос звучит так: ${cleanQ}. Для понимания этого медицинского состояния рассмотрим его основные характеристики.`);
+  }
+  
+  // Block 3: Pathogenesis
+  if (sections.pathogenesis) {
+    blocks.push(`Теперь о причинах и механизме. ${sections.pathogenesis}`);
+  }
+  
+  // Block 4: Clinical features
+  if (sections.clinical) {
+    blocks.push(`Клинические проявления: ${sections.clinical}`);
+  }
+  
+  // Block 5: Diagnosis
+  if (sections.diagnosis) {
+    blocks.push(`Диагностика: ${sections.diagnosis}`);
+  }
+  
+  // Block 6: Treatment
+  if (sections.treatment) {
+    blocks.push(`Принципы лечения: ${sections.treatment}`);
+  }
+  
+  // Block 7: Prevention
+  if (sections.prevention) {
+    blocks.push(`Профилактика: ${sections.prevention}`);
+  }
+  
+  // Block 8: Conclusion
+  if (cleanQ) {
+    blocks.push(`В заключение отметим, что ${cleanQ} — это важное медицинское понятие, правильное понимание и лечение которого необходимо будущим врачам.`);
+  } else {
+    blocks.push('Глубокое изучение этой темы и её применение на практике важно для будущих медицинских специалистов.');
+  }
+  
+  let script = blocks.join('\n\n');
  
+  // Insert term explanations (only once)
+  const allText = [script, dedupA, dedupE].join(' ');
+  const terms = detectTerms(allText);
+  
+  for (const term of terms.slice(0, 4)) {
+    if (explainedTerms.has(term.toLowerCase())) continue;
+    explainedTerms.add(term.toLowerCase());
+    
+    const regex = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
+    const match = script.match(regex);
+    if (!match || match.index == null) continue;
+    
+    const idx = match.index + match[0].length;
+    const before = script.slice(0, idx);
+    const after = script.slice(idx);
+    
+    const expl = ` ${term}. Это термин, обозначающий важное медицинское понятие.`;
+    script = before + expl + after;
+  }
+  
+  // Remove duplicates
+  const sentences = script.split(/[.!?]\s+/).filter(s => s.trim().length > 5);
+  const uniqueSentences: string[] = [];
+  const seen = new Set<string>();
+  
+  for (const s of sentences) {
+    const key = s.toLowerCase().replace(/\s+/g, ' ').slice(0, 50);
+    if (!seen.has(key)) {
+      seen.add(key);
+      uniqueSentences.push(s.trim());
+    }
+  }
+  
+  script = uniqueSentences
+    .map(s => s.endsWith('.') || s.endsWith('!') || s.endsWith('?') ? s : s + '.')
+    .join(' ');
+  
+  // Ensure minimum 700 chars
+  if (script.length < 700) {
+    const additional = 'При изучении этой темы важно обратить внимание на основные моменты: во-первых, понимание патофизиологических механизмов; во-вторых, правильная оценка клинических проявлений; в-третьих, применение современных методов диагностики; и в-четвёртых, выбор эффективной стратегии лечения.';
+    script = script + '\n\n' + additional;
+  }
+  
+  // Limit to 1200 chars
+  if (script.length > 1200) {
+    script = script.slice(0, 1200);
+    const cut = Math.max(
+      script.lastIndexOf('.'),
+      script.lastIndexOf('!'),
+      script.lastIndexOf('?')
+    );
+    if (cut > 1000) script = script.slice(0, cut + 1);
+  }
+  
+  return script.trim();
+}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const { question, correctAnswer, aiExplanation } = input;
  const lang = detectLang(question);
  
  let script: string;
  if (lang === 'uz') {
    script = buildUzbekLectureScript(question, correctAnswer, aiExplanation);
  } else {
    script = buildRussianLectureScript(question, correctAnswer, aiExplanation);
  }
  
  return { script, actualLang: lang };
}
