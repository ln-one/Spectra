import { createHash } from "node:crypto";
import type { EmbeddingPort, RerankPort } from "@/features/knowledge/ports";

const ACCEPTANCE_EMBEDDING_DIMENSION = 512;

function acceptanceTokens(text: string) {
  const normalized = text.normalize("NFKC").toLocaleLowerCase("und");
  const tokens: string[] = [];
  for (const match of normalized.matchAll(/[\p{Script=Latin}\p{N}_-]+/gu)) {
    if (match[0].length > 1) tokens.push(match[0]);
  }
  for (const match of normalized.matchAll(/[\p{Script=Han}]+/gu)) {
    const characters = Array.from(match[0]);
    tokens.push(...characters);
    for (let index = 0; index + 1 < characters.length; index += 1) {
      tokens.push(`${characters[index]}${characters[index + 1]}`);
    }
  }
  return tokens;
}

export function deterministicEmbedding(text: string, dimension = ACCEPTANCE_EMBEDDING_DIMENSION) {
  const vector = Array.from({ length: dimension }, () => 0);
  const counts = new Map<string, number>();
  for (const token of acceptanceTokens(text)) counts.set(token, (counts.get(token) ?? 0) + 1);
  for (const [token, count] of counts) {
    const digest = createHash("sha256").update(token).digest();
    const index = digest.readUInt32BE(0) % dimension;
    vector[index] = (vector[index] ?? 0) + 1 + Math.log(count);
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    vector[0] = 1;
    return vector;
  }
  return vector.map((value) => value / norm);
}

export function deterministicEmbeddingPort(): EmbeddingPort {
  return {
    async embed(texts) {
      return texts.map((text) => deterministicEmbedding(text));
    },
  };
}

function lexicalScore(query: string, document: string) {
  const queryTokens = new Set(acceptanceTokens(query));
  const documentTokens = new Set(acceptanceTokens(document));
  let overlap = 0;
  for (const token of queryTokens) if (documentTokens.has(token)) overlap += 1;
  return overlap / Math.max(1, queryTokens.size);
}

export function deterministicRerankPort(): RerankPort {
  return {
    async rerank({ query, documents }) {
      return documents
        .map((document) => ({ ...document, score: lexicalScore(query, document.text) }))
        .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
        .map(({ id, score }) => ({ id, score }));
    },
  };
}
