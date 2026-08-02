import "server-only";

import { z } from "zod";
import { artifactDetailSchema } from "@/features/artifacts/contract";
import { artifactGroundingBundleSchema } from "@/features/artifacts/grounding";
import { artifactKindSchema } from "@/features/artifacts/types";
import { artifactPlanResultSchema } from "./artifact-plan-contract";

const artifactPlanWorkflowItemSchema = z
  .object({
    grounding: artifactGroundingBundleSchema,
    kind: artifactKindSchema,
    planItemId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(20_000),
    title: z.string().trim().min(1).max(200),
  })
  .strict();

export const artifactPlanWorkflowInputSchema = z
  .object({
    actor: z
      .object({
        handle: z.string().min(1),
        principalId: z.string().min(1),
      })
      .strict(),
    conversationId: z.string().uuid(),
    items: z.array(artifactPlanWorkflowItemSchema).min(1),
    locale: z.enum(["zh-CN", "en-US"]),
    rootRunId: z.string().uuid(),
    sourceUserMessageId: z.string().min(1).max(128),
    workspaceId: z.string().uuid(),
    workflowId: z.string().uuid(),
  })
  .strict();

export const artifactPlanEventSchema = z.discriminatedUnion("type", [
  z
    .object({
      index: z.number().int().min(0),
      kind: artifactKindSchema,
      planItemId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      type: z.literal("item-running"),
      workflowId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      artifact: artifactDetailSchema,
      index: z.number().int().min(0),
      planItemId: z.string().uuid(),
      type: z.literal("item-started"),
      workflowId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      errorCode: z.string().trim().min(1).max(100),
      index: z.number().int().min(0),
      kind: artifactKindSchema,
      planItemId: z.string().uuid(),
      title: z.string().trim().min(1).max(200),
      type: z.literal("item-failed"),
      workflowId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      type: z.literal("completed"),
      workflowId: z.string().uuid(),
    })
    .strict(),
]);

export const artifactPlanWorkflowResultSchema = z
  .object({
    results: z.array(artifactPlanResultSchema).min(1),
    workflowId: z.string().uuid(),
  })
  .strict();

export type ArtifactPlanWorkflowInput = z.infer<typeof artifactPlanWorkflowInputSchema>;
export type ArtifactPlanEvent = z.infer<typeof artifactPlanEventSchema>;
