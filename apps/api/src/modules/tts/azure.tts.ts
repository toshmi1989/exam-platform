/**
 * Azure Text-to-Speech module.
 * Academic Lecture Voice Engine renderer for Azure TTS.
 */

import * as fs from 'fs';
import * as path from 'path';

const AZURE_SPEECH_KEY = (process.env.AZURE_SPEECH_KEY ?? '').trim();
const AZURE_SPEECH_REGION = (process.env.AZURE_SPEECH_REGION ?? 'eastus').trim();
const AZURE_OUTPUT_FORMAT = (process.env.AZURE_OUTPUT_FORMAT ?? 'riff-24khz-16bit-mono-pcm').trim();
const AUDIO_BASE_DIR = '/opt/exam/audio';

// Ensure audio directory exists
try {
  fs.mkdirSync(AUDIO_BASE_DIR, { recursive: true });
} catch {
  // ignore
}

export interface TtsOptions {
  rate?: number;
  pauseMs?: number;
}

/**
 * Sanitize text for SSML: normalize Unicode and escape XML.
 */
function sanitizeForSSML(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\uD800-\uDFFF]/g, '') // remove broken surrogates
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyOutsideTags(input: string, fn: (text: string) => string): string {
  const parts = input.split(/(<[^>]+>)/g);
  return parts.map((p) => (p.startsWith('<') && p.endsWith('>') ? p : fn(p))).join('');
}

function removeDuplicateSentences(text: string): string {
  const seen = new Set<string>();
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => {
      if (!s) return false;
      const key = s.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join(' ');
}

function emphasizeKeywords(text: string, lang: 'ru' | 'uz'): string {
  const keywords =
    lang === 'ru'
      ? ['обратите внимание', 'важно', 'ключевой', 'практически', 'итоговый вывод']
      : ["e'tibor bering", 'muhim', 'asosiy', 'amaliyotda', 'yakuniy xulosa'];

  return applyOutsideTags(text, (chunk) => {
    let out = chunk;
    for (const keyword of keywords) {
      const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
      out = out.replace(regex, (match) => `<emphasis level="moderate">${match}</emphasis>`);
    }
    return out;
  });
}

/**
 * Known phoneme corrections (IPA).
 */
const PHONEMES_RU: Record<string, string> = {
  'томография': 'təməˈɡrafʲɪjə',
  'рентгеноскопия': 'rentɡenɔˈskopʲɪjə',
  'диагностика': 'dʲɪaɡˈnostʲɪkə',
};

function detectTerms(text: string): string[] {
  const endings = /\b[\p{L}]+(?:itis|osis|oma|logiya|grafiya|skopiya)\b/giu;
  const words = text.match(/\b\p{L}[\p{L}\-']{2,}\b/gu) || [];
  const known = ['infektsiya', 'tomografiya', 'диагностика', 'инфекция', 'патогенез'];
  const out: string[] = [];
  for (const w of words) {
    const norm = w.replace(/[-']/g, '');
    if (norm.length > 9 || known.some((k) => w.toLowerCase().includes(k))) out.push(w);
    if (/^[A-ZА-ЯЁ]/.test(w) && norm.length > 6) out.push(w);
  }
  out.push(...(text.match(endings) || []));
  return Array.from(new Set(out.map((t) => t.trim()))).slice(0, 8);
}

function slowDownFirstTermMentions(text: string, lang: 'ru' | 'uz'): string {
  const terms = detectTerms(text);
  if (!terms.length) return text;
  const seen = new Set<string>();

  return applyOutsideTags(text, (chunk) => {
    let out = chunk;
    for (const term of terms) {
      const key = term.toLowerCase();
      if (seen.has(key)) continue;
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'i');
      out = out.replace(re, (matched) => {
        seen.add(key);
        if (lang === 'ru') {
          const phoneme = PHONEMES_RU[key];
          if (phoneme) {
            return `<prosody rate="-12%"><mstts:phoneme alphabet="ipa" ph="${phoneme}">${matched}</mstts:phoneme></prosody>`;
          }
        }
        return `<prosody rate="-12%">${matched}</prosody>`;
      });
    }
    return out;
  });
}

function addCommaPauses(text: string): string {
  return applyOutsideTags(text, (chunk) => chunk.replace(/,\s*/g, ', <break time="250ms"/> '));
}

function addSemanticPacing(text: string, lang: 'ru' | 'uz'): string {
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  if (!blocks.length) return text;

  const paced: string[] = [];
  blocks.forEach((block, index) => {
    let current = addCommaPauses(block);

    if (index === 1) {
      current = `<break time="300ms"/> ${current}`;
    }

    // Slightly more expressive final conclusion.
    if (index === blocks.length - 1) {
      current = `<prosody rate="-4%" pitch="+4%">${current}</prosody>`;
    }

    paced.push(current);

    if (index === 0) paced.push('<break time="600ms"/>');
    if (index === 2) paced.push('<break time="500ms"/>');
    if (index < blocks.length - 1) paced.push('<break time="700ms"/>');
  });

  const importantCue = lang === 'ru' ? 'Важно понимать' : 'Muhim jihat shundaki';
  return paced.join('\n').replace(
    new RegExp(`\\b${escapeRegExp(importantCue)}\\b`, 'g'),
    `<break time="300ms"/> ${importantCue}`
  );
}

/**
 * Build premium SSML with teacher style and natural pauses.
 */
function buildSSML(text: string, lang: 'ru' | 'uz'): string {
  const clean = sanitizeForSSML(removeDuplicateSentences(text));
  const withTermProsody = slowDownFirstTermMentions(clean, lang);
  const emphasized = emphasizeKeywords(withTermProsody, lang);
  const withPacing = addSemanticPacing(emphasized, lang);
  
  // FEMALE VOICES ONLY
  const voice = lang === 'ru' 
    ? 'ru-RU-SvetlanaNeural'
    : 'uz-UZ-MadinaNeural';
  
  const xmlLang = lang === 'ru' 
    ? 'ru-RU'
    : 'uz-UZ';
  
  return `<speak version="1.0"
 xmlns="http://www.w3.org/2001/10/synthesis"
 xmlns:mstts="http://www.w3.org/2001/mstts"
 xml:lang="${xmlLang}">
  <voice name="${voice}">
    <mstts:express-as style="teacher" styledegree="1.9">
      <prosody rate="+3%" pitch="+2%">
        ${withPacing}
      </prosody>
    </mstts:express-as>
  </voice>
</speak>`;
}

/**
 * Generate audio file from script using Azure TTS REST API.
 * Returns path to generated WAV file.
 */
async function synthesizeSpeechWithSSML(ssml: string, outputPath: string): Promise<string> {
  const url = `https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  
  async function post(body: string) {
    return fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
        'User-Agent': 'ZiyoMed-TTS/1.0',
      },
      body,
    });
  }

  const attempts: Array<{ label: string; body: string }> = [
    { label: 'original', body: ssml },
    { label: 'no-phoneme', body: ssml.replace(/<mstts:phoneme[^>]*>|<\/mstts:phoneme>/g, '') },
    { label: 'no-emphasis', body: ssml.replace(/<mstts:phoneme[^>]*>|<\/mstts:phoneme>/g, '').replace(/<emphasis[^>]*>|<\/emphasis>/g, '') },
  ];

  let lastStatus = 0;
  let lastErrorText = '';
  for (const attempt of attempts) {
    const response = await post(attempt.body);
    if (response.ok) {
      const audioBuffer = await response.arrayBuffer();
      const audioDir = path.dirname(outputPath);
      fs.mkdirSync(audioDir, { recursive: true });
      fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
      return outputPath;
    }

    lastStatus = response.status;
    lastErrorText = await response.text().catch(() => 'Unknown error');
    console.error('[Azure TTS] Attempt failed:', attempt.label);
    console.error('[Azure TTS] SSML length:', attempt.body.length);
    console.error('[Azure TTS] SSML (first 500 chars):', attempt.body.slice(0, 500));
    console.error('[Azure TTS] Error response:', lastStatus, lastErrorText.slice(0, 500));
  }

  let errorMsg = lastErrorText.slice(0, 500);
  try {
    const errorMatch = lastErrorText.match(/<Message>(.*?)<\/Message>/i);
    if (errorMatch) errorMsg = errorMatch[1];
  } catch {
    // ignore
  }

  throw new Error(`Azure TTS failed: ${lastStatus} - ${errorMsg}`);
}

/**
 * Generate audio file from script.
 * Returns path to generated WAV file.
 */
export async function synthesizeSpeech(
  script: string,
  lang: 'ru' | 'uz',
  outputPath: string,
  options: TtsOptions = {}
): Promise<string> {
  // Validate script
  const trimmedScript = script.trim();
  if (!trimmedScript || trimmedScript.length < 10) {
    throw new Error(`Script is too short or empty: "${trimmedScript}"`);
  }
  
  // Build SSML using academic lecture template.
  const ssml = buildSSML(trimmedScript, lang);
  
  // Log SSML for debugging (first 500 chars)
  console.log('[Azure TTS] Generated SSML (first 500 chars):', ssml.slice(0, 500));
  
  // Synthesize (with error handling)
  try {
    return await synthesizeSpeechWithSSML(ssml, outputPath);
  } catch (error) {
    console.error('[Azure TTS] Synthesis failed:', error);
    // Log error but don't break exam flow
    throw error;
  }
}

/**
 * Get audio file path for question and language.
 */
export function getAudioPath(questionId: string, lang: 'ru' | 'uz'): string {
  return path.join(AUDIO_BASE_DIR, `${questionId}_${lang}.wav`);
}
