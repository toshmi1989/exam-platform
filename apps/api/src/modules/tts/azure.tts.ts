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
  // Split into sentences for better control
  const sentences = script.split(/([.!?]\s+)/).filter(Boolean);
  const enhanced: string[] = [];

  for (let i = 0; i < sentences.length; i++) {
    let sentence = sentences[i].trim();
    if (!sentence) continue;

    // Add emphasis on key words
    if (lang === 'ru') {
      sentence = sentence.replace(
        /\b(важно|ключевой|главное|основное|главный|основной|нужно|необходимо|следует|помнить)\b/gi,
        '<emphasis level="strong">$1</emphasis>'
      );
      sentence = sentence.replace(/(\d+[%°]?)/g, '<emphasis level="moderate">$1</emphasis>');
    } else {
      sentence = sentence.replace(
        /\b(muhim|asosiy|bosh|eng|kerak|zarur|eslab)\b/gi,
        '<emphasis level="strong">$1</emphasis>'
      );
      sentence = sentence.replace(/(\d+[%°]?)/g, '<emphasis level="moderate">$1</emphasis>');
    }

    // Add pauses after commas
    sentence = sentence.replace(/,\s+/g, ',<break time="400ms"/> ');

    enhanced.push(sentence);

    // Add longer pause after sentences (except last)
    if (sentence.match(/[.!?]$/) && i < sentences.length - 1) {
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
  const placeholders: string[] = [];
  let placeholderIndex = 0;
  
  // Replace SSML tags with placeholders
  let textWithPlaceholders = enhancedScript.replace(ssmlTagPattern, (match) => {
    placeholders.push(match);
    return `__SSML_${placeholderIndex++}__`;
  });
  
  // Escape XML in text content
  let escaped = textWithPlaceholders
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
  
  // Restore SSML tags (they're already valid XML)
  placeholderIndex = 0;
  escaped = escaped.replace(/__SSML_(\d+)__/g, () => placeholders[placeholderIndex++] || '');

  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="${lang === 'ru' ? 'ru-RU' : 'uz-UZ'}">
  <voice name="${voiceName}">
    <prosody rate="${ratePercent}" pitch="+2%">
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
    throw new Error(`Azure TTS failed: ${response.status} ${errorText.slice(0, 200)}`);
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
