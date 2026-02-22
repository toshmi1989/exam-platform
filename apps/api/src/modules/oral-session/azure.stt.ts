const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY ?? '';
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION ?? 'eastus';

const LANG_MAP: Record<string, string> = {
  ru: 'ru-RU',
  uz: 'uz-UZ',
};

/**
 * Transcribe audio buffer using Azure Speech-to-Text REST API.
 * Accepts WAV or WebM audio (pass the actual MIME type).
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
  const url =
    `https://${AZURE_SPEECH_REGION}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${language}&format=detailed`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': mimeType,
      'Transfer-Encoding': 'chunked',
    },
    body: audioBuffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`Azure STT error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    RecognitionStatus: string;
    NBest?: { Lexical?: string; ITN?: string; Display?: string }[];
    DisplayText?: string;
  };

  if (data.RecognitionStatus !== 'Success') {
    if (data.RecognitionStatus === 'NoMatch' || data.RecognitionStatus === 'InitialSilenceTimeout') {
      return '';
    }
    throw new Error(`Azure STT recognition status: ${data.RecognitionStatus}`);
  }

  // Prefer the top NBest result's display text
  const display =
    data.NBest?.[0]?.Display ?? data.DisplayText ?? '';

  return display.trim();
}
