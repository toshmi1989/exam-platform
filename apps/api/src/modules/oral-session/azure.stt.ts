const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY ?? '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION ?? 'eastus';

const LANG_MAP: Record<string, string> = {
  ru: 'ru-RU',
  uz: 'uz-UZ',
};

/**
 * Azure STT short audio REST API only accepts:
 *   - audio/wav; codecs=audio/pcm; samplerate=16000
 *   - audio/ogg; codecs=opus
 *
 * WebM is NOT supported. The Recorder component converts to WAV 16kHz before sending.
 */
function getAzureContentType(mimeType: string): string {
  const t = (mimeType || '').toLowerCase();
  if (t.includes('ogg')) return 'audio/ogg; codecs=opus';
  // Default: WAV PCM (browser Recorder always sends this after conversion)
  return 'audio/wav; codecs=audio/pcm; samplerate=16000';
}

/**
 * Transcribe audio buffer using Azure Speech-to-Text REST API (short audio).
 * Input must be WAV PCM 16kHz mono or OGG/OPUS — the only formats supported.
 */
export async function transcribeAudio(
  audioBuffer: Buffer,
  lang: 'ru' | 'uz' = 'ru',
  mimeType: string = 'audio/wav'
): Promise<string> {
  if (!AZURE_SPEECH_KEY) {
    throw new Error('AZURE_SPEECH_KEY is not configured');
  }

  const language = LANG_MAP[lang] ?? 'ru-RU';
  const contentType = getAzureContentType(mimeType);
  const url =
    `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${language}&format=detailed`;

  console.log(`[Azure STT] lang=${language} contentType=${contentType} bufferSize=${audioBuffer.length}`);

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': contentType,
      'Accept': 'application/json',
    },
    body: audioBuffer,
  });

  const responseText = await response.text();
  console.log(`[Azure STT] HTTP ${response.status}: ${responseText.slice(0, 300)}`);

  if (!response.ok) {
    throw new Error(`Azure STT error ${response.status}: ${responseText}`);
  }

  const data = JSON.parse(responseText) as {
    RecognitionStatus: string;
    NBest?: { Lexical?: string; ITN?: string; Display?: string }[];
    DisplayText?: string;
  };

  console.log(`[Azure STT] RecognitionStatus=${data.RecognitionStatus}`);

  if (data.RecognitionStatus !== 'Success') {
    if (data.RecognitionStatus === 'NoMatch' || data.RecognitionStatus === 'InitialSilenceTimeout') {
      return '';
    }
    throw new Error(`Azure STT recognition status: ${data.RecognitionStatus}`);
  }

  const display = data.NBest?.[0]?.Display ?? data.DisplayText ?? '';
  console.log(`[Azure STT] transcript="${display.slice(0, 100)}"`);
  return display.trim();
}
