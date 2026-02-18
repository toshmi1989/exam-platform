/**
 * TTS settings: singleton row in TtsSettings.
 * Used for enabled flag and voice selection (Azure TTS).
 */

import { prisma } from '../../db/prisma';

const DEFAULT_VOICE_RU = 'ru-RU-SvetlanaNeural';
const DEFAULT_VOICE_UZ = 'uz-UZ-MadinaNeural';

export interface TtsSettingsDto {
  enabled: boolean;
  voiceRu: string;
  voiceUz: string;
  regionConfigured: boolean;
  keyConfigured: boolean;
}

export async function getTtsSettingsDto(): Promise<TtsSettingsDto> {
  const row = await prisma.ttsSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
  const key = (process.env.AZURE_SPEECH_KEY ?? '').trim();
  const region = (process.env.AZURE_SPEECH_REGION ?? '').trim();
  return {
    enabled: row?.enabled ?? true,
    voiceRu: row?.voiceRu ?? DEFAULT_VOICE_RU,
    voiceUz: row?.voiceUz ?? DEFAULT_VOICE_UZ,
    regionConfigured: region.length > 0,
    keyConfigured: key.length > 0,
  };
}

/** Get settings for use in TTS pipeline (enabled + voices). */
export async function getTtsSettingsForPipeline(): Promise<{
  enabled: boolean;
  voiceRu: string;
  voiceUz: string;
}> {
  const row = await prisma.ttsSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
  return {
    enabled: row?.enabled ?? true,
    voiceRu: row?.voiceRu ?? DEFAULT_VOICE_RU,
    voiceUz: row?.voiceUz ?? DEFAULT_VOICE_UZ,
  };
}

export async function updateTtsSettings(update: {
  enabled?: boolean;
  voiceRu?: string;
  voiceUz?: string;
}): Promise<TtsSettingsDto> {
  const existing = await prisma.ttsSettings.findFirst({ orderBy: { updatedAt: 'desc' } });
  const defaultRow = {
    rate: 0,
    pauseMs: 500,
    ssmlTemplate: '',
  };
  let updated;
  if (existing) {
    updated = await prisma.ttsSettings.update({
      where: { id: existing.id },
      data: {
        ...(typeof update.enabled === 'boolean' && { enabled: update.enabled }),
        ...(update.voiceRu !== undefined && { voiceRu: update.voiceRu || null }),
        ...(update.voiceUz !== undefined && { voiceUz: update.voiceUz || null }),
      },
    });
  } else {
    updated = await prisma.ttsSettings.create({
      data: {
        ...defaultRow,
        enabled: update.enabled ?? true,
        voiceRu: update.voiceRu ?? null,
        voiceUz: update.voiceUz ?? null,
      },
    });
  }
  const key = (process.env.AZURE_SPEECH_KEY ?? '').trim();
  const region = (process.env.AZURE_SPEECH_REGION ?? '').trim();
  return {
    enabled: updated.enabled,
    voiceRu: updated.voiceRu ?? DEFAULT_VOICE_RU,
    voiceUz: updated.voiceUz ?? DEFAULT_VOICE_UZ,
    regionConfigured: region.length > 0,
    keyConfigured: key.length > 0,
  };
}
