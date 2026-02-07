/**
 * Knowledge base for Ziyoda RAG: upload (PDF/DOCX/TXT), chunk, embed, reindex.
 */

import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';
import { prisma } from '../../db/prisma';
import { getEmbedding } from './embedding';

const MIN_CHUNK = 400;
const MAX_CHUNK = 600;
/** Максимум символов в одном чанке для эмбеддинга (лимит контекста модели ~8k токенов, ~2k символов с запасом) */
const MAX_CHUNK_FOR_EMBED = 2000;

function decodeBase64(fileBase64: string): Buffer {
  const base64 = fileBase64.includes(',')
    ? fileBase64.split(',')[1]
    : fileBase64;
  return Buffer.from(base64, 'base64');
}

function chunkText(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const paragraphs = normalized.split(/\n\s*\n/).filter((p) => p.trim());
  const chunks: string[] = [];
  let current = '';
  for (const p of paragraphs) {
    const next = current ? `${current}\n\n${p}` : p;
    if (next.length >= MAX_CHUNK) {
      if (current) chunks.push(current);
      if (p.length >= MIN_CHUNK) {
        current = p;
      } else {
        current = next.length <= MAX_CHUNK ? next : p;
      }
    } else {
      current = next;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0 && normalized.length > 0) {
    for (let i = 0; i < normalized.length; i += MAX_CHUNK) {
      chunks.push(normalized.slice(i, i + MAX_CHUNK));
    }
  }
  // Разбить любой чанк длиннее MAX_CHUNK_FOR_EMBED (лимит контекста API)
  const result: string[] = [];
  for (const c of chunks) {
    if (c.length <= MAX_CHUNK_FOR_EMBED) {
      result.push(c);
    } else {
      for (let i = 0; i < c.length; i += MAX_CHUNK_FOR_EMBED) {
        result.push(c.slice(i, i + MAX_CHUNK_FOR_EMBED));
      }
    }
  }
  return result.filter((c) => c.length >= 1);
}

export async function extractText(buffer: Buffer, filename: string): Promise<string> {
  const ext = filename.toLowerCase().replace(/.*\./, '') || '';
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      await parser.destroy();
      return result?.text?.trim() ?? '';
    } catch (e) {
      await parser.destroy().catch(() => {});
      throw e;
    }
  }
  if (ext === 'docx' || ext === 'doc') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      const text = (result.value ?? '').trim();
      if (!text && ext === 'doc') {
        throw new Error('Формат .doc не поддерживается. Сохраните файл в Word как .docx');
      }
      return text;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (ext === 'doc' || msg.includes('docx') || msg.includes('invalid')) {
        throw new Error('Не удалось извлечь текст. Поддерживается только .docx (не старый .doc). Сохраните файл как .docx в Word.');
      }
      throw e;
    }
  }
  // .txt или без расширения — как текст в UTF-8 (убираем BOM, если есть)
  let text = buffer.toString('utf-8').trim();
  if (text.charCodeAt(0) === 0xfeff) {
    text = text.slice(1).trim();
  }
  return text;
}

export interface UploadKnowledgeParams {
  fileBase64: string;
  filename: string;
}

export async function uploadKnowledge(
  params: UploadKnowledgeParams
): Promise<{ chunksCreated: number }> {
  const buffer = decodeBase64(params.fileBase64);
  if (buffer.length === 0) {
    throw new Error('Файл пуст или неверные данные.');
  }
  const text = await extractText(buffer, params.filename);
  if (!text) {
    throw new Error('Не удалось извлечь текст из файла. Проверьте формат (поддерживаются PDF, .docx, .txt).');
  }
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error('После обработки не получилось выделить фрагменты текста.');
  }
  const title = params.filename;
  const source = params.filename;
  let created = 0;
  for (const content of chunks) {
    const embedding = await getEmbedding(content);
    await prisma.knowledgeBaseEntry.create({
      data: {
        title,
        source,
        content,
        embedding: embedding as unknown as object,
      },
    });
    created++;
  }
  return { chunksCreated: created };
}

export interface AddTextKnowledgeParams {
  text: string;
  title?: string;
}

export async function addTextToKnowledge(
  params: AddTextKnowledgeParams
): Promise<{ chunksCreated: number }> {
  const text = (params.text ?? '').trim();
  if (!text) {
    throw new Error('Введите или вставьте текст.');
  }
  const title = (params.title ?? 'Вставленный текст').trim() || 'Вставленный текст';
  const chunks = chunkText(text);
  if (chunks.length === 0) {
    throw new Error('Не удалось разбить текст на фрагменты. Добавьте больше текста.');
  }
  let created = 0;
  for (const content of chunks) {
    const embedding = await getEmbedding(content);
    await prisma.knowledgeBaseEntry.create({
      data: {
        title,
        source: title,
        content,
        embedding: embedding as unknown as object,
      },
    });
    created++;
  }
  return { chunksCreated: created };
}

export interface ReindexProgress {
  total: number;
  processed: number;
  done?: boolean;
}

export async function reindexKnowledge(
  onProgress: (p: ReindexProgress) => void
): Promise<void> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    select: { id: true, content: true },
  });
  const total = entries.length;
  let processed = 0;
  for (const entry of entries) {
    const embedding = await getEmbedding(entry.content);
    await prisma.knowledgeBaseEntry.update({
      where: { id: entry.id },
      data: { embedding: embedding as unknown as object },
    });
    processed++;
    onProgress({ total, processed });
  }
  onProgress({ total, processed, done: true });
}

export async function getKnowledgeStats(): Promise<{
  totalEntries: number;
  totalCacheEntries: number;
}> {
  const [totalEntries, totalCacheEntries] = await Promise.all([
    prisma.knowledgeBaseEntry.count(),
    prisma.botAnswerCache.count(),
  ]);
  return { totalEntries, totalCacheEntries };
}

export interface KnowledgeEntryItem {
  id: string;
  title: string;
  source: string;
  createdAt: string;
}

export async function listKnowledgeEntries(): Promise<KnowledgeEntryItem[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    select: { id: true, title: true, source: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
  return entries.map((e) => ({
    id: e.id,
    title: e.title,
    source: e.source,
    createdAt: e.createdAt.toISOString(),
  }));
}

export async function deleteKnowledgeEntry(id: string): Promise<void> {
  await prisma.knowledgeBaseEntry.delete({
    where: { id },
  });
  await prisma.botAnswerCache.deleteMany({});
}

export interface KnowledgeFileItem {
  source: string;
  name: string;
  chunkCount: number;
  createdAt: string;
}

/** Группировка по source (имя файла/вставки): один пункт на загруженный файл или вставленный текст. */
export async function listKnowledgeFiles(): Promise<KnowledgeFileItem[]> {
  const entries = await prisma.knowledgeBaseEntry.findMany({
    select: { source: true, title: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const bySource = new Map<string, { name: string; count: number; createdAt: Date }>();
  for (const e of entries) {
    const key = e.source;
    const existing = bySource.get(key);
    if (existing) {
      existing.count++;
    } else {
      bySource.set(key, {
        name: (e.title || e.source || key).trim() || key,
        count: 1,
        createdAt: e.createdAt,
      });
    }
  }
  return Array.from(bySource.entries())
    .map(([source, v]) => ({
      source,
      name: v.name,
      chunkCount: v.count,
      createdAt: v.createdAt.toISOString(),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

/** Удалить все фрагменты с данным source (один «файл»). Не меняет структуру БД для RAG. */
export async function deleteKnowledgeBySource(source: string): Promise<{ deleted: number }> {
  const result = await prisma.knowledgeBaseEntry.deleteMany({
    where: { source },
  });
  await prisma.botAnswerCache.deleteMany({});
  return { deleted: result.count };
}
