/**
 * Academic Lecture Voice Engine.
 * Converts QUESTION + ANSWER into speech-adapted lecture text.
 */

interface GenerateScriptInput {
  question: string;
  correctAnswer: string;
  aiExplanation: string;
  lang: "ru" | "uz"; // ignored, language is question-derived
}

interface GenerateScriptOutput {
  script: string;
  actualLang: "ru" | "uz";
}

type LectureSections = {
  concept: string;
  mechanism: string;
  clinical: string;
  practical: string;
  conclusion: string;
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

function detectMedicalTerms(text: string): string[] {
  const known = [
    "infektsiya",
    "tomografiya",
    "рентгенография",
    "инфекция",
    "патогенез",
    "diagnostika",
    "диагностика",
  ];
  const words = text.match(/\b\p{L}[\p{L}\-']{2,}\b/gu) || [];
  const terms = new Set<string>();
  for (const word of words) {
    const lower = word.toLowerCase();
    const plain = lower.replace(/[-']/g, "");
    if (
      plain.length > 9 ||
      /(?:itis|osis|oma)$/i.test(lower) ||
      known.some((k) => lower.includes(k))
    ) {
      terms.add(word);
    }
  }
  return Array.from(terms).slice(0, 6);
}

function buildTermExplanation(term: string, lang: "ru" | "uz"): string {
  if (lang === "uz") {
    return `${term} deganda klinik amaliyotda aniq tashxis va davolash qaroriga ta'sir qiluvchi tibbiy tushuncha nazarda tutiladi.`;
  }
  return `${term} означает медицинское понятие, которое напрямую влияет на диагностику и выбор лечебной тактики.`;
}

function buildLectureSections(
  question: string,
  answer: string,
  explanation: string,
  lang: "ru" | "uz"
): LectureSections {
  const combined = removeDuplicateSentences(`${answer}. ${explanation}`);
  const sentences = splitSentences(combined);
  const listNarrative = buildNarrativeFromList(extractListItems(`${answer}\n${explanation}`), lang);
  const concept = sentences[0] || (lang === "uz" ? "Bu holatning asosiy mazmuni klinik fikrlashda to'g'ri talqin qilishdan iborat." : "Суть этого состояния заключается в корректной клинической интерпретации.");
  const mechanism = sentences[1] || (lang === "uz" ? "Mexanizm odatda etiologik omillar va organizm javob reaksiyasi o'rtasidagi bog'liqlik bilan tushuntiriladi." : "Механизм обычно объясняется связью между этиологическими факторами и реакцией организма.");
  const clinical = listNarrative || sentences.slice(2, 5).join(" ");
  const practical =
    lang === "uz"
      ? `Amaliyotda bu shuni anglatadiki, shifokor bemor shikoyatlari, ko'rik natijalari va laborator ma'lumotlarni birlashtirib qaror qabul qiladi. Masalan, ${question.toLowerCase()} holatida differensial tashxisni erta bosqichda aniqlash davolash samaradorligini oshiradi.`
      : `На практике это означает, что врач объединяет жалобы пациента, данные осмотра и лабораторные результаты в единую клиническую картину. Например, при ситуации "${question}" ранняя дифференциальная оценка повышает эффективность терапии.`;
  const conclusion =
    lang === "uz"
      ? "Muhim jihat shundaki, klinik qaror har doim patogenez, simptomlar va amaliy dalillar birligida qabul qilinadi."
      : "Важно понимать, что клиническое решение всегда строится на единстве патогенеза, симптомов и практических данных.";

  return { concept, mechanism, clinical, practical, conclusion };
}

function composeLecture(
  question: string,
  answer: string,
  explanation: string,
  lang: "ru" | "uz"
): string {
  const q = cleanQuestion(question);
  const cleanA = cleanInputText(answer);
  const cleanE = cleanInputText(explanation);
  const sections = buildLectureSections(q, cleanA, cleanE, lang);

  const intro =
    lang === "uz"
      ? "Keling, bu mavzuni chuqurroq tahlil qilamiz."
      : "Давайте разберём эту тему более глубоко.";

  const framing =
    lang === "uz"
      ? `E'tibor bering, bugungi savolning markazida "${q}" masalasi turibdi.`
      : `Обратите внимание: в центре этого вопроса находится тема "${q}".`;

  const clarification =
    lang === "uz"
      ? `Muhim jihat shundaki, ${sections.concept}`
      : `Ключевой момент в том, что ${sections.concept}`;

  const mechanism =
    lang === "uz"
      ? `Endi mexanizmga to'xtalamiz: ${sections.mechanism}`
      : `Теперь разберем механизм: ${sections.mechanism}`;

  const reasoning =
    lang === "uz"
      ? `Klinik fikrlashda ketma-ket yondashuv zarur. ${sections.clinical}`
      : `В клиническом мышлении важна последовательность. ${sections.clinical}`;

  const practical = sections.practical;

  const conclusion =
    lang === "uz"
      ? `Yakuniy xulosa: ${sections.conclusion} Shuni esda tuting, bu yondashuv kelajakdagi shifokor amaliyotida hal qiluvchi ahamiyatga ega.`
      : `Итоговый вывод: ${sections.conclusion} Запомните, этот подход имеет решающее значение в практике будущего врача.`;

  const blocks = [intro, framing, clarification, mechanism, reasoning, practical, conclusion];

  const explainedTerms = new Set<string>();
  const terms = detectMedicalTerms(`${q} ${cleanA} ${cleanE}`);
  for (const term of terms) {
    const key = term.toLowerCase();
    if (explainedTerms.has(key)) continue;
    explainedTerms.add(key);
    const explanationLine = buildTermExplanation(term, lang);
    for (let i = 2; i < blocks.length; i++) {
      const re = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
      if (re.test(blocks[i])) {
        blocks[i] = blocks[i].replace(re, `${term}. ${explanationLine}`);
        break;
      }
    }
    if (explainedTerms.size >= 2) break;
  }

  let script = removeDuplicateSentences(blocks.join("\n\n"));

  if (script.length < 800) {
    const extension =
      lang === "uz"
        ? "Qo'shimcha ravishda, diagnostik bosqichda klinik tafakkur izchil bo'lishi, davolashda esa etiologik va simptomatik yondashuvlar uyg'unlashishi kerak. Bu yondashuv bemor xavfsizligi va natija barqarorligini ta'minlaydi."
        : "Дополнительно важно, чтобы на этапе диагностики клиническое мышление оставалось последовательным, а в лечении сочетались этиотропный и симптоматический подходы. Такой принцип повышает безопасность пациента и стабильность результата.";
    script = `${script}\n\n${extension}`;
  }

  if (script.length > 1200) {
    script = script.slice(0, 1200);
    const cut = Math.max(script.lastIndexOf("."), script.lastIndexOf("!"), script.lastIndexOf("?"));
    if (cut > 1000) script = script.slice(0, cut + 1);
  }

  return normalizeSpaces(script);
}

export function generateAudioScript(input: GenerateScriptInput): GenerateScriptOutput {
  const actualLang = detectLang(input.question);
  const script = composeLecture(input.question, input.correctAnswer, input.aiExplanation, actualLang);
  return { script, actualLang };
}
