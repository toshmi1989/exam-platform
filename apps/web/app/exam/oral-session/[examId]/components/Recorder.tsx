'use client';

import { useRef, useState, useEffect, useCallback } from 'react';

export interface RecorderProps {
  onRecordingComplete: (blob: Blob, mimeType: string) => void | Promise<void>;
  disabled?: boolean;
  lang?: 'ru' | 'uz' | 'en';
}

const COPY = {
  ru: {
    permissionError: 'Нет доступа к микрофону. Разрешите доступ в настройках браузера.',
    startError: 'Не удалось запустить запись.',
    tapToRecord: 'Нажмите для записи',
    recording: 'Запись...',
    tapToStop: 'Нажмите для остановки',
    processing: 'Конвертация...',
    listenRecord: 'Прослушайте запись перед отправкой',
    sendRecord: 'Отправить ответ',
    deleteRecord: 'Удалить запись',
  },
  uz: {
    permissionError: "Mikrofonga ruxsat yo'q. Brauzer sozlamalarida ruxsat bering.",
    startError: "Yozuvni boshlab bo'lmadi.",
    tapToRecord: 'Yozishni boshlash uchun bosing',
    recording: 'Yozilmoqda...',
    tapToStop: 'Toʻxtatish uchun bosing',
    processing: 'Konvertatsiya...',
    listenRecord: "Yuborishdan oldin yozuvni tinglang",
    sendRecord: 'Javobni yuborish',
    deleteRecord: "Yozuvni o'chirish",
  },
  en: {
    permissionError: 'Microphone access denied. Please enable it in browser settings.',
    startError: 'Could not start recording.',
    tapToRecord: 'Tap to record',
    recording: 'Recording...',
    tapToStop: 'Tap to stop',
    processing: 'Converting...',
    listenRecord: 'Listen before sending',
    sendRecord: 'Send answer',
    deleteRecord: 'Delete recording',
  },
};

/**
 * Convert any audio Blob to WAV PCM 16kHz mono — the only format
 * reliably accepted by Azure Speech-to-Text short audio REST API.
 */
async function convertToWav16k(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioCtx();
  const decoded = await ctx.decodeAudioData(arrayBuffer);
  await ctx.close();

  const targetSampleRate = 16000;
  const numChannels = 1; // mono

  // Resample: use OfflineAudioContext
  const offlineCtx = new OfflineAudioContext(numChannels, Math.ceil(decoded.duration * targetSampleRate), targetSampleRate);
  const source = offlineCtx.createBufferSource();
  source.buffer = decoded;
  source.connect(offlineCtx.destination);
  source.start(0);
  const rendered = await offlineCtx.startRendering();

  const pcmData = rendered.getChannelData(0);
  return encodePcmToWav(pcmData, targetSampleRate);
}

function encodePcmToWav(pcmData: Float32Array, sampleRate: number): Blob {
  const numSamples = pcmData.length;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRate * bytesPerSample;
  const blockAlign = bytesPerSample;
  const dataSize = numSamples * bytesPerSample;
  const headerSize = 44;

  const buffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(buffer);

  function writeStr(offset: number, str: string) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);         // PCM subchunk size
  view.setUint16(20, 1, true);          // PCM format
  view.setUint16(22, 1, true);          // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Convert float32 [-1, 1] to int16
  let offset = headerSize;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, pcmData[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export default function Recorder({ onRecordingComplete, disabled = false, lang = 'ru' }: RecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [recordedUrl, setRecordedUrl] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const copy = COPY[lang] ?? COPY.ru;

  useEffect(() => {
    return () => {
      stopTimer();
      if (recordedUrl) URL.revokeObjectURL(recordedUrl);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [recordedUrl]);

  function startTimer() {
    setDurationSeconds(0);
    timerRef.current = setInterval(() => {
      setDurationSeconds((s) => s + 1);
    }, 1000);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  const clearRecording = useCallback(() => {
    if (recordedUrl) URL.revokeObjectURL(recordedUrl);
    setRecordedUrl(null);
    setRecordedBlob(null);
    setDurationSeconds(0);
  }, [recordedUrl]);

  const startRecording = useCallback(async () => {
    if (disabled || isRecording || isProcessing) return;
    setError(null);
    chunksRef.current = [];
    clearRecording();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      streamRef.current = stream;

      // Pick best supported container — we'll convert to WAV afterwards anyway
      const mimeType =
        MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' :
        MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' :
        MediaRecorder.isTypeSupported('audio/ogg;codecs=opus') ? 'audio/ogg;codecs=opus' :
        'audio/ogg';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stopTimer();
        stream.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
        setIsRecording(false);
        setIsProcessing(true);

        try {
          const rawBlob = new Blob(chunksRef.current, { type: mimeType });
          // Convert to WAV 16kHz mono — required by Azure STT short audio REST API
          const wavBlob = await convertToWav16k(rawBlob);
          const url = URL.createObjectURL(wavBlob);
          setRecordedBlob(wavBlob);
          setRecordedUrl(url);
        } catch (convErr) {
          console.error('[Recorder] WAV conversion failed:', convErr);
          // Fallback: send raw blob, let backend handle it
          const rawBlob = new Blob(chunksRef.current, { type: mimeType });
          const url = URL.createObjectURL(rawBlob);
          setRecordedBlob(rawBlob);
          setRecordedUrl(url);
        } finally {
          setIsProcessing(false);
        }
      };

      recorder.start(250);
      setIsRecording(true);
      startTimer();
    } catch (err) {
      const isPermission =
        err instanceof DOMException &&
        (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
      setError(isPermission ? copy.permissionError : copy.startError);
    }
  }, [disabled, isRecording, isProcessing, copy, clearRecording]);

  const stopRecording = useCallback(() => {
    if (!isRecording || !mediaRecorderRef.current) return;
    mediaRecorderRef.current.stop();
  }, [isRecording]);

  const handleSend = useCallback(async () => {
    if (!recordedBlob || isProcessing || disabled) return;
    setIsProcessing(true);
    setError(null);
    try {
      await onRecordingComplete(recordedBlob, 'audio/wav');
      clearRecording();
    } finally {
      setIsProcessing(false);
    }
  }, [recordedBlob, isProcessing, disabled, onRecordingComplete, clearRecording]);

  function formatDuration(s: number) {
    const m = Math.floor(s / 60).toString().padStart(2, '0');
    const sec = (s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  const handleClick = isRecording ? stopRecording : startRecording;

  return (
    <div className="flex flex-col items-center gap-3">
      {error && (
        <p className="rounded-lg bg-rose-50 px-4 py-2 text-center text-sm text-rose-700">
          {error}
        </p>
      )}

      {/* Show mic button only when not showing preview */}
      {!recordedBlob && (
        <>
          <button
            type="button"
            onClick={handleClick}
            disabled={disabled || isProcessing}
            className={`relative flex h-20 w-20 items-center justify-center rounded-full shadow-lg transition-all duration-200 active:scale-95 disabled:opacity-50 ${
              isRecording
                ? 'bg-rose-500 hover:bg-rose-600'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
            aria-label={isRecording ? copy.tapToStop : copy.tapToRecord}
          >
            {isRecording && (
              <span className="absolute inset-0 animate-ping rounded-full bg-rose-400 opacity-40" />
            )}
            {isProcessing ? (
              <svg className="h-8 w-8 animate-spin text-white" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            ) : isRecording ? (
              <span className="h-5 w-5 rounded bg-white" />
            ) : (
              <svg className="h-9 w-9 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1a4 4 0 014 4v6a4 4 0 01-8 0V5a4 4 0 014-4zm6 10a6 6 0 01-12 0H4a8 8 0 0016 0h-2zM11 20h2v3h-2z" />
              </svg>
            )}
          </button>

          {isRecording && (
            <div className="flex items-end gap-1.5" aria-hidden>
              <span className="h-3 w-1 rounded bg-rose-400 animate-pulse" />
              <span className="h-5 w-1 rounded bg-rose-500 animate-pulse [animation-delay:120ms]" />
              <span className="h-7 w-1 rounded bg-rose-600 animate-pulse [animation-delay:240ms]" />
              <span className="h-4 w-1 rounded bg-rose-500 animate-pulse [animation-delay:360ms]" />
              <span className="h-6 w-1 rounded bg-rose-400 animate-pulse [animation-delay:480ms]" />
            </div>
          )}

          <p className="text-sm font-medium text-slate-600">
            {isProcessing
              ? copy.processing
              : isRecording
              ? `${copy.recording} ${formatDuration(durationSeconds)}`
              : copy.tapToRecord}
          </p>
        </>
      )}

      {/* Preview after recording */}
      {recordedBlob && recordedUrl && !isRecording && (
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-center text-xs text-slate-500">{copy.listenRecord}</p>
          <audio controls src={recordedUrl} className="w-full" />
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={clearRecording}
              disabled={isProcessing}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-50"
            >
              {copy.deleteRecord}
            </button>
            <button
              type="button"
              onClick={handleSend}
              disabled={isProcessing || disabled}
              className="rounded-lg bg-indigo-600 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {isProcessing ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </span>
              ) : copy.sendRecord}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
