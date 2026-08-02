import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, test, vi } from "vitest";
import { artifactWorkbenchQueryKeys } from "@/features/artifacts/workbench-client";
import { useArtifactLiveUpdates } from "./useArtifactLiveUpdates";

const workspaceId = "00000000-0000-4000-8000-000000000521";
const conversationId = "00000000-0000-4000-8000-000000000522";
const artifactId = "00000000-0000-4000-8000-000000000523";
const streamId = "00000000-0000-4000-8000-000000000524";

function Harness({
  enabled,
  realtimeStreamId = null,
}: {
  enabled: boolean;
  realtimeStreamId?: string | null;
}) {
  useArtifactLiveUpdates({
    artifactId,
    conversationId,
    enabled,
    generationAttemptId: realtimeStreamId,
    kind: "teaching_document",
    workspaceId,
  });
  return null;
}

function PresentationHarness({
  enabled,
  realtimeStreamId,
}: {
  enabled: boolean;
  realtimeStreamId: string;
}) {
  useArtifactLiveUpdates({
    artifactId,
    conversationId,
    enabled,
    generationAttemptId: realtimeStreamId,
    kind: "presentation",
    workspaceId,
  });
  return null;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

test("resumes after the last applied sequence and ignores replayed events", async () => {
  const queryClient = new QueryClient();
  const detailKey = artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId);
  queryClient.setQueryData(detailKey, {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "generating",
    id: artifactId,
    kind: "teaching_document",
    generationAttemptId: streamId,
    generationSequence: 0,
    title: "Prompt title",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  const firstMarkdown = "# Streaming title\n\nToken-visible";
  const firstEvent = {
    delta: firstMarkdown,
    event: "text_delta",
    kind: "teaching_document",
    sequence: 1,
    startOffset: 0,
    version: 3,
  } as const;
  const secondEvent = {
    delta: " body",
    event: "text_delta",
    kind: "teaching_document",
    sequence: 2,
    startOffset: firstMarkdown.length,
    version: 3,
  } as const;
  const completeDocument = `${JSON.stringify(firstEvent)}\n${JSON.stringify(secondEvent)}\n`;
  const encoder = new TextEncoder();
  let firstPull = true;
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            if (firstPull) {
              firstPull = false;
              controller.enqueue(encoder.encode(`${JSON.stringify(firstEvent)}\n`));
              await new Promise((resolve) => setTimeout(resolve, 30));
              return;
            }
            controller.error(new Error("connection lost"));
          },
        }),
      ),
    )
    .mockResolvedValueOnce(new Response(encoder.encode(completeDocument)));
  vi.stubGlobal("fetch", fetchMock);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(<Harness enabled realtimeStreamId={streamId} />, { wrapper: Wrapper });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain(`attemptId=${streamId}`);
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("afterSequence=1");
  await waitFor(() =>
    expect(queryClient.getQueryData(detailKey)).toMatchObject({
      draft: {
        format: "markdown",
        markdown: `${firstMarkdown} body`,
      },
      generationSequence: 2,
    }),
  );
});

test("rebuilds an incremental Presentation preview from replayed page events", async () => {
  const queryClient = new QueryClient();
  const detailKey = artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId);
  queryClient.setQueryData(detailKey, {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    failureCode: null,
    generationAttemptId: streamId,
    generationDraft: { phase: "authoring", schemaVersion: 1 },
    generationSequence: 0,
    generationState: "generating",
    id: artifactId,
    kind: "presentation",
    title: "Prompt title",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  const pptdContent = "pages: [pages/cover.page, pages/body.page]";
  const events = [
    {
      event: "page_updated",
      kind: "presentation",
      pageContent: "pageType: cover\nelements: []",
      pageNumber: 1,
      pagePath: "pages/cover.page",
      pptdContent,
      sequence: 1,
      totalPages: 2,
      version: 1,
    },
    {
      event: "page_updated",
      kind: "presentation",
      pageContent: "pageType: content\nelements: []",
      pageNumber: 2,
      pagePath: "pages/body.page",
      sequence: 2,
      totalPages: 2,
      version: 1,
    },
  ];
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue(
        new Response(
          new TextEncoder().encode(`${events.map((event) => JSON.stringify(event)).join("\n")}\n`),
        ),
      ),
  );
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(<PresentationHarness enabled realtimeStreamId={streamId} />, {
    wrapper: Wrapper,
  });

  await waitFor(() =>
    expect(queryClient.getQueryData(detailKey)).toMatchObject({
      generationDraft: {
        preview: {
          pageMap: {
            "pages/body.page": "pageType: content\nelements: []",
            "pages/cover.page": "pageType: cover\nelements: []",
          },
          pptdContent,
          totalPages: 2,
        },
      },
      generationSequence: 2,
    }),
  );
});

test("renders multiple model patches while committing at most once per animation frame", async () => {
  const queryClient = new QueryClient();
  const detailKey = artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId);
  queryClient.setQueryData(detailKey, {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: null,
    failureCode: null,
    generationState: "generating",
    id: artifactId,
    kind: "teaching_document",
    generationAttemptId: streamId,
    generationSequence: 0,
    title: "Prompt title",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  const body = "逐步显示的正文内容".repeat(12);
  const prefix = "# 流畅更新测试\n\n";
  const firstBody = body.slice(0, 12);
  const secondBody = body.slice(12, 36);
  const finalBody = body.slice(36);
  const events = [
    {
      version: 3,
      kind: "teaching_document",
      event: "text_delta",
      sequence: 1,
      startOffset: 0,
      delta: `${prefix}${firstBody}`,
    },
    {
      version: 3,
      kind: "teaching_document",
      event: "text_delta",
      sequence: 2,
      startOffset: prefix.length + firstBody.length,
      delta: secondBody,
    },
    {
      version: 3,
      kind: "teaching_document",
      event: "text_delta",
      sequence: 3,
      startOffset: prefix.length + firstBody.length + secondBody.length,
      delta: finalBody,
    },
  ];
  const encoder = new TextEncoder();
  let eventIndex = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(
      new Response(
        new ReadableStream<Uint8Array>({
          async pull(controller) {
            const event = events[eventIndex];
            if (!event) {
              controller.close();
              return;
            }
            eventIndex += 1;
            controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
            await new Promise((resolve) => setTimeout(resolve, 30));
          },
        }),
      ),
    ),
  );
  const observedBodyLengths: number[] = [];
  const unsubscribe = queryClient.getQueryCache().subscribe(() => {
    const detail = queryClient.getQueryData<{
      draft?: { format?: string; markdown?: string } | null;
    }>(detailKey);
    const length = detail?.draft?.markdown?.length;
    if (length) observedBodyLengths.push(length);
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(<Harness enabled realtimeStreamId={streamId} />, { wrapper: Wrapper });

  await waitFor(
    () =>
      expect(queryClient.getQueryData(detailKey)).toMatchObject({
        draft: { format: "markdown", markdown: `${prefix}${body}` },
      }),
    { timeout: 3_000 },
  );
  unsubscribe();
  expect(new Set(observedBodyLengths).size).toBeGreaterThanOrEqual(2);
  expect(new Set(observedBodyLengths).size).toBeLessThanOrEqual(events.length);
  expect(observedBodyLengths.at(-1)).toBe(prefix.length + body.length);
});

test("reloads the checkpoint cursor before continuing after a text offset gap", async () => {
  const queryClient = new QueryClient();
  const detailKey = artifactWorkbenchQueryKeys.detail(workspaceId, conversationId, artifactId);
  queryClient.setQueryData(detailKey, {
    artifact: null,
    createdAt: "2026-07-18T00:00:00.000Z",
    draft: { format: "markdown", markdown: "abc" },
    failureCode: null,
    generationState: "generating",
    id: artifactId,
    kind: "teaching_document",
    generationAttemptId: streamId,
    generationSequence: 1,
    title: "Prompt title",
    updatedAt: "2026-07-18T00:00:00.000Z",
    workspaceId,
  });
  const encoder = new TextEncoder();
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(
        encoder.encode(
          `${JSON.stringify({
            delta: "gap",
            event: "text_delta",
            kind: "teaching_document",
            sequence: 3,
            startOffset: 5,
            version: 3,
          })}\n`,
        ),
      ),
    )
    .mockResolvedValueOnce(
      new Response(
        encoder.encode(
          `${[
            {
              delta: "de",
              event: "text_delta",
              kind: "teaching_document",
              sequence: 2,
              startOffset: 3,
              version: 3,
            },
            {
              delta: "f",
              event: "text_delta",
              kind: "teaching_document",
              sequence: 3,
              startOffset: 5,
              version: 3,
            },
          ]
            .map((event) => JSON.stringify(event))
            .join("\n")}\n`,
        ),
      ),
    );
  vi.stubGlobal("fetch", fetchMock);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );

  render(<Harness enabled realtimeStreamId={streamId} />, { wrapper: Wrapper });

  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(String(fetchMock.mock.calls[1]?.[0])).toContain("afterSequence=1");
  await waitFor(() =>
    expect(queryClient.getQueryData(detailKey)).toMatchObject({
      draft: { format: "markdown", markdown: "abcdef" },
      generationSequence: 3,
    }),
  );
});
