"use client";

import { type ThreadMessageLike, useAui, useAuiState } from "@assistant-ui/react";
import { QueryClientContext, useInfiniteQuery } from "@tanstack/react-query";
import { getToolName, isToolUIPart, type UIMessage } from "ai";
import type { ReadonlyJSONObject } from "assistant-stream/utils";
import { LoaderCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useContext, useEffect, useMemo, useRef } from "react";
import { fetchWorkspaceMessagePage } from "./read-client";

type ThreadMessageContent = Exclude<ThreadMessageLike["content"], string>;
type ThreadMessageContentItem = ThreadMessageContent[number];

function jsonObject(value: unknown): ReadonlyJSONObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as ReadonlyJSONObject;
}

function toThreadMessageLike(message: UIMessage): ThreadMessageLike {
  const content: ThreadMessageContentItem[] = [];
  for (const part of message.parts) {
    if (part.type === "text" || part.type === "reasoning") {
      content.push({ type: part.type, text: part.text });
      continue;
    }
    if (isToolUIPart(part)) {
      const args = jsonObject(part.input);
      const result =
        part.state === "output-available"
          ? { result: part.output }
          : part.state === "output-error"
            ? { result: { error: part.errorText }, isError: true }
            : part.state === "output-denied"
              ? {
                  result: { error: part.approval.reason ?? "Tool approval denied" },
                  isError: true,
                }
              : {};
      const approval = "approval" in part && part.approval ? part.approval : undefined;
      content.push({
        type: "tool-call",
        toolCallId: part.toolCallId,
        toolName: getToolName(part),
        args,
        argsText: JSON.stringify(args),
        ...result,
        ...(approval
          ? {
              approval: {
                id: approval.id,
                ...(typeof approval.approved === "boolean" ? { approved: approval.approved } : {}),
                ...(typeof approval.reason === "string" ? { reason: approval.reason } : {}),
              },
            }
          : {}),
      });
      continue;
    }
    if (part.type === "source-url") {
      content.push({
        type: "source",
        sourceType: "url",
        id: part.sourceId,
        url: part.url,
        ...(part.title ? { title: part.title } : {}),
      });
      continue;
    }
    if (part.type === "source-document") {
      content.push({
        type: "source",
        sourceType: "document",
        id: part.sourceId,
        title: part.title,
        mediaType: part.mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
      });
      continue;
    }
    if (part.type === "file") {
      content.push({
        type: "file",
        data: part.url,
        mimeType: part.mediaType,
        ...(part.filename ? { filename: part.filename } : {}),
      });
      continue;
    }
    if (part.type.startsWith("data-")) {
      content.push({
        type: "data",
        name: part.type.slice(5),
        data: Reflect.get(part, "data"),
      });
    }
  }
  return { content, id: message.id, role: message.role };
}

function mergeMessages(
  pages: readonly { items: readonly UIMessage[] }[],
  current: readonly ThreadMessageLike[],
) {
  const messages = new Map<string, ThreadMessageLike>();
  for (const page of [...pages].reverse()) {
    for (const message of page.items) {
      if (!messages.has(message.id)) messages.set(message.id, toThreadMessageLike(message));
    }
  }
  for (const message of current) {
    if (message.id) messages.set(message.id, message);
  }
  return [...messages.values()];
}

export function WorkspaceMessageHistoryControl(props: {
  conversationId: string;
  initialMessages: readonly UIMessage[];
  initialNextCursor: string | null;
  workspaceId: string;
}) {
  const queryClient = useContext(QueryClientContext);
  if (!queryClient) return null;
  return <WorkspaceMessageHistoryControlWithQuery {...props} />;
}

function WorkspaceMessageHistoryControlWithQuery({
  conversationId,
  initialMessages,
  initialNextCursor,
  workspaceId,
}: {
  conversationId: string;
  initialMessages: readonly UIMessage[];
  initialNextCursor: string | null;
  workspaceId: string;
}) {
  const t = useTranslations("Workbench");
  const aui = useAui();
  const isRunning = useAuiState((state) => state.thread.isRunning);
  const mountedRef = useRef(true);
  const requestVersionRef = useRef(0);
  const previousConversationIdRef = useRef(conversationId);
  useEffect(() => {
    if (previousConversationIdRef.current !== conversationId) {
      requestVersionRef.current += 1;
      previousConversationIdRef.current = conversationId;
    }
  }, [conversationId]);
  useEffect(() => {
    if (isRunning) requestVersionRef.current += 1;
  }, [isRunning]);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const initialData = useMemo(
    () => ({
      pageParams: [null],
      pages: [{ items: [...initialMessages], nextCursor: initialNextCursor }],
    }),
    [initialMessages, initialNextCursor],
  );
  const query = useInfiniteQuery({
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialData,
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => fetchWorkspaceMessagePage(workspaceId, conversationId, pageParam),
    queryKey: ["workspace", workspaceId, "conversation", conversationId, "messages"],
    refetchOnWindowFocus: false,
    staleTime: 30_000,
  });

  if (!query.hasNextPage && !query.isError) return null;

  const loadEarlier = async () => {
    if (!query.hasNextPage || query.isFetchingNextPage || isRunning) return;
    const requestVersion = requestVersionRef.current;
    const viewport = document.querySelector<HTMLElement>(".workspace-chat-viewport");
    const previousScrollHeight = viewport?.scrollHeight ?? 0;
    const previousScrollTop = viewport?.scrollTop ?? 0;
    const result = await query.fetchNextPage();
    if (
      !mountedRef.current ||
      requestVersion !== requestVersionRef.current ||
      aui.thread().getState().isRunning ||
      !result.data
    ) {
      return;
    }
    const current = aui.thread().getState().messages;
    const messages = mergeMessages(result.data.pages, current);
    aui.thread().reset(messages);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!viewport) return;
        viewport.scrollTop =
          previousScrollTop + Math.max(0, viewport.scrollHeight - previousScrollHeight);
      });
    });
  };

  return (
    <div className="mb-4 flex flex-col items-center gap-2">
      {query.hasNextPage ? (
        <button
          type="button"
          disabled={isRunning || query.isFetchingNextPage}
          onClick={() => void loadEarlier()}
          className="flex items-center gap-2 rounded-full border border-[var(--workspace-border)] bg-[var(--workspace-surface-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--workspace-text-muted)] transition-colors hover:text-[var(--workspace-text-primary)] disabled:cursor-wait disabled:opacity-60"
        >
          {query.isFetchingNextPage ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : null}
          {query.isFetchingNextPage ? t("loadingEarlierMessages") : t("loadEarlierMessages")}
        </button>
      ) : null}
      {query.isError ? (
        <p className="text-xs text-[var(--app-danger)]" role="alert">
          {t("loadEarlierMessagesFailed")}
        </p>
      ) : null}
    </div>
  );
}
