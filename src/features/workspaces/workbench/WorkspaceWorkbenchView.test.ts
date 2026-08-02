import { expect, test } from "vitest";
import { mergeGeneratedThreadTitle } from "./WorkspaceWorkbenchView";

const conversationId = "00000000-0000-4000-8000-000000000001";
const updatedAt = "2026-07-16T00:00:00.000Z";

test("adds a generated title to a new conversation", () => {
  expect(
    mergeGeneratedThreadTitle([], conversationId, {
      conversationId,
      title: "TCP/IP 协议讲解",
      updatedAt,
    }),
  ).toEqual([{ conversationId, title: "TCP/IP 协议讲解", updatedAt }]);
});

test("never replaces a title returned by the server", () => {
  const conversations = [{ conversationId, title: "用户标题", updatedAt }];

  expect(
    mergeGeneratedThreadTitle(conversations, conversationId, {
      conversationId,
      title: "迟到的自动标题",
      updatedAt,
    }),
  ).toBe(conversations);
});
