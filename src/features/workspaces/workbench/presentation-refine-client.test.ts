import { afterEach, expect, test, vi } from "vitest";
import type { PresentationEditProposal } from "@/features/artifacts/proposal-contract";
import { acceptPresentationProposal } from "./presentation-refine-client";

const artifactId = "00000000-0000-4000-8000-000000000401";
const conversationId = "00000000-0000-4000-8000-000000000402";
const expectedRevisionId = "00000000-0000-4000-8000-000000000403";
const runId = "00000000-0000-4000-8000-000000000404";
const workspaceId = "00000000-0000-4000-8000-000000000405";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("keeps expected revision in the body only for acceptance", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ acceptedRevisionId: expectedRevisionId }), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
  vi.stubGlobal("fetch", fetchMock);

  await acceptPresentationProposal({
    artifactId,
    conversationId,
    expectedRevisionId,
    proposal: { runId } as PresentationEditProposal,
    workspaceId,
  });

  const [requestUrl, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
  const url = new URL(requestUrl, "http://localhost");
  expect(url.searchParams.toString()).toBe(
    `conversationId=${conversationId}&workspaceId=${workspaceId}`,
  );
  expect(requestInit.body).toBe(JSON.stringify({ expectedRevisionId }));
});
