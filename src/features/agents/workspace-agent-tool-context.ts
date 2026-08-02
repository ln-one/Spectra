import { z } from "zod";
import { previousArtifactCreationPlanSchema } from "./artifact-create-tool-contract";
import { resolvedAgentSurfaceContextSchema } from "./surface-context";

export const workspaceAgentToolContextSchema = z
  .object({
    actor: z
      .object({
        handle: z.string().min(1),
        principalId: z.string().min(1),
      })
      .strict(),
    conversationId: z.string().uuid(),
    forceWebSearch: z.boolean(),
    forceWorkspaceRetrieval: z.boolean(),
    latestUserMessage: z.string().trim().min(1).max(20_000),
    intent: z.enum(["chat", "plan"]),
    locale: z.enum(["zh-CN", "en-US"]),
    previousArtifactCreationPlan: previousArtifactCreationPlanSchema.optional(),
    rootRunId: z.string().uuid(),
    sourceUserMessageId: z.string().min(1).max(128),
    surface: resolvedAgentSurfaceContextSchema,
    workspaceId: z.string().uuid(),
  })
  // Mastra adds framework-owned values such as `MastraMemory` at runtime.
  // Strip those values while keeping every application scope field required.
  .strip();

export type WorkspaceAgentToolContext = z.infer<typeof workspaceAgentToolContextSchema>;
