import { z } from "zod";
import type { DatabaseTransaction } from "@/database/client";

export const mindMapGenerationJobSchema = z
  .object({
    artifactId: z.string().uuid(),
    generationAttemptId: z.string().uuid(),
    conversationId: z.string().uuid(),
    locale: z.enum(["zh-CN", "en-US"]),
    prompt: z.string().trim().min(1).max(20_000),
    workspaceId: z.string().uuid(),
  })
  .strict();

type MindMapGenerationJob = z.infer<typeof mindMapGenerationJobSchema>;

export interface MindMapGenerationQueue {
  enqueue(transaction: DatabaseTransaction, job: MindMapGenerationJob): Promise<void>;
}
