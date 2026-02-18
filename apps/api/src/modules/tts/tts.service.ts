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
    // For oral questions, there might be no correct option - use empty string or extract from explanation
    const correctOption = question.options.find((opt) => opt.isCorrect);
    let correctAnswer = correctOption?.label ?? '';
    
    // If no correct answer found and it's an oral question, try to extract key concept from explanation
    if (!correctAnswer && question.type === 'ORAL') {
      // Extract first sentence or key phrase from explanation as "answer"
      const firstSentence = explanationRecord.content.split(/[.!?]/)[0]?.trim();
      if (firstSentence && firstSentence.length > 10 && firstSentence.length < 100) {
        correctAnswer = firstSentence;
      }
    }

    const scriptContent = generateAudioScript({
      question: question.prompt,
      correctAnswer,
      aiExplanation: explanationRecord.content,
      lang,
    });

    // Validate script was generated
    if (!scriptContent || scriptContent.trim().length < 20) {
      console.error('[TTS] Generated script is too short:', scriptContent);
      throw new Error(`Failed to generate audio script: script is too short (${scriptContent?.length || 0} chars)`);
    }

    // Clean text: remove invalid UTF-16 surrogates and normalize
    // More aggressive cleaning for Prisma compatibility
    let cleanContent = scriptContent
      // First, normalize to remove any invalid sequences
      .normalize('NFC')
      // Remove invalid UTF-16 surrogates (lone surrogates)
      .replace(/[\uD800-\uDFFF]/g, '')
      // Remove all control characters except newlines and tabs
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '')
      // Remove BOM
      .replace(/[\uFEFF]/g, '')
      // Remove any remaining problematic Unicode ranges
      .replace(/[\uFFFE\uFFFF]/g, '')
      .trim();
    
    // Additional safety: ensure valid UTF-8 by re-encoding
    try {
      // Re-encode to ensure valid UTF-8
      const buffer = Buffer.from(cleanContent, 'utf8');
      cleanContent = buffer.toString('utf8');
      
      // Validate: check for any remaining surrogates
      if (/[\uD800-\uDFFF]/.test(cleanContent)) {
        console.warn('[TTS] Warning: Found remaining surrogates after cleaning, removing...');
        cleanContent = cleanContent.replace(/[\uD800-\uDFFF]/g, '');
      }
    } catch (error) {
      console.error('[TTS] UTF-8 validation failed:', error);
      // Fallback: remove all non-printable characters
      cleanContent = cleanContent
        .split('')
        .filter((char) => {
          const code = char.charCodeAt(0);
          // Keep printable characters and common Unicode ranges
          return (
            (code >= 32 && code <= 126) || // ASCII printable
            (code >= 160 && code <= 55295) || // Latin-1 Supplement and most of BMP
            (code >= 57344 && code <= 65533) || // Private Use Area (skip surrogates)
            (code >= 65536 && code <= 1114111) // Supplementary planes
          );
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
