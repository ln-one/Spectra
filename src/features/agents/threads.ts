import "server-only";

import { generateText, type LanguageModel, Output } from "ai";
import type { Pool } from "pg";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import type { Workspace } from "@/features/workspaces/types";
import { createThreadTitleModel, threadTitleProfile } from "./config";
import { findAiConversation, setAiConversationTitle } from "./conversation-records";
import { withWorkspaceThreadLock, workspaceThreadLockPool } from "./thread-coordination";
import type { ThreadTitleUpdate } from "./thread-events";
import { conversationThreadId } from "./thread-id";

const workspaceThreadTitleSchema = z
  .string()
  .trim()
  .min(1)
  .max(60)
  .refine((title) => !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(title));

const generatedThreadTitleSchema = workspaceThreadTitleSchema.refine(
  (title) => !/(?:\*\*|__|~~|`|!\[|\[[^\]]+\]\(|^#{1,6}\s|^[-*>]\s)/u.test(title),
);

export async function renameWorkspaceThread(
  workspace: Workspace,
  conversationId: string,
  rawTitle: string,
  createdByPrincipalId: string,
  lockPool: Pool = workspaceThreadLockPool,
  db: Database = database,
) {
  const title = workspaceThreadTitleSchema.parse(rawTitle);
  const threadId = conversationThreadId(workspace.id, conversationId);
  return withWorkspaceThreadLock(lockPool, threadId, async () => {
    const conversation = await setAiConversationTitle(
      { conversationId, createdByPrincipalId, title, workspaceId: workspace.id },
      db,
    );
    if (!conversation) return null;
    return { conversationId, title };
  });
}

export async function generateThreadTitle({
  abortSignal,
  conversationId,
  createdByPrincipalId,
  firstUserMessage,
  model = createThreadTitleModel(),
  lockPool = workspaceThreadLockPool,
  workspace,
  onUsage,
  db = database,
}: {
  abortSignal?: AbortSignal;
  conversationId: string;
  createdByPrincipalId: string;
  firstUserMessage: string;
  lockPool?: Pool;
  model?: LanguageModel;
  onUsage?:
    | ((usage: {
        finishReason: string;
        inputTokens: number | undefined;
        outputTokens: number | undefined;
        totalTokens: number | undefined;
      }) => Promise<void>)
    | undefined;
  db?: Database;
  workspace: Workspace;
}): Promise<ThreadTitleUpdate | null> {
  const threadId = conversationThreadId(workspace.id, conversationId);
  const current = await findAiConversation(
    { conversationId, createdByPrincipalId, workspaceId: workspace.id },
    db,
  );
  if (!current || current.title?.trim()) return null;

  const result = await generateText({
    ...(abortSignal ? { abortSignal } : {}),
    maxOutputTokens: threadTitleProfile.maxOutputTokens,
    maxRetries: 0,
    model,
    output: Output.object({
      schema: z.object({ title: generatedThreadTitleSchema }).strict(),
    }),
    prompt: [
      "Create a concise conversation title in the same language as the user's message.",
      "Return only a JSON object with one field named title. Use plain text without Markdown.",
      "User message:",
      firstUserMessage.slice(0, threadTitleProfile.inputCharacterLimit),
    ].join("\n"),
    temperature: threadTitleProfile.temperature,
  });
  await onUsage?.({
    finishReason: result.finishReason,
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    totalTokens: result.usage.totalTokens,
  });
  const title = generatedThreadTitleSchema.parse(result.output.title);

  return withWorkspaceThreadLock(lockPool, threadId, async () => {
    const latest = await findAiConversation(
      { conversationId, createdByPrincipalId, workspaceId: workspace.id },
      db,
    );
    if (!latest || latest.title?.trim()) return null;
    const updated = await setAiConversationTitle(
      { conversationId, createdByPrincipalId, title, workspaceId: workspace.id },
      db,
    );
    if (!updated) return null;
    return { conversationId, title };
  });
}
