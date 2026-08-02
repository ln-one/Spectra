import { createHash } from "node:crypto";
import canonicalize from "canonicalize";

export function knowledgeContentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function knowledgeStructuredContentHash(value: unknown) {
  const serialized = canonicalize(value);
  if (serialized === undefined) throw new Error("knowledge_content_not_canonicalizable");
  return knowledgeContentHash(serialized);
}

export function normalizeStoredKnowledgeContentHash(input: {
  adapterId: string | null;
  adapterVersion: string | null;
  storedHash: string;
  exactText: string | null;
  content: unknown;
  locator: unknown;
  fidelity: unknown;
}) {
  const structuredHash = knowledgeStructuredContentHash({
    content: input.content,
    fidelity: input.fidelity,
    locator: input.locator,
  });
  if (input.storedHash === structuredHash) return structuredHash;
  throw new Error("knowledge_content_integrity_failed");
}
