/**
 * TTS service: orchestrates script generation and audio synthesis.
 * Implements getOrCreateAudio flow with caching.
 */

/**
 * TTS service: orchestrates script generation and audio synthesis.
 * Implements getOrCreateAudio flow with caching.
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { prisma } from '../../db/prisma';
import { generateAudioScript } from './audio-script.generator';
import { synthesizeSpeech, getAudioPath } from './azure.tts';
import { getOrCreateExplanation } from '../ai/ai.service';

const AUDIO_BASE_URL = process.env.AUDIO_BASE_URL ?? '/audio';

/**
 * Calculate hash for script regeneration check.
 */
function calculateHash(questionText: string, aiExplanation: string, lang: string): string {
  return createHash('sha256')
    .update(`${questionText}|${aiExplanation}|${lang}`)
    .digest('hex');
}

/**
 * Get or create audio for question.
 * Returns public URL to audio file.
 */
export async function getOrCreateAudio(
  questionId: string,
  lang: 'ru' | 'uz'
): Promise<{ audioUrl: string }> {
  // 1. Check if audio exists
  const existing = await prisma.questionAudio.findUnique({
    where: { questionId_lang: { questionId, lang } },
  });

  if (existing && fs.existsSync(existing.audioPath)) {
    return { audioUrl: `${AUDIO_BASE_URL}/${path.basename(existing.audioPath)}` };
  }

  // 2. Load question with options
  const question = await prisma.question.findUnique({
    where: { id: questionId },
    include: {
      options: { orderBy: { order: 'asc' } },
      exam: true,
    },
  });

  if (!question) {
    throw new Error('Question not found');
  }

  // 3. Get AI explanation (ensure it exists first)
  const explanationResult = await getOrCreateExplanation(questionId);
  if (!explanationResult.success) {
    throw new Error('AI explanation not available');
  }

  // Get raw explanation from DB (without greeting)
  const explanationRecord = await prisma.questionAIExplanation.findUnique({
    where: { questionId },
  });

  if (!explanationRecord) {
    throw new Error('AI explanation record not found');
  }

  // 4. Check if script needs regeneration
  const expectedHash = calculateHash(question.prompt, explanationRecord.content, lang);
  let script = await prisma.questionAudioScript.findUnique({
    where: { questionId_lang: { questionId, lang } },
  });

  if (!script || script.hash !== expectedHash) {
    // Generate new script
    const correctOption = question.options.find((opt) => opt.isCorrect);
    const correctAnswer = correctOption?.label ?? '';

    const scriptContent = generateAudioScript({
      question: question.prompt,
      correctAnswer,
      aiExplanation: explanationRecord.content,
      lang,
    });

    // Clean text: remove invalid UTF-16 surrogates and normalize
    // More aggressive cleaning for Prisma compatibility
    let cleanContent = scriptContent
      .replace(/[\uD800-\uDFFF]/g, '') // Remove invalid surrogates
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove all control chars
      .replace(/[\uFEFF]/g, '') // Remove BOM
      .normalize('NFC') // Normalize Unicode
      .trim();
    
    // Additional safety: ensure valid UTF-8
    try {
      // Try to encode/decode to validate UTF-8
      Buffer.from(cleanContent, 'utf8').toString('utf8');
    } catch {
      // If invalid, remove problematic characters more aggressively
      cleanContent = cleanContent
        .split('')
        .filter((char) => {
          try {
            Buffer.from(char, 'utf8').toString('utf8');
            return true;
          } catch {
            return false;
          }
        })
        .join('');
    }

    script = await prisma.questionAudioScript.upsert({
      where: { questionId_lang: { questionId, lang } },
      create: {
        questionId,
        lang,
        content: cleanContent,
        hash: expectedHash,
      },
      update: {
        content: cleanContent,
        hash: expectedHash,
      },
    });
  }

  // 5. Generate audio
  const audioPath = getAudioPath(questionId, lang);
  const cleanScriptContent = script.content
    .replace(/[\uD800-\uDFFF]/g, '') // Remove invalid surrogates
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '') // Remove control chars
    .normalize('NFC')
    .trim();
  await synthesizeSpeech(cleanScriptContent, lang, audioPath);

  // 6. Save audio record
  await prisma.questionAudio.upsert({
    where: { questionId_lang: { questionId, lang } },
    create: {
      questionId,
      lang,
      audioPath,
    },
    update: {
      audioPath,
    },
  });

  return { audioUrl: `${AUDIO_BASE_URL}/${path.basename(audioPath)}` };
}
