import "server-only";

import { safeValidateUIMessages, type UIMessage } from "ai";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";
import { type Database, type DatabaseTransaction, database } from "@/database/client";
import { aiConversations, aiMessages } from "@/database/schema";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "./opaque-cursor";

const AI_MESSAGE_PAGE_LIMIT = 50;
export const AI_MESSAGE_PAGE_MAX_BYTES = 512 * 1024;

const aiMessageCursorSchema = z.object({ position: z.number().int().nonnegative() }).strict();

export function encodeAiMessageCursor(position: number) {
  return encodeOpaqueCursor({ position });
}

export function decodeAiMessageCursor(value: string) {
  return decodeOpaqueCursor(value, (candidate) => {
    const parsed = aiMessageCursorSchema.safeParse(candidate);
    return parsed.success ? parsed.data.position : null;
  });
}

export class AiMessageSnapshotError extends Error {
  constructor(message = "agent_message_snapshot_invalid") {
    super(message);
    this.name = "AiMessageSnapshotError";
  }
}

function storedContent(message: UIMessage) {
  const { id: _, ...content } = message;
  return content;
}

async function validateMessageSnapshot(messages: unknown): Promise<UIMessage[]> {
  if (Array.isArray(messages) && messages.length === 0) return [];
  const validated = await safeValidateUIMessages({ messages });
  if (!validated.success) throw new AiMessageSnapshotError();
  return validated.data;
}

function messageFromRow(row: { content: unknown; id: string }) {
  if (!row.content || typeof row.content !== "object" || Array.isArray(row.content)) {
    return row.content;
  }
  return { id: row.id, ...row.content };
}

async function lockConversation(
  input: { conversationId: string; workspaceId: string },
  db: DatabaseTransaction,
) {
  const [conversation] = await db
    .select({ id: aiConversations.id })
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
      ),
    )
    .limit(1)
    .for("update");
  if (!conversation) throw new AiMessageSnapshotError();
}

export async function loadAiMessageSnapshot(
  input: { conversationId: string; workspaceId: string },
  db: Database = database,
): Promise<UIMessage[]> {
  const rows = await db
    .select({
      content: aiMessages.content,
      id: aiMessages.id,
    })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.workspaceId, input.workspaceId),
        eq(aiMessages.conversationId, input.conversationId),
      ),
    )
    .orderBy(asc(aiMessages.position));
  const messages = rows.map(messageFromRow);
  return validateMessageSnapshot(messages);
}

export async function loadAiMessagePage(
  input: {
    beforePosition?: number;
    conversationId: string;
    workspaceId: string;
  },
  db: Database = database,
): Promise<{ items: UIMessage[]; nextCursor: string | null }> {
  const rows = await db
    .select({
      content: aiMessages.content,
      id: aiMessages.id,
      position: aiMessages.position,
    })
    .from(aiMessages)
    .where(
      and(
        eq(aiMessages.workspaceId, input.workspaceId),
        eq(aiMessages.conversationId, input.conversationId),
        input.beforePosition === undefined
          ? undefined
          : lt(aiMessages.position, input.beforePosition),
      ),
    )
    .orderBy(desc(aiMessages.position))
    .limit(AI_MESSAGE_PAGE_LIMIT + 1);

  const candidates = rows.map((row) => ({
    message: messageFromRow(row),
    position: row.position,
  }));
  const selected: typeof candidates = [];
  for (const candidate of candidates) {
    if (selected.length >= AI_MESSAGE_PAGE_LIMIT) break;
    const next = [...selected, candidate.message];
    const nextBytes = Buffer.byteLength(JSON.stringify(next), "utf8");
    if (selected.length > 0 && nextBytes > AI_MESSAGE_PAGE_MAX_BYTES) break;
    selected.push(candidate);
  }

  const messages = await validateMessageSnapshot(selected.map((candidate) => candidate.message));
  const oldest = selected.at(-1);
  const hasMore = rows.length > selected.length;
  return {
    items: messages.reverse(),
    nextCursor: hasMore && oldest ? encodeAiMessageCursor(oldest.position) : null,
  };
}

export async function replaceAiMessageSnapshot(
  input: {
    conversationId: string;
    messages: readonly UIMessage[];
    workspaceId: string;
  },
  db: Database = database,
) {
  const messages = await validateMessageSnapshot(input.messages);
  await db.transaction(async (tx) => {
    await lockConversation(input, tx);
    await tx
      .delete(aiMessages)
      .where(
        and(
          eq(aiMessages.workspaceId, input.workspaceId),
          eq(aiMessages.conversationId, input.conversationId),
        ),
      );
    if (messages.length > 0) {
      await tx.insert(aiMessages).values(
        messages.map((message, position) => ({
          content: storedContent(message),
          conversationId: input.conversationId,
          id: message.id,
          position,
          workspaceId: input.workspaceId,
        })),
      );
    }
    await tx
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(aiConversations.workspaceId, input.workspaceId),
          eq(aiConversations.conversationId, input.conversationId),
        ),
      );
  });
}

export async function appendAssistantToMessageSnapshot(
  input: {
    conversationId: string;
    message: UIMessage;
    sourceUserMessageId: string;
    workspaceId: string;
  },
  db: Database = database,
) {
  const [message] = await validateMessageSnapshot([input.message]);
  if (!message) throw new AiMessageSnapshotError();
  return db.transaction(async (tx) => {
    await lockConversation(input, tx);
    const rows = await tx
      .select({ id: aiMessages.id, position: aiMessages.position })
      .from(aiMessages)
      .where(
        and(
          eq(aiMessages.workspaceId, input.workspaceId),
          eq(aiMessages.conversationId, input.conversationId),
        ),
      )
      .orderBy(asc(aiMessages.position));
    const head = rows.at(-1);
    if (head?.id === message.id) return true;
    if (head?.id !== input.sourceUserMessageId) return false;

    await tx.insert(aiMessages).values({
      content: storedContent(message),
      conversationId: input.conversationId,
      id: message.id,
      position: head.position + 1,
      workspaceId: input.workspaceId,
    });
    await tx
      .update(aiConversations)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(aiConversations.workspaceId, input.workspaceId),
          eq(aiConversations.conversationId, input.conversationId),
        ),
      );
    return true;
  });
}
