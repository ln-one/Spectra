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

const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);
const sourceNameSchema = z.string().trim().min(1).max(255);

const artifactGroundingEvidenceIdentitySchema = z
  .object({
    contentHash: hashSchema,
    evidenceId: z.string().uuid(),
    fidelity: evidenceFidelitySchema,
    locator: evidenceLocatorSchema,
    representationHash: hashSchema,
    sourceId: z.string().uuid(),
    sourceName: sourceNameSchema,
    sourcePresentation: sourcePresentationHintSchema.optional(),
    sourceRevision: z.int().positive(),
    workspaceOrigin: sourceWorkspaceOriginSchema.optional(),
  })
  .strict();

const artifactGroundingEvidenceSchema = artifactGroundingEvidenceIdentitySchema
  .extend({ content: evidenceContentSchema })
  .strict();

export const artifactGroundingBundleSchema = z
  .object({
    evidence: z.array(artifactGroundingEvidenceSchema).max(32),
    version: z.literal(1),
  })
  .strict();

export const artifactGroundingSourceSchema = z
  .object({
    sourceId: z.string().uuid(),
    sourceName: sourceNameSchema,
    sourcePresentation: sourcePresentationHintSchema.optional(),
    workspaceOrigin: sourceWorkspaceOriginSchema.optional(),
  })
  .strict();

export const artifactOperationGroundingReceiptSchema = z
  .object({
    operationEvidence: z.array(artifactGroundingEvidenceIdentitySchema).max(32),
    version: z.literal(1),
  })
  .strict();

const artifactGroundingReceiptSchema = artifactOperationGroundingReceiptSchema
  .extend({
    lineageSources: z.array(artifactGroundingSourceSchema),
  })
  .strict();

export type ArtifactGroundingEvidence = z.infer<typeof artifactGroundingEvidenceSchema>;
export type ArtifactGroundingBundle = z.infer<typeof artifactGroundingBundleSchema>;
export type ArtifactGroundingSource = z.infer<typeof artifactGroundingSourceSchema>;
export type ArtifactOperationGroundingReceipt = z.infer<
  typeof artifactOperationGroundingReceiptSchema
>;
export type ArtifactGroundingReceipt = z.infer<typeof artifactGroundingReceiptSchema>;

export function emptyArtifactGroundingBundle(): ArtifactGroundingBundle {
  return { evidence: [], version: 1 };
}

export function artifactGroundingEvidenceText(
  content: ArtifactGroundingEvidence["content"],
): string | null {
  if (content.kind === "exact_text" || content.kind === "timed_transcript") {
    return content.text;
  }
  if (content.kind === "visual_region") {
    return content.accessibleDescription?.trim() || null;
  }
  const rows = content.cells.map((cell) => {
    const displayed = cell.displayValue ?? cell.value;
    return cell.formula
      ? `${cell.address}: ${displayed} (formula: ${cell.formula})`
      : `${cell.address}: ${displayed}`;
  });
  return rows.join("\n");
}

function sameEvidence(left: ArtifactGroundingEvidence, right: ArtifactGroundingEvidence) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function packArtifactGroundingEvidence(
  candidates: readonly ArtifactGroundingEvidence[],
): ArtifactGroundingBundle {
  const evidence: ArtifactGroundingEvidence[] = [];
  const byId = new Map<string, ArtifactGroundingEvidence>();
  let codepoints = 0;
  for (const rawCandidate of candidates) {
    const candidate = artifactGroundingEvidenceSchema.parse(rawCandidate);
    const existing = byId.get(candidate.evidenceId);
    if (existing) {
      if (!sameEvidence(existing, candidate))
        throw new Error("artifact_grounding_evidence_conflict");
      continue;
    }
    if (evidence.length >= 32) continue;
    const text = artifactGroundingEvidenceText(candidate.content);
    if (!text) continue;
    const candidateCodepoints = [...text].length;
    if (codepoints + candidateCodepoints > 12_000) continue;
    evidence.push(candidate);
    byId.set(candidate.evidenceId, candidate);
    codepoints += candidateCodepoints;
  }
  return artifactGroundingBundleSchema.parse({ evidence, version: 1 });
}

function identityFromEvidence(evidence: ArtifactGroundingEvidence) {
  const { content: _content, ...identity } = evidence;
  return artifactGroundingEvidenceIdentitySchema.parse(identity);
}

export function operationGroundingReceiptFromBundle(
  bundle: ArtifactGroundingBundle,
): ArtifactOperationGroundingReceipt {
  const parsed = artifactGroundingBundleSchema.parse(bundle);
  return artifactOperationGroundingReceiptSchema.parse({
    operationEvidence: parsed.evidence.map(identityFromEvidence),
    version: 1,
  });
}

function stableSourceUnion(
  previous: readonly ArtifactGroundingSource[],
  operationEvidence: readonly z.infer<typeof artifactGroundingEvidenceIdentitySchema>[],
) {
  const sources = [...previous];
  const sourceIndex = new Map(sources.map((source, index) => [source.sourceId, index]));
  for (const evidence of operationEvidence) {
    const existingIndex = sourceIndex.get(evidence.sourceId);
    if (existingIndex !== undefined) {
      const existing = sources[existingIndex];
      if (
        existing &&
        ((!existing.sourcePresentation && evidence.sourcePresentation) ||
          (!existing.workspaceOrigin && evidence.workspaceOrigin))
      ) {
        sources[existingIndex] = {
          ...existing,
          ...(!existing.sourcePresentation && evidence.sourcePresentation
            ? { sourcePresentation: evidence.sourcePresentation }
            : {}),
          ...(!existing.workspaceOrigin && evidence.workspaceOrigin
            ? { workspaceOrigin: evidence.workspaceOrigin }
            : {}),
        };
      }
      continue;
    }
    sources.push({
      sourceId: evidence.sourceId,
      sourceName: evidence.sourceName,
      ...(evidence.sourcePresentation ? { sourcePresentation: evidence.sourcePresentation } : {}),
      ...(evidence.workspaceOrigin ? { workspaceOrigin: evidence.workspaceOrigin } : {}),
    });
    sourceIndex.set(evidence.sourceId, sources.length - 1);
  }
  return sources;
}

export function artifactGroundingReceiptForOperation(input: {
  operation: ArtifactOperationGroundingReceipt;
  parent?: ArtifactGroundingReceipt | null;
}): ArtifactGroundingReceipt {
  const operation = artifactOperationGroundingReceiptSchema.parse(input.operation);
  const parent = input.parent ? artifactGroundingReceiptSchema.parse(input.parent) : null;
  return artifactGroundingReceiptSchema.parse({
    lineageSources: stableSourceUnion(parent?.lineageSources ?? [], operation.operationEvidence),
    operationEvidence: operation.operationEvidence,
    version: 1,
  });
}

export function readArtifactGroundingReceipt(
  generationMetadata: unknown,
):
  | { status: "missing"; receipt: null }
  | { status: "invalid"; receipt: null }
  | { status: "valid"; receipt: ArtifactGroundingReceipt } {
  if (!generationMetadata || typeof generationMetadata !== "object") {
    return { receipt: null, status: "missing" };
  }
  if (!Object.hasOwn(generationMetadata, "groundingReceipt")) {
    return { receipt: null, status: "missing" };
  }
  const parsed = artifactGroundingReceiptSchema.safeParse(
    Reflect.get(generationMetadata, "groundingReceipt"),
  );
  return parsed.success
    ? { receipt: parsed.data, status: "valid" }
    : { receipt: null, status: "invalid" };
}

export function artifactGroundingSourcesFromMetadata(
  generationMetadata: unknown,
): ArtifactGroundingSource[] {
  const parsed = readArtifactGroundingReceipt(generationMetadata);
  return parsed.status === "valid" ? parsed.receipt.lineageSources : [];
}

export function generationMetadataWithArtifactGrounding(input: {
  generationMetadata?: unknown;
  receipt: ArtifactGroundingReceipt;
  requestIdentitySha256?: string;
}) {
  const base =
    input.generationMetadata &&
    typeof input.generationMetadata === "object" &&
    !Array.isArray(input.generationMetadata)
      ? input.generationMetadata
      : {};
  return {
    ...base,
    groundingReceipt: artifactGroundingReceiptSchema.parse(input.receipt),
    ...(input.requestIdentitySha256
      ? { requestIdentitySha256: hashSchema.parse(input.requestIdentitySha256) }
      : {}),
  };
}

export function artifactRequestIdentityFromMetadata(generationMetadata: unknown) {
  if (!generationMetadata || typeof generationMetadata !== "object") return null;
  const parsed = hashSchema.safeParse(Reflect.get(generationMetadata, "requestIdentitySha256"));
  return parsed.success ? parsed.data : null;
}
