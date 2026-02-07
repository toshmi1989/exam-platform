/**
 * Embedding and vector search for Ziyoda RAG.
 * Uses OpenAI embeddings via ziyoda-llm.client; cosine similarity in-memory.
 */

import { embedForZiyoda } from './ziyoda-llm.client';

export async function getEmbedding(text: string): Promise<number[]> {
  return embedForZiyoda(text);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface EntryWithEmbedding {
  id: string;
  content: string;
  embedding: unknown;
}

export function findTopK(
  queryEmbedding: number[],
  entries: EntryWithEmbedding[],
  k: number
): EntryWithEmbedding[] {
  const parsed = entries.map((e) => ({
    entry: e,
    vec: Array.isArray(e.embedding) ? (e.embedding as number[]) : [],
  }));
  const withScore = parsed
    .filter((p) => p.vec.length === queryEmbedding.length)
    .map((p) => ({
      entry: p.entry,
      score: cosineSimilarity(queryEmbedding, p.vec),
    }));
  withScore.sort((a, b) => b.score - a.score);
  return withScore.slice(0, k).map((x) => x.entry);
}
