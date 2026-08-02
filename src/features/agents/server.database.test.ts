import type { LanguageModelV3GenerateResult, LanguageModelV3Usage } from "@ai-sdk/provider";
import { createMigratedTestDatabase } from "@tests/database";
import { MockLanguageModelV3 } from "ai/test";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ensurePrincipalForAuthUser } from "@/features/identity/service";
import { createWorkspace } from "@/features/workspaces/service";
import { decodeAiConversationCursor, ensureAiConversation } from "./conversation-records";
import {
  KNOWLEDGE_AGENT_INSTRUCTIONS,
  listWorkspaceConversationPage,
  loadWorkspaceConversationPage,
  loadWorkspaceConversationState,
  SPECTRA_AGENT_INSTRUCTIONS,
} from "./server";
import { generateThreadTitle } from "./threads";

let testDatabase: Awaited<ReturnType<typeof createMigratedTestDatabase>>;

const usage: LanguageModelV3Usage = {
  inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
  outputTokens: { reasoning: 0, text: 1, total: 1 },
};

function generatedTitle(title: string): LanguageModelV3GenerateResult {
  return {
    content: [{ text: JSON.stringify({ title }), type: "text" }],
    finishReason: { raw: "stop", unified: "stop" },
    usage,
    warnings: [],
  };
}

beforeAll(async () => {
  testDatabase = await createMigratedTestDatabase();
});

beforeEach(async () => {
  await testDatabase.pool.query(
    "TRUNCATE TABLE public.ai_messages, public.ai_run_attempts, public.ai_runs, public.ai_conversations, public.workspaces, public.principals CASCADE",
  );
});

afterAll(async () => {
  await testDatabase.destroy();
});

describe("stateless workspace agent conversation metadata", () => {
  it("pages navigation deterministically and prepends a selected older conversation once", async () => {
    const actor = await ensurePrincipalForAuthUser("page-alice", "page-alice", testDatabase.db);
    const workspace = await createWorkspace(
      actor,
      { name: "Paged conversations" },
      testDatabase.db,
    );
    const conversationIds = Array.from(
      { length: 51 },
      (_, index) => `20000000-0000-4000-8000-${String(index + 200).padStart(12, "0")}`,
    );
    for (const conversationId of conversationIds) {
      await ensureAiConversation(
        { conversationId, createdByPrincipalId: actor.principalId, workspaceId: workspace.id },
        testDatabase.db,
      );
    }

    const firstPage = await listWorkspaceConversationPage(
      { actor, workspaceId: workspace.id },
      testDatabase.db,
    );
    expect(firstPage.items).toHaveLength(50);
    expect(firstPage.nextCursor).not.toBeNull();
    const selectedConversationId = conversationIds.find(
      (conversationId) => !firstPage.items.some((item) => item.conversationId === conversationId),
    );
    if (!selectedConversationId) throw new Error("Expected one conversation outside first page");

    const selectedPage = await loadWorkspaceConversationPage(
      {
        actor,
        emptyConversationId: "20000000-0000-4000-8000-000000000299",
        requestedConversationId: selectedConversationId,
        workspace,
      },
      testDatabase.db,
    );
    expect(selectedPage.conversationId).toBe(selectedConversationId);
    expect(selectedPage.items[0]?.conversationId).toBe(selectedConversationId);
    expect(new Set(selectedPage.items.map((item) => item.conversationId)).size).toBe(51);

    if (!firstPage.nextCursor) throw new Error("Expected a conversation cursor");
    const cursor = decodeAiConversationCursor(firstPage.nextCursor);
    if (!cursor) throw new Error("Expected a decodable conversation cursor");
    const nextPage = await listWorkspaceConversationPage(
      { actor, cursor, workspaceId: workspace.id },
      testDatabase.db,
    );
    expect(nextPage.items).toHaveLength(1);
    expect(nextPage.items[0]?.conversationId).toBe(selectedConversationId);
    expect(
      nextPage.items.some((item) =>
        firstPage.items.some((first) => first.conversationId === item.conversationId),
      ),
    ).toBe(false);
  });

  it("loads thread navigation without loading legacy chat history or run UI state", async () => {
    const actor = await ensurePrincipalForAuthUser("server-alice", "server-alice", testDatabase.db);
    const workspace = await createWorkspace(actor, { name: "Server" }, testDatabase.db);
    const conversationId = "20000000-0000-4000-8000-000000000101";
    await ensureAiConversation(
      { conversationId, createdByPrincipalId: actor.principalId, workspaceId: workspace.id },
      testDatabase.db,
    );

    const state = await loadWorkspaceConversationState(
      workspace,
      conversationId,
      "20000000-0000-4000-8000-000000000102",
      actor,
      testDatabase.db,
    );
    expect(state).toEqual({
      conversationId,
      conversations: [
        expect.objectContaining({
          conversationId,
          title: null,
        }),
      ],
    });
    expect(state).not.toHaveProperty("messages");
    expect(state).not.toHaveProperty("activeRunId");
    expect(state).not.toHaveProperty("runFailureCode");
  });

  it("persists generated titles in ai_conversations rather than Mastra Memory", async () => {
    const actor = await ensurePrincipalForAuthUser("title-alice", "title-alice", testDatabase.db);
    const workspace = await createWorkspace(actor, { name: "Titles" }, testDatabase.db);
    const conversationId = "20000000-0000-4000-8000-000000000103";
    await ensureAiConversation(
      { conversationId, createdByPrincipalId: actor.principalId, workspaceId: workspace.id },
      testDatabase.db,
    );

    const update = await generateThreadTitle({
      conversationId,
      createdByPrincipalId: actor.principalId,
      firstUserMessage: "Explain the camshaft",
      model: new MockLanguageModelV3({
        doGenerate: async () => generatedTitle("Camshaft basics"),
      }),
      workspace,
      db: testDatabase.db,
    });
    expect(update).toEqual({ conversationId, title: "Camshaft basics" });
    const state = await loadWorkspaceConversationState(
      workspace,
      conversationId,
      crypto.randomUUID(),
      actor,
      testDatabase.db,
    );
    expect(state.conversations[0]?.title).toBe("Camshaft basics");
  });

  it("keeps the stateless and evidence instructions explicit", () => {
    expect(SPECTRA_AGENT_INSTRUCTIONS).toContain("Never emit Markdown image");
    expect(KNOWLEDGE_AGENT_INSTRUCTIONS).toContain("Workspace Evidence");
  });
});
