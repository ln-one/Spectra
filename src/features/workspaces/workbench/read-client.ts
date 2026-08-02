"use client";

import { safeValidateUIMessages, type UIMessage } from "ai";
import {
  workspaceConversationPageSchema,
  workspaceMessagePageEnvelopeSchema,
} from "./read-contract";

async function readJson(response: Response) {
  if (!response.ok) throw new Error("workspace_read_unavailable");
  return response.json() as Promise<unknown>;
}

export async function fetchWorkspaceConversationPage(workspaceId: string, after: string | null) {
  const query = after ? `?after=${encodeURIComponent(after)}` : "";
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations${query}`,
    { cache: "no-store" },
  );
  const parsed = workspaceConversationPageSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new Error("workspace_conversation_page_invalid");
  return parsed.data;
}

export async function fetchWorkspaceMessagePage(
  workspaceId: string,
  conversationId: string,
  before: string | null,
): Promise<{ items: UIMessage[]; nextCursor: string | null }> {
  const query = before ? `?before=${encodeURIComponent(before)}` : "";
  const response = await fetch(
    `/api/workspaces/${encodeURIComponent(workspaceId)}/conversations/${encodeURIComponent(conversationId)}/messages${query}`,
    { cache: "no-store" },
  );
  const parsed = workspaceMessagePageEnvelopeSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new Error("workspace_message_page_invalid");
  const messages = await safeValidateUIMessages({ messages: parsed.data.items });
  if (!messages.success) throw new Error("workspace_message_page_invalid");
  return { items: messages.data, nextCursor: parsed.data.nextCursor };
}
