import "server-only";

import { canonicalJsonSha256 } from "@/database/canonical-json";

const MAX_CACHED_ATTEMPTS = 512;

export type InputBoundAttempt<T> = { attempt: Promise<T>; inputHash: string };

function evictOldestAttempt<T>(attempts: Map<string, T>) {
  if (attempts.size < MAX_CACHED_ATTEMPTS) return;
  const oldest = attempts.keys().next();
  if (!oldest.done) attempts.delete(oldest.value);
}

export async function createOnce<T>(
  attempts: Map<string, Promise<T>>,
  key: string,
  create: () => Promise<T>,
) {
  const existing = attempts.get(key);
  if (existing) return { detail: await existing, first: false };
  evictOldestAttempt(attempts);
  const attempt = create();
  attempts.set(key, attempt);
  return { detail: await attempt, first: true };
}

export async function runInputBoundOnce<T>(
  attempts: Map<string, InputBoundAttempt<T>>,
  key: string,
  input: unknown,
  conflictCode: string,
  update: () => Promise<T>,
) {
  const inputHash = canonicalJsonSha256(input);
  const existing = attempts.get(key);
  if (existing) {
    if (existing.inputHash !== inputHash) throw new Error(conflictCode);
    return { detail: await existing.attempt, first: false };
  }
  evictOldestAttempt(attempts);
  const attempt = update();
  attempts.set(key, { attempt, inputHash });
  return { detail: await attempt, first: true };
}
