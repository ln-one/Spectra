import "server-only";

import { and, desc, eq, isNull, lt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { type Database, database } from "@/database/client";
import { aiConversations } from "@/database/schema";
import { decodeOpaqueCursor, encodeOpaqueCursor } from "./opaque-cursor";

export type AiConversationCursor = { id: string; updatedAt: Date };

const aiConversationCursorSchema = z
  .object({ id: z.string().uuid(), updatedAt: z.string().datetime({ offset: true }) })
  .strict();

export function encodeAiConversationCursor(cursor: AiConversationCursor) {
  return encodeOpaqueCursor({ id: cursor.id, updatedAt: cursor.updatedAt.toISOString() });
}

export function decodeAiConversationCursor(value: string) {
  return decodeOpaqueCursor(value, (candidate) => {
    const parsed = aiConversationCursorSchema.safeParse(candidate);
    if (!parsed.success) return null;
    return { id: parsed.data.id, updatedAt: new Date(parsed.data.updatedAt) };
  });
}

export async function listAiConversations(
  input: {
    createdByPrincipalId: string;
    cursor?: AiConversationCursor;
    limit?: number;
    workspaceId: string;
  },
  db: Database = database,
) {
  const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);
  const updatedAtMillisecond = sql<Date>`date_trunc('milliseconds', ${aiConversations.updatedAt})`;
  const cursorCondition = input.cursor
    ? or(
        lt(updatedAtMillisecond, input.cursor.updatedAt),
        and(
          eq(updatedAtMillisecond, input.cursor.updatedAt),
          lt(aiConversations.id, input.cursor.id),
        ),
      )
    : undefined;
  const rows = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        isNull(aiConversations.deletedAt),
        cursorCondition,
      ),
    )
    .orderBy(desc(updatedAtMillisecond), desc(aiConversations.id))
    .limit(limit + 1);
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit);
  const last = items.at(-1);
  return {
    items,
    nextCursor: hasMore && last ? { id: last.id, updatedAt: last.updatedAt.toISOString() } : null,
  };
}

export async function findAiConversation(
  input: { conversationId: string; createdByPrincipalId: string; workspaceId: string },
  db: Database = database,
) {
  const [conversation] = await db
    .select()
    .from(aiConversations)
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .limit(1);
  return conversation ?? null;
}

export async function ensureAiConversation(
  input: { conversationId: string; createdByPrincipalId: string; workspaceId: string },
  db: Database = database,
) {
  await db
    .insert(aiConversations)
    .values({
      conversationId: input.conversationId,
      createdByPrincipalId: input.createdByPrincipalId,
      workspaceId: input.workspaceId,
    })
    .onConflictDoNothing({
      target: [aiConversations.workspaceId, aiConversations.conversationId],
    });
  return findAiConversation(input, db);
}

export async function setAiConversationActiveStream(
  input: {
    conversationId: string;
    createdByPrincipalId: string;
    streamId: string | null;
    workspaceId: string;
  },
  db: Database = database,
) {
  const [conversation] = await db
    .update(aiConversations)
    .set({ activeStreamId: input.streamId, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        input.streamId
          ? or(
              isNull(aiConversations.activeStreamId),
              eq(aiConversations.activeStreamId, input.streamId),
            )
          : isNull(aiConversations.activeStreamId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning();
  return conversation ?? null;
}

export async function clearAiConversationActiveStream(
  input: {
    conversationId: string;
    createdByPrincipalId: string;
    streamId: string;
    workspaceId: string;
  },
  db: Database = database,
) {
  const [conversation] = await db
    .update(aiConversations)
    .set({ activeStreamId: null, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        eq(aiConversations.activeStreamId, input.streamId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning();
  return conversation ?? null;
}

export async function setAiConversationTitle(
  input: {
    conversationId: string;
    createdByPrincipalId: string;
    title: string;
    workspaceId: string;
  },
  db: Database = database,
) {
  const [conversation] = await db
    .update(aiConversations)
    .set({ title: input.title, updatedAt: new Date() })
    .where(
      and(
        eq(aiConversations.workspaceId, input.workspaceId),
        eq(aiConversations.conversationId, input.conversationId),
        eq(aiConversations.createdByPrincipalId, input.createdByPrincipalId),
        isNull(aiConversations.deletedAt),
      ),
    )
    .returning();
  return conversation ?? null;
}
