import { z } from "zod";

const workspaceConversationSummarySchema = z
  .object({
    conversationId: z.string().uuid(),
    title: z.string().max(200).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const workspaceConversationPageSchema = z
  .object({
    items: z.array(workspaceConversationSummarySchema),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();

export const workspaceMessagePageEnvelopeSchema = z
  .object({
    items: z.array(z.unknown()),
    nextCursor: z.string().min(1).nullable(),
  })
  .strict();
