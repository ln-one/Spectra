import "server-only";

import { knowledgeStructuredContentHash } from "@/features/knowledge/integrity";
import { extractKnowledgeEvidence } from "./knowledge-citation-contract";

export function assertKnowledgeEvidenceIntegrity(parts: readonly unknown[]) {
  const evidence = extractKnowledgeEvidence(parts);
  for (const item of evidence) {
    const digest = knowledgeStructuredContentHash({
      content: item.content,
      fidelity: item.fidelity,
      locator: item.locator,
    });
    if (digest !== item.contentHash) {
      throw new Error("knowledge_evidence_integrity_failed");
    }
  }
  return evidence;
}
