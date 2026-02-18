import { rewriteSpeechLecture } from './ai.speech.generator';

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

function detectLang(question: string): 'ru' | 'uz' {
  return /[А-Яа-яЁё]/.test(question) ? 'ru' : 'uz';
}

function sanitizeSpeechText(text: string): string {
  return text
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function clampLength(text: string): string {
  if (text.length <= 3200) return text;
  const clipped = text.slice(0, 3200);
  const cut = Math.max(clipped.lastIndexOf('.'), clipped.lastIndexOf('!'), clipped.lastIndexOf('?'));
  return cut > 2600 ? clipped.slice(0, cut + 1) : clipped;
}

export async function generateAudioScript(input: GenerateScriptInput): Promise<GenerateScriptOutput> {
  const actualLang = detectLang(input.question);

  try {
    const result = await rewriteSpeechLecture({
      question: input.question,
      aiExplanation: input.aiExplanation,
      correctAnswer: input.correctAnswer,
      lang: actualLang,
    });

    const script = clampLength(sanitizeSpeechText(result.content));
    if (!script || script.length < 20) {
      throw new Error('LLM rewrite result too short');
    }

    return { script, actualLang: result.lang };
  } catch (error) {
    // FAILSAFE: fallback to existing AI explanation text
    const fallback = clampLength(sanitizeSpeechText(input.aiExplanation));
    return { script: fallback || sanitizeSpeechText(input.correctAnswer), actualLang };
  }
}
