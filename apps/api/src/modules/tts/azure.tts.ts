/**
 * Azure Text-to-Speech module.
 * Premium teacher mode with female voice only.
 * Natural paragraph-based pauses + academic intonation.
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

/**
 * Emphasize important keywords with SSML emphasis tags.
 */
function emphasizeKeywords(text: string, lang: 'ru' | 'uz'): string {
  const keywords = lang === 'ru'
    ? ['важно', 'основное', 'главное', 'ключевой', 'обратите внимание', 'запомните', 'необходимо']
    : ['muhim', 'asosiy', 'eng muhim', 'e\'tibor bering', 'esda tuting', 'kerak', 'zarur'];
  
  let result = text;
  
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${escapeRegExp(keyword)}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      return `<emphasis level="moderate">${match}</emphasis>`;
    });
  }
  
  return result;
}

/**
 * Known phoneme corrections (IPA).
 */
const PHONEMES_RU: Record<string, string> = {
  'томография': 'təməˈɡrafʲɪjə',
  'рентгеноскопия': 'rentɡenɔˈskopʲɪjə',
};

function applyPhonemes(text: string, lang: 'ru' | 'uz'): string {
  if (lang !== 'ru') return text;
  let out = text;
  for (const [term, ipa] of Object.entries(PHONEMES_RU)) {
    const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    out = out.replace(re, (match) => `<mstts:phoneme alphabet="ipa" ph="${ipa}">${match}</mstts:phoneme>`);
  }
  return out;
}

/**
 * Detect complex medical terms.
 */
function detectTerms(text: string): string[] {
  const endings = /\b[\p{L}]+(?:itis|osis|oma|logiya|grafiya|skopiya)\b/giu;
  const words = text.match(/\b\p{L}[\p{L}\-']{2,}\b/gu) || [];
  const out: string[] = [];
  for (const w of words) {
    const norm = w.replace(/[-']/g, '');
    if (norm.length > 9) out.push(w);
    if (/^[A-ZА-ЯЁ]/.test(w) && norm.length > 6) out.push(w);
  }
  out.push(...(text.match(endings) || []));
  return Array.from(new Set(out.map((t) => t.trim()))).slice(0, 8);
}

/**
 * Slow down complex Latin/medical terms without slowing the whole speech.
 */
function slowDownTerms(text: string): string {
  const terms = detectTerms(text);
  if (!terms.length) return text;
  return applyOutsideTags(text, (chunk) => {
    let out = chunk;
    for (const term of terms) {
      const re = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'g');
      out = out.replace(re, (m) => `<prosody rate="-15%" pitch="+1%">${m}</prosody>`);
    }
    return out;
  });
}

/**
 * Intelligent enumeration SSML intonation.
 * Convert list sections to natural lecture flow.
 */
function intonateEnumerations(text: string, lang: 'ru' | 'uz'): string {
  const lines = text.split('\n');
  const out: string[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    
    // Check for list patterns
    const numberedMatch = line.trim().match(/^(\d+)\.\s+(.*)$/);
    const dashMatch = line.trim().match(/^[-–—]\s+(.*)$/);
    
    if (!numberedMatch && !dashMatch) {
      out.push(line);
      i++;
      continue;
    }

    // Collect consecutive list items
    const items: string[] = [];
    let j = i;
    while (j < lines.length) {
      const l = lines[j].trim();
      const mm = l.match(/^(\d+)\.\s+(.*)$/);
      const md = l.match(/^[-–—]\s+(.*)$/);
      if (mm) items.push(mm[2].trim());
      else if (md) items.push(md[1].trim());
      else break;
      j++;
    }

    if (items.length >= 2) {
      // Add transition phrase
      if (lang === 'uz') {
        out.push('Endi sabablarga to\'xtalamiz.');
      } else {
        out.push('Теперь рассмотрим основные пункты.');
      }
      
      // Render items with intonation
      const rendered = items.map((it, idx) => {
        const pitch = idx === 0 ? '+3%' : idx === items.length - 1 ? '+6%' : '+4%';
        if (idx === items.length - 1) {
          const lead = lang === 'ru' ? 'и самое важное — ' : 'eng muhimi shuki — ';
          return `<prosody pitch="${pitch}">${lead}${it}</prosody>`;
        }
        return `<prosody pitch="${pitch}">${it}</prosody>, <break time="300ms"/>`;
      });
      out.push(rendered.join(' '));
    } else {
      out.push(line);
    }

    i = j;
  }

  return out.join('\n');
}

/**
 * Add paragraph-based breaks:
 * - 650ms between semantic blocks
 * - 250ms after commas
 * - 400ms after term explanation sentence
 */
function addParagraphBreaks(text: string, lang: 'ru' | 'uz'): string {
  const paragraphs = text.split('\n\n').filter((p) => p.trim().length > 0);
  const processed = paragraphs.map((p) => {
    let chunk = p.trim();
    // After commas: 250ms
    chunk = applyOutsideTags(chunk, (c) => c.replace(/,\s*/g, ', <break time="250ms"/> '));
    // After term explanations: 400ms
    if (lang === 'uz') {
      chunk = chunk.replace(/(\.)(\s*)(Bu atama)/g, `.$2 <break time="400ms"/> $3`);
    } else {
      chunk = chunk.replace(/(\.)(\s*)(Это термин)/g, `.$2 <break time="400ms"/> $3`);
    }
    if (!/[.!?]$/.test(chunk)) chunk += '.';
    return chunk;
  });
  return processed.map((p) => `${p} <break time="650ms"/>`).join('\n');
}

/**
 * Build premium SSML with teacher style and natural pauses.
 */
function buildSSML(text: string, lang: 'ru' | 'uz'): string {
  const clean = sanitizeForSSML(text);
  const withPhonemes = applyPhonemes(clean, lang);
  const withSlowedTerms = slowDownTerms(withPhonemes);
  const withListIntonation = intonateEnumerations(withSlowedTerms, lang);
  const emphasized = emphasizeKeywords(withListIntonation, lang);
  const withParagraphBreaks = addParagraphBreaks(emphasized, lang);
  
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
    <mstts:express-as style="teacher" styledegree="1.8">
      <prosody rate="+4%" pitch="+2%">
        ${withParagraphBreaks}
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
  
  // Build SSML (rate is fixed at +4%, not configurable)
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
