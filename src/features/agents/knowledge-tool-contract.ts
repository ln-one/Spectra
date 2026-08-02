import { z } from "zod";
import {
  evidenceContentSchema,
  evidenceFidelitySchema,
  evidenceLocatorSchema,
} from "@/features/knowledge/schemas";
import { sourcePresentationHintSchema } from "@/features/sources/presentation";
import { artifactGroundingRefSchema } from "./artifact-tool-protocol";
import { knowledgeWorkspaceOriginSchema } from "./knowledge-citation-contract";

export const KNOWLEDGE_AGENT_TOOL_IDS = {
  searchWorkspace: "search_workspace",
} as const;

const plannedQuerySchema = z.string().trim().min(1).max(20_000);
const knowledgeSearchPurposeSchema = z.enum(["initial", "broaden", "narrow", "verify"]);

export const searchWorkspaceToolInputSchema = z
  .object({
    purpose: knowledgeSearchPurposeSchema.describe(
      "Why this search is needed: initial coverage, broader recall, narrower disambiguation, or verification.",
    ),
    intentQuery: plannedQuerySchema.describe(
      "The user's underlying information need, resolved from the conversation.",
    ),
    denseQuery: plannedQuerySchema.describe(
      "A faithful natural-language semantic retrieval query.",
    ),
    sparseQuery: plannedQuerySchema.describe(
      "A concise lexical query preserving exact names, identifiers, terms, dates, and useful synonyms.",
    ),
    rerankQuery: plannedQuerySchema.describe(
      "A self-contained question used to judge which retrieved passages answer the user.",
    ),
  })
  .strict();

export const searchWorkspaceToolOutputSchema = z
  .object({
    status: z.enum(["ok", "degraded", "unavailable", "stopped"]),
    degradedReasons: z.array(z.literal("rerank_failed")),
    candidateCount: z.int().nonnegative(),
    packedCapacityUnits: z.int().nonnegative(),
    modelVisualEvidenceIds: z.array(z.string().uuid()).max(3),
    control: z
      .object({
        round: z.int().min(1).max(4),
        remainingSearches: z.int().min(0).max(3),
        cacheHit: z.boolean(),
        newEvidenceCount: z.int().min(0).max(8),
        stopRecommended: z.boolean(),
        stopReason: z
          .enum(["budget_exhausted", "cache_hit", "no_new_evidence", "unavailable"])
          .nullable(),
      })
      .strict(),
    evidence: z
      .array(
        z
          .object({
            citationNumber: z.int().positive(),
            citationToken: z.string().regex(/^ke-[a-z0-9]{16}$/),
            groundingRef: artifactGroundingRefSchema,
            evidenceId: z.string().uuid(),
            sourceId: z.string().uuid(),
            sourceName: z.string().trim().min(1).max(255),
            sourcePresentation: sourcePresentationHintSchema.optional(),
            workspaceOrigin: knowledgeWorkspaceOriginSchema,
            sourceRevision: z.int().positive(),
            representationHash: z.string().regex(/^[a-f0-9]{64}$/),
            exactExcerpt: z.string().min(1).nullable(),
            locator: evidenceLocatorSchema,
            content: evidenceContentSchema,
            fidelity: evidenceFidelitySchema,
            contentHash: z.string().regex(/^[a-f0-9]{64}$/),
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
          }),
      )
      .max(8),
  })
  .strict()
  .superRefine((output, context) => {
    if (
      (output.status === "unavailable" || output.status === "stopped") &&
      (output.evidence.length > 0 ||
        output.modelVisualEvidenceIds.length > 0 ||
        output.candidateCount !== 0 ||
        output.packedCapacityUnits !== 0 ||
        output.degradedReasons.length > 0)
    ) {
      context.addIssue({
        code: "custom",
        message: "Unavailable Knowledge Search output must not contain evidence",
      });
    }
    if (
      new Set(output.modelVisualEvidenceIds).size !== output.modelVisualEvidenceIds.length ||
      output.modelVisualEvidenceIds.some(
        (id) => !output.evidence.some((evidence) => evidence.evidenceId === id),
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Visual Evidence selections must be unique members of this output",
        path: ["modelVisualEvidenceIds"],
      });
    }
    if (output.control.newEvidenceCount !== output.evidence.length) {
      context.addIssue({
        code: "custom",
        message: "Knowledge Search control must report the published Evidence delta",
        path: ["control", "newEvidenceCount"],
      });
    }
  });

export type SearchWorkspaceToolOutput = z.infer<typeof searchWorkspaceToolOutputSchema>;
