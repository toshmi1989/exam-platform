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

interface TtsOptions {
  rate?: number; // -20 to +20 percent
  pauseMs?: number; // pause duration in ms
}

const DEFAULT_RATE = -5; // Slightly slower for teacher clarity
const DEFAULT_PAUSE_MS = 500;

/**
 * Enhance script with SSML tags for natural teacher-style speech.
 * Adds pauses, emphasis, and emotional intonation.
 */
function enhanceScriptWithSSML(script: string, lang: 'ru' | 'uz'): string {
  // Clean script first - remove any problematic characters
  let clean = script
    .replace(/[\uD800-\uDFFF]/g, '') // Remove invalid surrogates
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
    .normalize('NFC');

  // Split into sentences
  const sentences = clean.split(/([.!?]\s+)/).filter((s) => s.trim().length > 0);
  const enhanced: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sentence = sentences[i].trim();
    if (!sentence || sentence.length < 3) continue;

    // Add emphasis on key words (simple approach)
    if (lang === 'ru') {
      sentence = sentence.replace(
        /\b(важно|ключевой|главное|основное|главный|основной|нужно|необходимо|следует|помнить)\b/gi,
        (match) => `<emphasis level="strong">${match}</emphasis>`
      );
      sentence = sentence.replace(/(\d+[%°]?)/g, (match) => `<emphasis level="moderate">${match}</emphasis>`);
    } else {
      sentence = sentence.replace(
        /\b(muhim|asosiy|bosh|eng|kerak|zarur|eslab)\b/gi,
        (match) => `<emphasis level="strong">${match}</emphasis>`
      );
      sentence = sentence.replace(/(\d+[%°]?)/g, (match) => `<emphasis level="moderate">${match}</emphasis>`);
    }

    // Add pauses after commas (but not inside emphasis tags)
    sentence = sentence.replace(/,\s+(?![^<]*<\/emphasis>)/g, ',<break time="400ms"/> ');

    enhanced.push(sentence);

    // Add longer pause after sentences
    if (sentence.match(/[.!?]$/) && i < sentences.length - 2) {
      enhanced.push('<break time="700ms"/>');
    }
  }

  return enhanced.join(' ');
}

/**
 * Generate SSML for Azure TTS with natural teacher-style intonation.
 */
function buildSSML(script: string, lang: 'ru' | 'uz', options: TtsOptions = {}): string {
  const rate = options.rate ?? -5; // Slightly slower for clarity
  const ratePercent = `${rate > 0 ? '+' : ''}${rate}%`;

  // Voice mapping - use expressive neural voices
  const voiceName = lang === 'ru' ? 'ru-RU-MadinaNeural' : 'uz-UZ-MadinaNeural';

  // Enhance script with SSML tags
  const enhancedScript = enhanceScriptWithSSML(script, lang);

  // Escape XML - preserve SSML tags by temporarily replacing them
  const ssmlTagPattern = /<\/?(?:break|emphasis)[^>]*>/g;
  const placeholders: Map<string, string> = new Map();
  let placeholderCounter = 0;
  
  // Replace SSML tags with unique placeholders
  const uniqueId = `_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_`;
  let textWithPlaceholders = enhancedScript.replace(ssmlTagPattern, (match) => {
    const key = `${uniqueId}${placeholderCounter++}`;
    placeholders.set(key, match);
    return key;
  });
  
  // Escape XML in text content
  let escaped = textWithPlaceholders
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Restore SSML tags
  for (const [key, tag] of placeholders.entries()) {
    escaped = escaped.replace(new RegExp(key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), tag);
  }

  // Validate pitch value (Azure accepts -50% to +50%)
  const pitchValue = '+2%';
  
  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="${lang === 'ru' ? 'ru-RU' : 'uz-UZ'}">
  <voice name="${voiceName}">
    <prosody rate="${ratePercent}" pitch="${pitchValue}">
      <break time="500ms"/>
      ${escaped}
    </prosody>
  </voice>
</speak>`;
}

/**
 * Generate audio file from script using Azure TTS REST API.
 * Returns path to generated WAV file.
 */
export async function synthesizeSpeech(
  script: string,
  lang: 'ru' | 'uz',
  outputPath: string,
  options: TtsOptions = {}
): Promise<string> {
  if (!AZURE_SPEECH_KEY) {
    throw new Error('AZURE_SPEECH_KEY not configured');
  }

  const ssml = buildSSML(script, lang, options);
  
  // Validate SSML structure (basic check)
  const openTags = (ssml.match(/<[^/][^>]*>/g) || []).length;
  const closeTags = (ssml.match(/<\/[^>]+>/g) || []).length;
  if (openTags !== closeTags) {
    console.error('[Azure TTS] SSML tag mismatch:', { openTags, closeTags });
    console.error('[Azure TTS] SSML:', ssml.slice(0, 1000));
  }
  
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
    // Log SSML for debugging
    console.error('[Azure TTS] SSML length:', ssml.length);
    console.error('[Azure TTS] SSML (first 800 chars):', ssml.slice(0, 800));
    console.error('[Azure TTS] Error:', response.status, errorText.slice(0, 800));
    throw new Error(`Azure TTS failed: ${response.status} ${errorText.slice(0, 300)}`);
  }

  const audioBuffer = await response.arrayBuffer();
  const audioDir = path.dirname(outputPath);
  fs.mkdirSync(audioDir, { recursive: true });
  fs.writeFileSync(outputPath, Buffer.from(audioBuffer));

  return outputPath;
}

/**
 * Get audio file path for question and language.
 */
export function getAudioPath(questionId: string, lang: 'ru' | 'uz'): string {
  return path.join(AUDIO_BASE_DIR, `${questionId}_${lang}.wav`);
}
