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
 * Clear all TTS data: scripts and audio files.
 * Returns count of deleted records and files.
 */
export async function clearAllTtsData(): Promise<{ scriptsDeleted: number; audioDeleted: number; filesDeleted: number }> {
  // 1. Get all audio records to delete files
  const audioRecords = await prisma.questionAudio.findMany();
  let filesDeleted = 0;
  
  // 2. Delete physical audio files
  for (const record of audioRecords) {
    try {
      if (fs.existsSync(record.audioPath)) {
        fs.unlinkSync(record.audioPath);
        filesDeleted++;
      }
    } catch (error) {
      console.error(`[TTS Cleanup] Failed to delete file ${record.audioPath}:`, error);
    }
  }
  
  // 3. Delete database records
  const scriptsResult = await prisma.questionAudioScript.deleteMany();
  const audioResult = await prisma.questionAudio.deleteMany();
  
  return {
    scriptsDeleted: scriptsResult.count,
    audioDeleted: audioResult.count,
    filesDeleted,
  };
}

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
  // Note: We'll determine actual language during generation, but use requested lang for hash/cache key
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

    const scriptResult = generateAudioScript({
      question: question.prompt,
      correctAnswer,
      aiExplanation: explanationRecord.content,
      lang,
    });

    const scriptContent = scriptResult.script;
    const actualLang = scriptResult.actualLang; // Use actual language for SSML generation

    // Validate script was generated
    if (!scriptContent || scriptContent.trim().length < 20) {
      console.error('[TTS] Generated script is too short:', scriptContent);
      throw new Error(`Failed to generate audio script: script is too short (${scriptContent?.length || 0} chars)`);
    }

    // Clean text for database storage (basic normalization only)
    let cleanContent = scriptContent
      .normalize('NFC')
      .replace(/[\uD800-\uDFFF]/g, '') // Remove broken surrogates
      .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F-\x9F]/g, '') // Remove control chars
      .replace(/[\uFEFF]/g, '') // Remove BOM
      .trim();

    script = await prisma.questionAudioScript.upsert({
      where: { questionId_lang: { questionId, lang } },
      create: {
        questionId,
        lang, // Store requested lang in DB
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
  // Determine actual language from script content
  const scriptLang = script.content.match(/(Давайте разберём|Keling)/) 
    ? (script.content.includes('Давайте разберём') ? 'ru' : 'uz')
    : lang; // Fallback to requested lang
  
  const audioPath = getAudioPath(questionId, scriptLang);
  // Use script content as-is (sanitization happens in buildSSML)
  await synthesizeSpeech(script.content, scriptLang, audioPath);

  // 6. Save audio record (use scriptLang, not requested lang)
  await prisma.questionAudio.upsert({
    where: { questionId_lang: { questionId, lang: scriptLang } },
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
