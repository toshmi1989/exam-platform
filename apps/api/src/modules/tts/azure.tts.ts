/**
 * Azure Text-to-Speech module.
 * Generates audio from script using Azure Cognitive Services Speech SDK.
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
 * Add natural breaks between sentences.
 */
function addBreaks(text: string): string {
  const sentences = text
    .split(/(?<=[.!?])/)
    .map(s => s.trim())
    .filter(Boolean);
  
  return sentences
    .map(s => `${s} <break time="400ms"/>`)
    .join('\n');
}

/**
 * Build realistic SSML with teacher-style voice.
 */
function buildSSML(text: string, lang: 'ru' | 'uz', rate: number = -5): string {
  const clean = sanitizeForSSML(text);
  const withBreaks = addBreaks(clean);
  
  const voice = lang === 'ru' 
    ? 'ru-RU-DmitryNeural'
    : 'uz-UZ-SardorNeural';
  
  const xmlLang = lang === 'ru' 
    ? 'ru-RU'
    : 'uz-UZ';
  
  return `<speak version="1.0"
 xmlns="http://www.w3.org/2001/10/synthesis"
 xmlns:mstts="http://www.w3.org/2001/mstts"
 xml:lang="${xmlLang}">
  <voice name="${voice}">
    <mstts:express-as style="assistant" styledegree="1.2">
      <prosody rate="${rate}%" pitch="+2%">
        ${withBreaks}
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
    
    throw new Error(`Azure TTS failed: ${response.status} - ${errorMsg}`);
  }
  
  const audioBuffer = await response.arrayBuffer();
  const audioDir = path.dirname(outputPath);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));
  
  return outputPath;
}

export interface TtsOptions {
  rate?: number;
  pauseMs?: number;
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
  
  // Build SSML
  const rate = options.rate ?? -5;
  const ssml = buildSSML(trimmedScript, lang, rate);
  
  // Log SSML for debugging (first 500 chars)
  console.log('[Azure TTS] Generated SSML (first 500 chars):', ssml.slice(0, 500));
  
  // Synthesize
  return synthesizeSpeechWithSSML(ssml, outputPath);
}

/**
 * Get audio file path for question and language.
 */
export function getAudioPath(questionId: string, lang: 'ru' | 'uz'): string {
  return path.join(AUDIO_BASE_DIR, `${questionId}_${lang}.wav`);
}
