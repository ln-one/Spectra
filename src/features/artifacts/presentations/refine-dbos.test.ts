import { expect, test, vi } from "vitest";
import { presentationRefinementStreamKey, readPresentationRefinementEvents } from "./refine-dbos";
import { refinementInstruction } from "./refine-dbos-worker";

test("reads and validates durable refinement events", async () => {
  const runId = "00000000-0000-4000-8000-000000000024";
  const event = {
    baseRevisionId: "00000000-0000-4000-8000-000000000025",
    runId,
    type: "prepared" as const,
  };
  const stream = (async function* () {
    yield JSON.stringify(event);
  })();
  const readStream = vi.fn((_workflowId: string, streamKey: string) => {
    expect(streamKey).toBe(presentationRefinementStreamKey(runId));
    return stream;
  });
  const getClient = vi.fn(async () => ({ readStream }));

  const events = await readPresentationRefinementEvents(runId, getClient as never);
  await expect(events.next()).resolves.toEqual({ done: false, value: event });
  await events.return(undefined);
  expect(readStream).toHaveBeenCalledWith(runId, presentationRefinementStreamKey(runId));
});

test("treats warning-only visual findings as advisory during refinement", () => {
  const instruction = refinementInstruction({
    actor: {
      handle: "refine-test",
      principalId: "00000000-0000-4000-8000-000000000001",
    },
    artifactId: "00000000-0000-4000-8000-000000000002",
    baseRevisionId: "00000000-0000-4000-8000-000000000003",
    conversationId: "00000000-0000-4000-8000-000000000004",
    focus: [{ index: 2, path: "pages/03.page" }],
    instruction: "Make the selected slide use three columns",
    runId: "00000000-0000-4000-8000-000000000005",
    workspaceId: "00000000-0000-4000-8000-000000000006",
  });

  expect(instruction).toContain("Warning-only findings are acceptable");
  expect(instruction).toContain("call FinishTool");
  expect(instruction).toContain("do not spend an unbounded repair loop");
});
