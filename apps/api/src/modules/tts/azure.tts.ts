/**
 * Azure Text-to-Speech module.
 * Premium teacher mode with female voice only.
 * Natural paragraph-based pauses.
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

/**
 * Emphasize important keywords with SSML emphasis tags.
 */
function emphasizeKeywords(text: string, lang: 'ru' | 'uz'): string {
  const keywords = lang === 'ru'
    ? ['важно', 'основное', 'главное', 'ключевой', 'обратите внимание', 'запомните', 'это', 'необходимо']
    : ['muhim', 'asosiy', 'eng muhim', 'e\'tibor bering', 'esda tuting', 'bu', 'kerak'];
  
  let result = text;
  
  // Wrap keywords with emphasis (work backwards to preserve positions)
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    result = result.replace(regex, (match) => {
      return `<emphasis level="moderate">${match}</emphasis>`;
    });
  }
  
  return result;
}

/**
 * Add paragraph-based breaks (700ms between paragraphs).
 * Add short breaks after commas (300ms).
 */
function addParagraphBreaks(text: string): string {
  // Split by paragraph breaks (double newlines)
  const paragraphs = text.split('\n\n').filter(p => p.trim().length > 0);
  
  const processedParagraphs = paragraphs.map(paragraph => {
    // Within paragraph: add short breaks after commas
    let withCommaBreaks = paragraph.replace(/,\s*/g, ', <break time="300ms"/> ');
    
    // Ensure paragraph ends with punctuation
    if (!/[.!?]$/.test(withCommaBreaks.trim())) {
      withCommaBreaks = withCommaBreaks.trim() + '.';
    }
    
    return withCommaBreaks.trim();
  });
  
  // Join paragraphs with longer breaks
  return processedParagraphs
    .map(p => `${p} <break time="700ms"/>`)
    .join('\n');
}

/**
 * Build premium SSML with teacher style and natural pauses.
 */
function buildSSML(text: string, lang: 'ru' | 'uz'): string {
  const clean = sanitizeForSSML(text);
  const emphasized = emphasizeKeywords(clean, lang);
  const withParagraphBreaks = addParagraphBreaks(emphasized);
  
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
    <mstts:express-as style="teacher" styledegree="1.6">
      <prosody rate="+3%" pitch="+2%">
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
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
      'User-Agent': 'ZiyoMed-TTS/1.0',
    },
    body: ssml,
  });
  
  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error');
    console.error('[Azure TTS] SSML length:', ssml.length);
    console.error('[Azure TTS] SSML (first 500 chars):', ssml.slice(0, 500));
    console.error('[Azure TTS] Error response:', response.status, errorText.slice(0, 500));
    
    // Try to parse error if it's XML
    let errorMsg = errorText.slice(0, 500);
    try {
      const errorMatch = errorText.match(/<Message>(.*?)<\/Message>/i);
      if (errorMatch) {
        errorMsg = errorMatch[1];
      }
    } catch {
      // ignore
    }
    
    // If SSML invalid, try regenerating without emphasis
    if (errorText.includes('SSML') || errorText.includes('xml') || response.status === 400) {
      console.warn('[Azure TTS] SSML validation error, attempting fallback without emphasis');
      // Fallback: regenerate without emphasis tags
      const fallbackSSML = ssml.replace(/<emphasis[^>]*>|<\/emphasis>/g, '');
      const fallbackResponse = await fetch(url, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
          'User-Agent': 'ZiyoMed-TTS/1.0',
        },
        body: fallbackSSML,
      });
      
      if (fallbackResponse.ok) {
        const audioBuffer = await fallbackResponse.arrayBuffer();
        const audioDir = path.dirname(outputPath);
        fs.mkdirSync(audioDir, { recursive: true });
        fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
        return outputPath;
      }
    }
    
    throw new Error(`Azure TTS failed: ${response.status} - ${errorMsg}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  const audioDir = path.dirname(outputPath);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  return outputPath;
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
  
  // Build SSML (rate is fixed at +3%, not configurable)
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
