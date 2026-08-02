import { createMigratedTestDatabase } from "@tests/database";
import type { UIMessage } from "ai";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { aiConversations, aiMessages } from "@/database/schema";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import {
  clearAiConversationActiveStream,
  ensureAiConversation,
  findAiConversation,
  setAiConversationActiveStream,
} from "./conversation-records";
import {
  AI_MESSAGE_PAGE_MAX_BYTES,
  AiMessageSnapshotError,
  appendAssistantToMessageSnapshot,
  decodeAiMessageCursor,
  loadAiMessagePage,
  loadAiMessageSnapshot,
  replaceAiMessageSnapshot,
} from "./message-records";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;
let firstWorkspaceId: string;
let secondWorkspaceId: string;
let firstPrincipalId: string;
const firstConversationId = "00000000-0000-4000-8000-000000000401";
const secondConversationId = "00000000-0000-4000-8000-000000000402";

const userMessage = (id: string, text: string): UIMessage => ({
  id,
  parts: [{ text, type: "text" }],
  role: "user",
});
const assistantMessage = (id: string, text: string): UIMessage => ({
  id,
  parts: [{ text, type: "text" }],
  role: "assistant",
});

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.ai_messages, public.ai_conversations, public.workspaces, public.principals CASCADE",
  );
  const firstActor = await ensurePrincipalForAuthUser(
    "message-alice",
    "message-alice",
    testDatabase.db,
  );
  const secondActor = await ensurePrincipalForAuthUser(
    "message-bob",
    "message-bob",
    testDatabase.db,
  );
  firstPrincipalId = firstActor.principalId;
  firstWorkspaceId = (await createWorkspace(firstActor, { name: "Message one" }, testDatabase.db))
    .id;
  secondWorkspaceId = (await createWorkspace(secondActor, { name: "Message two" }, testDatabase.db))
    .id;
  await ensureAiConversation(
    {
      conversationId: firstConversationId,
      createdByPrincipalId: firstActor.principalId,
      workspaceId: firstWorkspaceId,
    },
    testDatabase.db,
  );
  await ensureAiConversation(
    {
      conversationId: secondConversationId,
      createdByPrincipalId: secondActor.principalId,
      workspaceId: secondWorkspaceId,
    },
    testDatabase.db,
  );
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("AI SDK UIMessage snapshots", () => {
  it("loads a new conversation as an empty snapshot", async () => {
    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([]);
  });

  it("pages messages by position in chronological order without overlap", async () => {
    const messages = Array.from({ length: 51 }, (_, position) =>
      userMessage(`message:page:${position}`, `Message ${position}`),
    );
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages,
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    const firstPage = await loadAiMessagePage(
      { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
      testDatabase.db,
    );
    expect(firstPage.items.map((message) => message.id)).toEqual(
      messages.slice(1).map((message) => message.id),
    );
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.nextCursor).not.toBeNull();

    const nextPage = await loadAiMessagePage(
      {
        beforePosition: decodeAiMessageCursor(firstPage.nextCursor ?? "") ?? -1,
        conversationId: firstConversationId,
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );
    expect(nextPage.items.map((message) => message.id)).toEqual([messages[0]?.id]);
    expect(new Set([...firstPage.items, ...nextPage.items].map((message) => message.id)).size).toBe(
      51,
    );
    expect(nextPage.nextCursor).toBeNull();
  });

  it("enforces the JSON budget while returning one oversized message", async () => {
    const oversized = userMessage(
      "message:oversized",
      "x".repeat(AI_MESSAGE_PAGE_MAX_BYTES + 1024),
    );
    const older = userMessage("message:older", "Older message");
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [older, oversized],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    const firstPage = await loadAiMessagePage(
      { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
      testDatabase.db,
    );
    expect(firstPage.items.map((message) => message.id)).toEqual([oversized.id]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await loadAiMessagePage(
      {
        beforePosition: decodeAiMessageCursor(firstPage.nextCursor ?? "") ?? -1,
        conversationId: firstConversationId,
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );
    expect(secondPage.items.map((message) => message.id)).toEqual([older.id]);
    expect(secondPage.nextCursor).toBeNull();
  });

  it("rejects invalid messages before replacing a valid snapshot", async () => {
    const valid = userMessage("message:valid", "Keep this message");
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [valid],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    await expect(
      replaceAiMessageSnapshot(
        {
          conversationId: firstConversationId,
          messages: [{ id: "message:invalid", parts: [], role: "invalid" } as never],
          workspaceId: firstWorkspaceId,
        },
        testDatabase.db,
      ),
    ).rejects.toBeInstanceOf(AiMessageSnapshotError);
    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([valid]);
  });

  it("conditionally clears only the active stream owned by the conversation", async () => {
    const firstStreamId = "00000000-0000-4000-8000-000000000490";
    const replacementStreamId = "00000000-0000-4000-8000-000000000491";
    const scope = {
      conversationId: firstConversationId,
      createdByPrincipalId: firstPrincipalId,
      workspaceId: firstWorkspaceId,
    };

    await expect(
      setAiConversationActiveStream({ ...scope, streamId: replacementStreamId }, testDatabase.db),
    ).resolves.toMatchObject({ activeStreamId: replacementStreamId });
    await expect(
      setAiConversationActiveStream({ ...scope, streamId: firstStreamId }, testDatabase.db),
    ).resolves.toBeNull();
    await expect(findAiConversation(scope, testDatabase.db)).resolves.toMatchObject({
      activeStreamId: replacementStreamId,
    });
    await expect(
      clearAiConversationActiveStream({ ...scope, streamId: firstStreamId }, testDatabase.db),
    ).resolves.toBeNull();
    await expect(findAiConversation(scope, testDatabase.db)).resolves.toMatchObject({
      activeStreamId: replacementStreamId,
    });
    await expect(
      clearAiConversationActiveStream({ ...scope, streamId: replacementStreamId }, testDatabase.db),
    ).resolves.toMatchObject({ activeStreamId: null });
  });

  it("replaces and loads one ordered conversation snapshot", async () => {
    const first = [
      userMessage("message:user", "Explain the diagram"),
      assistantMessage("message:assistant", "The diagram shows a camshaft."),
    ];
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: first,
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    const edited = [userMessage("message:user-edited", "Explain only the camshaft")];
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: edited,
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual(edited);
  });

  it("appends the completed assistant only when its user message is still current", async () => {
    const user = userMessage("message:user", "Current question");
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [user],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );
    const assistant = assistantMessage("message:assistant", "Current answer");

    await expect(
      appendAssistantToMessageSnapshot(
        {
          conversationId: firstConversationId,
          message: assistant,
          sourceUserMessageId: user.id,
          workspaceId: firstWorkspaceId,
        },
        testDatabase.db,
      ),
    ).resolves.toBe(true);
    await expect(
      appendAssistantToMessageSnapshot(
        {
          conversationId: firstConversationId,
          message: assistant,
          sourceUserMessageId: user.id,
          workspaceId: firstWorkspaceId,
        },
        testDatabase.db,
      ),
    ).resolves.toBe(true);
    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([user, assistant]);
  });

  it("does not let a stale run overwrite a newer snapshot", async () => {
    const oldUser = userMessage("message:old-user", "Old question");
    const newUser = userMessage("message:new-user", "New question");
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [oldUser],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [oldUser, newUser],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    await expect(
      appendAssistantToMessageSnapshot(
        {
          conversationId: firstConversationId,
          message: assistantMessage("message:stale-assistant", "Stale answer"),
          sourceUserMessageId: oldUser.id,
          workspaceId: firstWorkspaceId,
        },
        testDatabase.db,
      ),
    ).resolves.toBe(false);
    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([oldUser, newUser]);
  });

  it("keeps snapshots isolated by workspace and conversation", async () => {
    const first = userMessage("message:first", "First");
    const second = userMessage("message:second", "Second");
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [first],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );
    await replaceAiMessageSnapshot(
      {
        conversationId: secondConversationId,
        messages: [second],
        workspaceId: secondWorkspaceId,
      },
      testDatabase.db,
    );

    await expect(
      loadAiMessageSnapshot(
        { conversationId: firstConversationId, workspaceId: firstWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([first]);
    await expect(
      loadAiMessageSnapshot(
        { conversationId: secondConversationId, workspaceId: secondWorkspaceId },
        testDatabase.db,
      ),
    ).resolves.toEqual([second]);
  });

  it("cascades the snapshot when the owning conversation is deleted", async () => {
    await replaceAiMessageSnapshot(
      {
        conversationId: firstConversationId,
        messages: [userMessage("message:cascade", "Temporary")],
        workspaceId: firstWorkspaceId,
      },
      testDatabase.db,
    );

    await testDatabase.db
      .delete(aiConversations)
      .where(eq(aiConversations.conversationId, firstConversationId));

    expect(
      await testDatabase.db.select().from(aiMessages).where(eq(aiMessages.id, "message:cascade")),
    ).toEqual([]);
  });
});
