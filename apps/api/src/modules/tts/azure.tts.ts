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

const DEFAULT_RATE = 0;
const DEFAULT_PAUSE_MS = 500;

/**
 * Generate SSML for Azure TTS.
 */
function buildSSML(script: string, lang: 'ru' | 'uz', options: TtsOptions = {}): string {
  const rate = options.rate ?? DEFAULT_RATE;
  const pauseMs = options.pauseMs ?? DEFAULT_PAUSE_MS;
  const ratePercent = `${rate > 0 ? '+' : ''}${rate}%`;
  const pauseSec = pauseMs / 1000;

  // Voice mapping
  const voiceName = lang === 'ru' ? 'ru-RU-MadinaNeural' : 'uz-UZ-MadinaNeural';

  // Escape XML
  const escaped = script
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

  return `<speak xmlns="http://www.w3.org/2001/10/synthesis" version="1.0" xml:lang="${lang === 'ru' ? 'ru-RU' : 'uz-UZ'}">
  <voice name="${voiceName}">
    <prosody rate="${ratePercent}">
      <break time="${pauseSec}s"/>
      <emphasis level="moderate">
        ${escaped}
      </emphasis>
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
