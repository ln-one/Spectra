import { z } from "zod";
import type { DatabaseTransaction } from "@/database/client";

export const structuredGenerationJobSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationAttemptId: z.string().uuid(),
    conversationId: z.string().uuid(),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
    workspaceId: z.string().uuid(),
  })
  .strict();

export interface StructuredGenerationQueue {
  enqueue(
    transaction: DatabaseTransaction,
    job: z.infer<typeof structuredGenerationJobSchema>,
  ): Promise<void>;
}
