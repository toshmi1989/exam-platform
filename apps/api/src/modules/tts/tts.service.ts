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
import { getTtsSettingsForPipeline } from './tts-settings.service';

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
 * Clear TTS data (scripts and audio) for all questions belonging to exams with the given directionGroupId.
 * If directionGroupId is an exam id (single exam without group), clears that exam only.
 */
export async function clearTtsDataByDirectionGroup(
  directionGroupId: string
): Promise<{ scriptsDeleted: number; audioDeleted: number; filesDeleted: number }> {
  const exams = await prisma.exam.findMany({
    where: {
      OR: [
        { directionGroupId },
        { id: directionGroupId },
      ],
    },
    select: { id: true },
  });
  const examIds = exams.map((e) => e.id);
  if (examIds.length === 0) {
    return { scriptsDeleted: 0, audioDeleted: 0, filesDeleted: 0 };
  }

  const questionIds = await prisma.question.findMany({
    where: { examId: { in: examIds } },
    select: { id: true },
  }).then((rows) => rows.map((r) => r.id));

  if (questionIds.length === 0) {
    return { scriptsDeleted: 0, audioDeleted: 0, filesDeleted: 0 };
  }

  const audioRecords = await prisma.questionAudio.findMany({
    where: { questionId: { in: questionIds } },
  });

  let filesDeleted = 0;
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

  const scriptsResult = await prisma.questionAudioScript.deleteMany({
    where: { questionId: { in: questionIds } },
  });
  const audioResult = await prisma.questionAudio.deleteMany({
    where: { questionId: { in: questionIds } },
  });

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
  lang: 'ru' | 'uz' // Requested lang (ignored, we use question-based detection)
): Promise<{ audioUrl: string }> {
  const ttsSettings = await getTtsSettingsForPipeline();
  if (!ttsSettings.enabled) {
    throw new Error('TTS is disabled in admin settings');
  }

  // 1. Load question first to determine language
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

  // DETERMINISTIC: Detect language from question text
  // Cyrillic → RU, Latin → UZ
  const questionLang = /[А-Яа-яЁё]/.test(question.prompt) ? 'ru' : 'uz';
  
  // Check if audio exists for question language
  const existing = await prisma.questionAudio.findUnique({
    where: { questionId_lang: { questionId, lang: questionLang } },
  });

  if (existing && fs.existsSync(existing.audioPath)) {
    return { audioUrl: `${AUDIO_BASE_URL}/${path.basename(existing.audioPath)}` };
  }

  // 2. Get AI explanation (ensure it exists first)
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

  // 3. Use question language for hash and cache key (already determined above)
  const expectedHash = calculateHash(question.prompt, explanationRecord.content, questionLang);
  let script = await prisma.questionAudioScript.findUnique({
    where: { questionId_lang: { questionId, lang: questionLang } },
  });

  let generationLang: 'ru' | 'uz' = questionLang;

  if (!script || script.hash !== expectedHash) {
    // Generate new script based on QUESTION + ANSWER + explanation
    // For oral questions, there might be no correct option - extract from explanation
    const correctOption = question.options.find((opt) => opt.isCorrect);
    let correctAnswer = correctOption?.label ?? '';
    
    // If no correct answer found, extract key concept from explanation
    if (!correctAnswer || correctAnswer.trim().length < 10) {
      // Extract first meaningful sentence from explanation
      const sentences = explanationRecord.content.split(/[.!?]\s+/).filter(s => s.trim().length > 15);
      if (sentences.length > 0) {
        correctAnswer = sentences[0].trim().slice(0, 200);
      }
    }

    const scriptResult = await generateAudioScript({
      question: question.prompt,
      correctAnswer,
      aiExplanation: explanationRecord.content,
      lang: questionLang, // Use question language
    });

    const scriptContent = scriptResult.script;
    generationLang = scriptResult.actualLang; // deterministic from question text

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
      where: { questionId_lang: { questionId, lang: generationLang } },
      create: {
        questionId,
        lang: generationLang,
        content: cleanContent,
        hash: expectedHash,
      },
      update: {
        content: cleanContent,
        hash: expectedHash,
      },
    });
  }

  // 5. Generate audio using language derived from question text.
  const audioPath = getAudioPath(questionId, generationLang);
  try {
    await synthesizeSpeech(script.content, generationLang, audioPath, {
      voiceRu: ttsSettings.voiceRu,
      voiceUz: ttsSettings.voiceUz,
    });
  } catch (error) {
    // Do not break exam flow when generation fails and old audio exists.
    const fallback = await prisma.questionAudio.findUnique({
      where: { questionId_lang: { questionId, lang: generationLang } },
    });
    if (fallback && fs.existsSync(fallback.audioPath)) {
      return { audioUrl: `${AUDIO_BASE_URL}/${path.basename(fallback.audioPath)}` };
    }
    throw error;
  }

  // 6. Save audio record.
  await prisma.questionAudio.upsert({
    where: { questionId_lang: { questionId, lang: generationLang } },
    create: {
      questionId,
      lang: generationLang,
      audioPath,
    },
    update: {
      audioPath,
    },
  });

  return { audioUrl: `${AUDIO_BASE_URL}/${path.basename(audioPath)}` };
}
