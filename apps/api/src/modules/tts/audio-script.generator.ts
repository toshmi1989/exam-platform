/**
 * Academic Lecture Voice Engine.
 * Central topic anchor, strict section order, completeness check, forced conclusion.
 */

interface GenerateScriptInput {
  question: string;
  correctAnswer: string;
  aiExplanation: string;
  lang: "ru" | "uz";
}

interface GenerateScriptOutput {
  script: string;
  actualLang: "ru" | "uz";
}

/** Section keys in order as they may appear in question. */
const SECTION_KEYS = ['classification', 'clinical', 'diagnosis', 'emergency'] as const;
type SectionKey = (typeof SECTION_KEYS)[number];

/** Keyword → section mapping (UZ and RU). */
const KEYWORD_TO_SECTION: Record<string, SectionKey> = {
  tasnif: 'classification',
  tasnifi: 'classification',
  klassifikatsiya: 'classification',
  классификация: 'classification',
  klinika: 'clinical',
  klinikasi: 'clinical',
  klinik: 'clinical',
  klinicheskaya: 'clinical',
  клиника: 'clinical',
  клиническая: 'clinical',
  tashxis: 'diagnosis',
  tashxisi: 'diagnosis',
  diagnostika: 'diagnosis',
  диагностика: 'diagnosis',
  shoshilinch: 'emergency',
  'shoshilinch yordam': 'emergency',
  emergency: 'emergency',
  neotlozhnaya: 'emergency',
  неотложная: 'emergency',
  skoraya: 'emergency',
};

function detectLang(question: string): "ru" | "uz" {
  return /[А-Яа-яЁё]/.test(question) ? "ru" : "uz";
}

function cleanQuestion(text: string): string {
  return text
    .replace(/^\s*\d+\.\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract CENTRAL_TOPIC: first major noun phrase (main medical entity).
 * E.g. "Stenokardiya tasnifi, klinikasi, tashxisi va shoshilinch yordam" → "Stenokardiya"
 */
function extractCentralTopic(question: string): string {
  const q = cleanQuestion(question).trim();
  if (!q) return q;
  const lang = detectLang(q);
  const lower = q.toLowerCase();
  const comma = q.indexOf(',');
  const firstPart = (comma >= 0 ? q.slice(0, comma) : q).trim();
  const words = firstPart.split(/\s+/);
  if (words.length <= 2) return firstPart;
  const lastWord = words[words.length - 1];
  const lastLower = lastWord.toLowerCase();
  if (KEYWORD_TO_SECTION[lastLower] || /^(va|и|yoki|или)$/.test(lastLower)) {
    return words.slice(0, -1).join(' ').trim();
  }
  return firstPart;
}

/**
 * Parse question for required sections in EXACT order of appearance.
 */
function parseQuestionKeywords(question: string): SectionKey[] {
  const q = cleanQuestion(question).toLowerCase();
  const seen = new Set<SectionKey>();
  const order: SectionKey[] = [];
  const tokens = q.split(/[\s,]+/).filter(Boolean);
  for (const token of tokens) {
    const normalized = token.replace(/[^\p{L}]/gu, '');
    const key = KEYWORD_TO_SECTION[normalized] ?? KEYWORD_TO_SECTION[token];
    if (key && !seen.has(key)) {
      seen.add(key);
      order.push(key);
    }
  }
  for (const two of ['shoshilinch yordam', 'neotlozhnaya pomoshch']) {
    if (q.includes(two)) {
      const k: SectionKey = 'emergency';
      if (!seen.has(k)) {
        seen.add(k);
        order.push(k);
      }
    }
  }
  return order;
}

function stripEmoji(text: string): string {
  return text.replace(/\p{Extended_Pictographic}/gu, "");
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function stripTemplateLabels(text: string): string {
  return text
    .replace(/\bQisqa javob\b\s*:?/gi, "")
    .replace(/\bBatafsil tushuntirish\b\s*:?/gi, "")
    .replace(/\bXulosa\b\s*:?/gi, "")
    .replace(/\bКраткий ответ\b\s*:?/gi, "")
    .replace(/\bПодробное объяснение\b\s*:?/gi, "")
    .replace(/\bЗаключение\b\s*:?/gi, "");
}

function normalizeSpaces(text: string): string {
  return text
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function removeDuplicateSentences(text: string): string {
  const seen = new Set<string>();
  const unique = splitSentences(text).filter((sentence) => {
    const key = sentence.toLowerCase().replace(/\s+/g, " ");
    if (key.length < 12) return false;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return unique.join(" ");
}

function cleanInputText(raw: string): string {
  return normalizeSpaces(stripTemplateLabels(stripMarkdown(stripEmoji(raw))));
}

function extractListItems(text: string): string[] {
  const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (const line of lines) {
    const numbered = line.match(/^\d+\.\s+(.+)$/);
    const dashed = line.match(/^[-–—]\s+(.+)$/);
    if (numbered) out.push(numbered[1].trim());
    else if (dashed) out.push(dashed[1].trim());
  }
  if (out.length >= 2) return out.slice(0, 6);
  const inline = text.match(/(?:Sabablari|Belgilar|Davolash|Profilaktika|Причины|Симптомы|Лечение|Профилактика)\s*:([^.]+)/gi);
  if (!inline) return [];
  const parsed: string[] = [];
  for (const chunk of inline) {
    const rhs = chunk.split(":")[1] ?? "";
    const parts = rhs.split(/[,;]+/).map((p) => p.trim()).filter((p) => p.length > 2);
    parsed.push(...parts);
  }
  return Array.from(new Set(parsed)).slice(0, 6);
}

function buildNarrativeFromList(items: string[], lang: "ru" | "uz"): string {
  if (!items.length) return "";
  const leads =
    lang === "uz"
      ? ["Avvalo", "Keyingi muhim omil", "Yana bir jihat", "Eng muhimi"]
      : ["Во-первых", "Следующий важный фактор", "Еще один аспект", "И самое главное"];
  return items
    .map((item, index) => {
      const lead = index === items.length - 1 ? leads[3] : leads[Math.min(index, 2)];
      return `${lead}: ${item.replace(/[.!?]+$/, "")}.`;
    })
    .join(" ");
}

/** Only explain CENTRAL_TOPIC once; do not redefine secondary terms. */
function buildTermExplanationForCentralTopic(centralTopic: string, lang: "ru" | "uz"): string {
  if (lang === "uz") {
    return `${centralTopic} deganda yurak-qon tomir tizimida yoki boshqa sohalarda klinik ahamiyatga ega bo'lgan asosiy tibbiy tushuncha nazarda tutiladi.`;
  }
  return `${centralTopic} — это основное медицинское понятие, имеющее непосредственное клиническое значение в диагностике и лечении.`;
}

/**
 * Build content for one section, anchored to CENTRAL_TOPIC.
 * Ensures section talks about central topic, not unrelated terms.
 */
function buildSectionContent(
  sectionKey: SectionKey,
  centralTopic: string,
  answer: string,
  explanation: string,
  lang: "ru" | "uz"
): string {
  const combined = removeDuplicateSentences(`${answer}. ${explanation}`);
  const sentences = splitSentences(combined);
  const listNarrative = buildNarrativeFromList(extractListItems(`${answer}\n${explanation}`), lang);
  const anchor = lang === "uz" ? `${centralTopic} bo'yicha` : `по теме ${centralTopic}`;

  switch (sectionKey) {
    case 'classification':
      return lang === "uz"
        ? `${centralTopic} ning tasnifi quyidagicha: ${sentences[0] || listNarrative || "tibbiy amaliyotda qabul qilingan tasnif asosida ajratiladi."}`
        : `Классификация ${centralTopic}: ${sentences[0] || listNarrative || "принятая в клинической практике классификация позволяет выделить основные формы."}`;
    case 'clinical':
      return lang === "uz"
        ? `${centralTopic} ning klinikasi va belgilari: ${listNarrative || sentences.slice(0, 3).join(" ") || "klinik ko'rinish bemor shikoyatlari va ob'ektiv tekshiruv asosida baholanadi."}`
        : `Клиника и признаки ${centralTopic}: ${listNarrative || sentences.slice(0, 3).join(" ") || "клиническая картина оценивается по жалобам и объективному обследованию."}`;
    case 'diagnosis':
      return lang === "uz"
        ? `${centralTopic} tashxisi: ${listNarrative || sentences.find(s => /tashxis|diagnostik|tekshiruv/i.test(s)) || sentences[0] || "laborator va instrumental usullar qo'llaniladi."}`
        : `Диагностика ${centralTopic}: ${listNarrative || sentences.find(s => /диагност|обследован|анализ/i.test(s)) || sentences[0] || "применяются лабораторные и инструментальные методы."}`;
    case 'emergency':
      return lang === "uz"
        ? `${centralTopic} da shoshilinch yordam: ${listNarrative || sentences.find(s => /shoshilinch|tez yordam|birinch/i.test(s)) || sentences[0] || "bemorni tinchlantirish, monitorlash va mutaxassis chaqirish zarur."}`
        : `Неотложная помощь при ${centralTopic}: ${listNarrative || sentences.find(s => /неотложн|скорая|первая помощь/i.test(s)) || sentences[0] || "необходимы успокоение пациента, мониторинг и вызов специалиста."}`;
    default:
      return combined.slice(0, 300);
  }
}

/**
 * Compose lecture in EXACT order of keywords; every block references CENTRAL_TOPIC.
 */
function composeLectureOnce(
  question: string,
  answer: string,
  explanation: string,
  lang: "ru" | "uz",
  centralTopic: string,
  sectionOrder: SectionKey[]
): string {
  const q = cleanQuestion(question);
  const cleanA = cleanInputText(answer);
  const cleanE = cleanInputText(explanation);

  const intro =
    lang === "uz"
      ? "Keling, bu mavzuni chuqurroq tahlil qilamiz."
      : "Давайте разберём эту тему более глубоко.";

  const framing =
    lang === "uz"
      ? `E'tibor bering, bugungi savolning markazida ${centralTopic} masalasi turibdi.`
      : `Обратите внимание: в центре этого вопроса находится тема ${centralTopic}.`;

  const blocks: string[] = [intro, framing];

  for (const key of sectionOrder) {
    const content = buildSectionContent(key, centralTopic, cleanA, cleanE, lang);
    blocks.push(content);
  }

  const explainedCentral = new Set<string>();
  const topicLower = centralTopic.toLowerCase();
  if (!explainedCentral.has(topicLower)) {
    explainedCentral.add(topicLower);
    const expl = buildTermExplanationForCentralTopic(centralTopic, lang);
    for (let i = 2; i < blocks.length; i++) {
      const re = new RegExp(`\\b${centralTopic.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(blocks[i])) {
        blocks[i] = blocks[i].replace(re, `${centralTopic}. ${expl}`);
        break;
      }
    }
  }

  let script = removeDuplicateSentences(blocks.join("\n\n"));

  const conclusionPhrase =
    lang === "uz"
      ? "Xulosa qilib aytganda, bu mavzuni to'g'ri tushunish va amaliyotda qo'llash kelajakdagi shifokor uchun muhimdir."
      : "Подводя итог, правильное понимание этой темы и её применение на практике важны для будущего врача.";
  script = ensureConclusion(script, lang, conclusionPhrase);

  if (script.length < 800) {
    const ext =
      lang === "uz"
        ? `${centralTopic} bo'yicha diagnostik va davolash qarorlarini klinik dalillar asosida qabul qilish kerak.`
        : `По ${centralTopic} диагностические и лечебные решения должны приниматься на основе клинических данных.`;
    script = `${script}\n\n${ext}`;
  }

  if (script.length > 3200) {
    script = script.slice(0, 3200);
    const cut = Math.max(script.lastIndexOf("."), script.lastIndexOf("!"), script.lastIndexOf("?"));
    if (cut > 2800) script = script.slice(0, cut + 1);
  }

  return normalizeSpaces(script);
}

function ensureConclusion(script: string, lang: "ru" | "uz", conclusionPhrase: string): string {
  const uzStart = "xulosa qilib aytganda";
  const ruStart = "подводя итог";
  const lower = script.toLowerCase().trim();
  if (lang === "uz" && lower.includes(uzStart)) return script;
  if (lang === "ru" && lower.includes(ruStart)) return script;
  return `${script}\n\n${conclusionPhrase}`;
}

/** Completeness: script must mention classification, clinical, diagnosis, emergency if required. */
function hasRequiredContent(script: string, requiredSections: SectionKey[]): boolean {
  const lower = script.toLowerCase();
  const has = {
    classification: /tasnif|klassifikatsiya|классификаци/i.test(lower),
    clinical: /klinik|belgi|simptom|клиник|признак|симптом/i.test(lower),
    diagnosis: /tashxis|diagnostik|диагност|обследован/i.test(lower),
    emergency: /shoshilinch|tez yordam|неотложн|скорая|первая помощь/i.test(lower),
  };
  return requiredSections.every((k) => has[k]);
}

/** Structural: intro + at least 4 thematic blocks + conclusion. */
function hasStructure(script: string, lang: "ru" | "uz"): boolean {
  const parts = script.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return false;
  const hasIntro =
    lang === "uz"
      ? /keling.*tahlil|e'tibor bering/i.test(parts[0] + parts[1])
      : /давайте разберём|обратите внимание/i.test(parts[0] + parts[1]);
  const hasConclusion =
    lang === "uz"
      ? /xulosa qilib aytganda|shuni esda tuting/i.test(script)
      : /подводя итог|запомните/i.test(script);
  return hasIntro && hasConclusion;
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const actualLang = detectLang(input.question);
  const centralTopic = extractCentralTopic(input.question);
  const sectionOrder = parseQuestionKeywords(input.question);

  const requiredSections = sectionOrder.length ? sectionOrder : (['classification', 'clinical', 'diagnosis'] as SectionKey[]);
  const order = sectionOrder.length ? sectionOrder : (['classification', 'clinical', 'diagnosis'] as SectionKey[]);

  let script = composeLectureOnce(
    input.question,
    input.correctAnswer,
    input.aiExplanation,
    actualLang,
    centralTopic || input.question.slice(0, 50),
    order
  );

  const conclusionPhrase =
    actualLang === "uz"
      ? "Xulosa qilib aytganda, bu mavzuni to'g'ri tushunish va amaliyotda qo'llash kelajakdagi shifokor uchun muhimdir."
      : "Подводя итог, правильное понимание этой темы и её применение на практике важны для будущего врача.";
  script = ensureConclusion(script, actualLang, conclusionPhrase);

  const complete = hasRequiredContent(script, requiredSections);
  const structured = hasStructure(script, actualLang);

  if (!complete || !structured) {
    script = composeLectureOnce(
      input.question,
      input.correctAnswer,
      input.aiExplanation,
      actualLang,
      centralTopic || input.question.slice(0, 50),
      requiredSections
    );
    script = ensureConclusion(script, actualLang, conclusionPhrase);
  }

  return { script: normalizeSpaces(script), actualLang };
}
