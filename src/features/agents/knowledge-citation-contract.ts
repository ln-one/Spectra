import { z } from "zod";
import {
  evidenceContentSchema,
  evidenceFidelitySchema,
  evidenceLocatorSchema,
} from "@/features/knowledge/schemas";
import {
  sourcePresentationHintSchema,
  sourceWorkspaceOriginSchema,
} from "@/features/sources/presentation";

export const KNOWLEDGE_EVIDENCE_DATA_PART = "data-knowledgeEvidence" as const;
const KNOWLEDGE_EVIDENCE_FRAGMENT_PREFIX = "#knowledge-evidence-";
const citationTokenSchema = z.string().regex(/^ke-[a-z0-9]{16}$/);
const knowledgeCitationFallbackPattern = /\[(?:(\^|C|E))?([1-9]\d*)\](?!\()/gi;
export const knowledgeWorkspaceOriginSchema = sourceWorkspaceOriginSchema;
const commonEvidenceShape = {
  citationNumber: z.int().positive(),
  citationToken: citationTokenSchema,
  evidenceId: z.string().uuid(),
  sourceId: z.string().uuid(),
  sourceName: z.string().trim().min(1).max(255),
  sourcePresentation: sourcePresentationHintSchema.optional(),
  sourceRevision: z.int().positive(),
  contentHash: z.string().regex(/^[a-f0-9]{64}$/),
};

const knowledgeCitationEvidenceSchema = z
  .object({
    ...commonEvidenceShape,
    exactExcerpt: z.string().min(1).nullable(),
    representationHash: z.string().regex(/^[a-f0-9]{64}$/),
    locator: evidenceLocatorSchema,
    content: evidenceContentSchema,
    fidelity: evidenceFidelitySchema,
    workspaceOrigin: knowledgeWorkspaceOriginSchema.optional(),
  })
  .strict()
  .superRefine((evidence, context) => {
    if (evidence.exactExcerpt === null && evidence.content.kind !== "visual_region") {
      context.addIssue({
        code: "custom",
        message: "Only visual evidence may omit exactExcerpt",
        path: ["exactExcerpt"],
      });
    }
  });

const knowledgeEvidenceDataSchema = z
  .object({
    schemaVersion: z.literal(2),
    evidence: z.array(knowledgeCitationEvidenceSchema).max(32),
    renderableVisualEvidenceIds: z.array(z.string().uuid()).max(3).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    const evidenceById = new Map(value.evidence.map((item) => [item.evidenceId, item]));
    for (const [index, evidenceId] of (value.renderableVisualEvidenceIds ?? []).entries()) {
      const evidence = evidenceById.get(evidenceId);
      if (evidence?.content.kind !== "visual_region") {
        context.addIssue({
          code: "custom",
          message: "Renderable visual IDs must reference visual Evidence",
          path: ["renderableVisualEvidenceIds", index],
        });
      }
    }
  })
  .refine(
    (value) =>
      value.evidence.every(
        (item, index) =>
          index === 0 || item.citationNumber > (value.evidence[index - 1]?.citationNumber ?? 0),
      ),
    {
      message: "Citation numbers must be strictly increasing within a data part",
      path: ["evidence"],
    },
  );

export type KnowledgeCitationEvidence = z.infer<typeof knowledgeCitationEvidenceSchema>;
export type TrustedKnowledgeCitationFallback = {
  end: number;
  evidence: KnowledgeCitationEvidence;
  kind: "artifact_grounding_ref" | "footnote" | "model_label" | "plain_number";
  start: number;
};

export function knowledgeEvidenceByCitationNumber(evidence: readonly KnowledgeCitationEvidence[]) {
  return new Map(evidence.map((unit) => [unit.citationNumber, unit]));
}

export function trustedKnowledgeCitationFallbacks(
  value: string,
  byNumber: ReadonlyMap<number, KnowledgeCitationEvidence>,
): TrustedKnowledgeCitationFallback[] {
  const matches: TrustedKnowledgeCitationFallback[] = [];
  for (const match of value.matchAll(knowledgeCitationFallbackPattern)) {
    const citationNumber = Number(match[2]);
    const evidence = byNumber.get(citationNumber);
    if (!evidence || match.index === undefined) continue;
    const marker = match[1]?.toUpperCase();
    matches.push({
      end: match.index + match[0].length,
      evidence,
      kind:
        marker === "E"
          ? "artifact_grounding_ref"
          : marker === "C"
            ? "model_label"
            : marker === "^"
              ? "footnote"
              : "plain_number",
      start: match.index,
    });
  }
  return matches;
}

export function countTrustedArtifactGroundingCitationFallbacks(
  parts: readonly unknown[],
  evidence: readonly KnowledgeCitationEvidence[],
) {
  const byNumber = knowledgeEvidenceByCitationNumber(evidence);
  let count = 0;
  for (const part of parts) {
    if (!part || typeof part !== "object" || Reflect.get(part, "type") !== "text") continue;
    const text = Reflect.get(part, "text");
    if (typeof text !== "string") continue;
    count += trustedKnowledgeCitationFallbacks(text, byNumber).filter(
      (match) => match.kind === "artifact_grounding_ref",
    ).length;
  }
  return count;
}

export function knowledgeEvidenceHref(citationToken: string) {
  return `${KNOWLEDGE_EVIDENCE_FRAGMENT_PREFIX}${citationTokenSchema.parse(citationToken)}`;
}

export function parseKnowledgeEvidenceHref(href: string | undefined) {
  if (!href?.startsWith(KNOWLEDGE_EVIDENCE_FRAGMENT_PREFIX)) return null;
  const parsed = citationTokenSchema.safeParse(
    href.slice(KNOWLEDGE_EVIDENCE_FRAGMENT_PREFIX.length),
  );
  return parsed.success ? parsed.data : null;
}

function sameEvidenceIdentity(
  existing: KnowledgeCitationEvidence,
  candidate: KnowledgeCitationEvidence,
) {
  if (
    existing.citationToken !== candidate.citationToken ||
    existing.citationNumber !== candidate.citationNumber ||
    existing.sourceId !== candidate.sourceId ||
    existing.sourceName !== candidate.sourceName ||
    existing.sourceRevision !== candidate.sourceRevision ||
    existing.exactExcerpt !== candidate.exactExcerpt ||
    existing.contentHash !== candidate.contentHash ||
    JSON.stringify(existing.locator) !== JSON.stringify(candidate.locator) ||
    JSON.stringify(existing.sourcePresentation) !== JSON.stringify(candidate.sourcePresentation)
  ) {
    return false;
  }
  return (
    existing.representationHash === candidate.representationHash &&
    existing.fidelity === candidate.fidelity &&
    JSON.stringify(existing.workspaceOrigin) === JSON.stringify(candidate.workspaceOrigin) &&
    JSON.stringify(existing.content) === JSON.stringify(candidate.content)
  );
}

export function extractKnowledgeEvidence(parts: readonly unknown[]): KnowledgeCitationEvidence[] {
  const byEvidenceId = new Map<string, KnowledgeCitationEvidence>();
  const evidenceIdByToken = new Map<string, string>();
  const evidenceIdByNumber = new Map<number, string>();
  for (const part of parts) {
    if (typeof part !== "object" || part === null) continue;
    const type = Reflect.get(part, "type");
    const isEvidencePart =
      type === KNOWLEDGE_EVIDENCE_DATA_PART ||
      (type === "data" && Reflect.get(part, "name") === "knowledgeEvidence");
    if (!isEvidencePart) continue;
    const parsed = knowledgeEvidenceDataSchema.safeParse(Reflect.get(part, "data"));
    if (!parsed.success) throw new Error("knowledge_evidence_schema_invalid");
    for (const item of parsed.data.evidence) {
      const existing = byEvidenceId.get(item.evidenceId);
      const tokenOwner = evidenceIdByToken.get(item.citationToken);
      const numberOwner = evidenceIdByNumber.get(item.citationNumber);
      if (
        (existing && !sameEvidenceIdentity(existing, item)) ||
        (tokenOwner && tokenOwner !== item.evidenceId) ||
        (numberOwner && numberOwner !== item.evidenceId)
      ) {
        throw new Error("knowledge_evidence_conflict");
      }
      if (!existing) byEvidenceId.set(item.evidenceId, item);
      evidenceIdByToken.set(item.citationToken, item.evidenceId);
      evidenceIdByNumber.set(item.citationNumber, item.evidenceId);
    }
  }
  const evidence = [...byEvidenceId.values()].sort(
    (left, right) => left.citationNumber - right.citationNumber,
  );
  if (evidence.some((item, index) => item.citationNumber !== index + 1)) {
    throw new Error("knowledge_evidence_sequence_invalid");
  }
  return evidence;
}

export function knowledgeEvidenceData(
  evidence: readonly Omit<KnowledgeCitationEvidence, "citationNumber">[],
  startCitationNumber = 1,
): z.infer<typeof knowledgeEvidenceDataSchema> {
  return knowledgeEvidenceDataSchema.parse({
    schemaVersion: 2,
    evidence: evidence.map((item, index) => ({
      ...item,
      citationNumber: startCitationNumber + index,
    })),
  });
}

export function numberedKnowledgeEvidenceData(
  evidence: readonly KnowledgeCitationEvidence[],
  renderableVisualEvidenceIds: readonly string[] = [],
): z.infer<typeof knowledgeEvidenceDataSchema> {
  return knowledgeEvidenceDataSchema.parse({
    schemaVersion: 2,
    evidence,
    ...(renderableVisualEvidenceIds.length > 0 ? { renderableVisualEvidenceIds } : {}),
  });
}

export function extractRenderableKnowledgeVisualEvidenceIds(parts: readonly unknown[]) {
  const evidenceIds = new Set<string>();
  for (const part of parts) {
    if (typeof part !== "object" || part === null) continue;
    const type = Reflect.get(part, "type");
    const isEvidencePart =
      type === KNOWLEDGE_EVIDENCE_DATA_PART ||
      (type === "data" && Reflect.get(part, "name") === "knowledgeEvidence");
    if (!isEvidencePart) continue;
    const parsed = knowledgeEvidenceDataSchema.safeParse(Reflect.get(part, "data"));
    if (!parsed.success) throw new Error("knowledge_evidence_schema_invalid");
    for (const evidenceId of parsed.data.renderableVisualEvidenceIds ?? []) {
      evidenceIds.add(evidenceId);
    }
  }
  return evidenceIds;
}

export function knowledgeEvidenceMarkdownLink(evidence: KnowledgeCitationEvidence) {
  return `[${evidence.citationNumber}](${knowledgeEvidenceHref(evidence.citationToken)})`;
}

export function referencedKnowledgeCitationTokens(parts: readonly unknown[]) {
  const referenced = new Set<string>();
  const pattern = /\]\(#knowledge-evidence-(ke-[a-z0-9]{16})\)/gi;
  for (const part of parts) {
    if (typeof part !== "object" || part === null || Reflect.get(part, "type") !== "text") continue;
    const text = Reflect.get(part, "text");
    if (typeof text !== "string") continue;
    for (const match of text.matchAll(pattern)) {
      const citationToken = match[1]?.toLowerCase();
      if (citationToken) referenced.add(citationToken);
    }
  }
  return referenced;
}
