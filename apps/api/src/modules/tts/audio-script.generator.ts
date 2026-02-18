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

  // Build teacher-style explanation
  if (lang === 'ru') {
    return buildRussianScript(question, correctAnswer, clean);
  } else {
    return buildUzbekScript(question, correctAnswer, clean);
  }
}

function buildRussianScript(question: string, correctAnswer: string, explanation: string): string {
  const parts: string[] = [];

  // Opening
  parts.push('Правильный ответ на этот вопрос:');
  parts.push(correctAnswer);
  parts.push('.');

  // Main explanation - convert to conversational flow
  const sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8); // limit to avoid too long

  if (sentences.length > 0) {
    parts.push('Давайте разберём это подробнее.');
    parts.push(...sentences);
  }

  // Closing emphasis
  parts.push('Важно помнить, что');
  parts.push(correctAnswer);
  parts.push('является верным ответом на данный вопрос.');

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

  parts.push('Bu savolga to\'g\'ri javob:');
  parts.push(correctAnswer);
  parts.push('.');

  const sentences = explanation
    .split(/[.!?]\s+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (sentences.length > 0) {
    parts.push('Keling, buni batafsil ko\'rib chiqamiz.');
    parts.push(...sentences);
  }

  parts.push('Muhim eslab qolish kerakki,');
  parts.push(correctAnswer);
  parts.push('bu savolga to\'g\'ri javobdir.');

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
